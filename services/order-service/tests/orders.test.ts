jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/redis", () => ({ getRedis: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("axios");
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "user-1", role: "CUSTOMER", phone: "+919876500001" };
    next();
  },
}));
jest.mock("../src/transitions", () => ({
  transitionOrder: jest.fn().mockResolvedValue({}),
  isValidTransition: jest.fn().mockReturnValue(true),
}));

import request from "supertest";
import axios from "axios";
import { getPrisma } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { publishEvent } from "../src/lib/rabbitmq";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

const mockRedis = {
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
};

const SEED_SKUS = [
  { id: "sku-os-s", productId: "prod-os", product: { id: "prod-os", price: 129900 } },
];
const SEED_ADDRESS = { id: "addr-1", userId: "user-1", lat: 12.9352, lng: 77.6245, formattedAddress: "Koramangala" };
const SEED_WAREHOUSE = { id: "wh-hsr", lat: 12.9116, lng: 77.6389, activeOrderCount: 2, status: "ACTIVE" };
const CREATED_ORDER = {
  id: "order-new", userId: "user-1", addressId: "addr-1", warehouseId: "wh-hsr",
  status: "PENDING", paymentMethod: "UPI", isTryOrder: false, totalAmount: 129900, deliveryFee: 0,
  items: [{ id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900, status: "PENDING" }],
};

function setupHappyPath() {
  const mockPrisma = {
    sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
    address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
    warehouse: {
      findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]),
      update: jest.fn().mockResolvedValue({}),
    },
    order: { create: jest.fn().mockResolvedValue(CREATED_ORDER) },
  };
  mockGetPrisma.mockReturnValue(mockPrisma as any);
  mockGetRedis.mockReturnValue(mockRedis as any);
  mockAxios.post
    .mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } })
    .mockResolvedValueOnce({ data: { success: true } });
  return mockPrisma;
}

beforeEach(() => { jest.clearAllMocks(); });

describe("POST /", () => {
  it("returns 201 with order and estimatedMinutes", async () => {
    const mockPrisma = setupHappyPath();
    const res = await request(app).post("/").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }],
      addressId: "addr-1",
      paymentMethod: "UPI",
      isTryOrder: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("order-new");
    expect(res.body.estimatedMinutes).toBe(22);
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", warehouseId: "wh-hsr", paymentMethod: "UPI" }),
      })
    );
  });

  it("publishes order.placed event", async () => {
    setupHappyPath();
    const mockPub = publishEvent as jest.MockedFunction<typeof publishEvent>;
    await request(app).post("/").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(mockPub).toHaveBeenCalledWith("order.placed", expect.objectContaining({ orderId: "order-new", warehouseId: "wh-hsr" }));
  });

  it("sets sla:order Redis key with 7200s TTL", async () => {
    setupHappyPath();
    await request(app).post("/").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(mockRedis.set).toHaveBeenCalledWith("sla:order:order-new", expect.any(String), "EX", 7200);
  });

  it("adds COD delivery fee of 2000 paise", async () => {
    const mockPrisma = setupHappyPath();
    await request(app).post("/").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "COD" });
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveryFee: 2000 }) })
    );
  });

  it("returns 400 when items is empty", async () => {
    const res = await request(app).post("/").send({ items: [], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when SKU not found in DB", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue([]) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]) },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    const res = await request(app).post("/").send({ items: [{ skuId: "sku-nonexistent", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SKU/);
  });

  it("returns 409 when warehouse-service reports insufficient stock", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]), update: jest.fn() },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.post
      .mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } })
      .mockRejectedValueOnce({ response: { status: 409, data: { error: "Insufficient stock for SKU sku-os-s" } } });
    const res = await request(app).post("/").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(409);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("returns 503 when routing-service is unavailable", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([SEED_WAREHOUSE]) },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.post.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await request(app).post("/").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(503);
  });
});
