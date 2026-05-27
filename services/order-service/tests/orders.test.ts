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
const SEED_USER = { id: "user-1", pinnedWarehouseId: "wh-hsr", pinnedEtaMinutes: 22 };
const CREATED_ORDER = {
  id: "order-new", userId: "user-1", addressId: "addr-1", warehouseId: "wh-hsr",
  status: "PENDING", paymentMethod: "UPI", isTryOrder: false, totalAmount: 129900, deliveryFee: 0,
  items: [{ id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900, status: "PENDING" }],
};

function setupHappyPath() {
  const mockPrisma = {
    sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
    address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
    user: { findUnique: jest.fn().mockResolvedValue(SEED_USER) },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({ id: "wh-hsr", status: "ACTIVE" }),
      update: jest.fn().mockResolvedValue({}),
    },
    order: { create: jest.fn().mockResolvedValue(CREATED_ORDER) },
  };
  mockGetPrisma.mockReturnValue(mockPrisma as any);
  mockGetRedis.mockReturnValue(mockRedis as any);
  // availability pre-flight GET, then reserve POST, then payment POST (catch-all)
  mockAxios.get = jest.fn().mockResolvedValueOnce({
    data: { "sku-os-s": { quantityAvailable: 5, available: true } },
  }) as any;
  mockAxios.post
    .mockResolvedValueOnce({ data: { success: true } })
    .mockResolvedValue({ data: {} });
  return mockPrisma;
}

beforeEach(() => { jest.clearAllMocks(); });

describe("POST /", () => {
  it("returns 201 with order and estimatedMinutes", async () => {
    const mockPrisma = setupHappyPath();
    const res = await request(app).post("/api/orders").send({
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
    await request(app).post("/api/orders").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(mockPub).toHaveBeenCalledWith("order.placed", expect.objectContaining({ orderId: "order-new", warehouseId: "wh-hsr" }));
  });

  it("sets sla:order Redis key with 7200s TTL", async () => {
    setupHappyPath();
    await request(app).post("/api/orders").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(mockRedis.set).toHaveBeenCalledWith("sla:order:order-new", expect.any(String), "EX", 7200);
  });

  it("adds COD delivery fee of 2000 paise", async () => {
    const mockPrisma = setupHappyPath();
    await request(app).post("/api/orders").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "COD" });
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveryFee: 2000 }) })
    );
  });

  it("returns 400 when items is empty", async () => {
    const res = await request(app).post("/api/orders").send({ items: [], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when SKU not found in DB", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue([]) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      user: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn(), update: jest.fn() },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    const res = await request(app).post("/api/orders").send({ items: [{ skuId: "sku-nonexistent", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SKU/);
  });

  it("returns 409 when warehouse-service reports insufficient stock on reserve", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      user: { findUnique: jest.fn().mockResolvedValue(SEED_USER) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: "wh-hsr", status: "ACTIVE" }),
        update: jest.fn(),
      },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.get = jest.fn().mockResolvedValueOnce({
      data: { "sku-os-s": { quantityAvailable: 5, available: true } },
    }) as any;
    mockAxios.post
      .mockRejectedValueOnce({ response: { status: 409, data: { error: "Insufficient stock for SKU sku-os-s" } } });
    const res = await request(app).post("/api/orders").send({ items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI" });
    expect(res.status).toBe(409);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("returns 400 when user has no pinned warehouse", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      user: { findUnique: jest.fn().mockResolvedValue({ ...SEED_USER, pinnedWarehouseId: null }) },
      warehouse: { findUnique: jest.fn(), update: jest.fn() },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    const res = await request(app).post("/api/orders").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("no_delivery_address");
  });

  it("returns 409 with unavailableSkuIds when pre-flight detects OOS", async () => {
    const mockPrisma = {
      sku: { findMany: jest.fn().mockResolvedValue(SEED_SKUS) },
      address: { findFirst: jest.fn().mockResolvedValue(SEED_ADDRESS) },
      user: { findUnique: jest.fn().mockResolvedValue(SEED_USER) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: "wh-hsr", status: "ACTIVE" }),
        update: jest.fn(),
      },
      order: { create: jest.fn() },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.get = jest.fn().mockResolvedValueOnce({
      data: { "sku-os-s": { quantityAvailable: 0, available: false } },
    }) as any;

    const res = await request(app).post("/api/orders").send({
      items: [{ skuId: "sku-os-s", quantity: 1 }], addressId: "addr-1", paymentMethod: "UPI",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("items_unavailable");
    expect(res.body.unavailableSkuIds).toContain("sku-os-s");
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });
});

const EXISTING_ORDER = {
  id: "order-existing",
  userId: "user-1",
  warehouseId: "wh-hsr",
  status: "PENDING" as const,
  paymentMethod: "UPI",
  items: [
    {
      id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900, status: "PENDING",
      sku: { size: "S", color: "White", product: { name: "Classic Oxford Shirt" } },
    },
  ],
  address: { id: "addr-1", formattedAddress: "Koramangala" },
};

describe("GET /:id", () => {
  it("returns 200 with order for the authenticated user", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(EXISTING_ORDER) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).get("/api/orders/order-existing");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("order-existing");
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).get("/api/orders/order-not-found");
    expect(res.status).toBe(404);
  });

  it("returns 403 when order belongs to a different user", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ ...EXISTING_ORDER, userId: "user-other" }) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).get("/api/orders/order-existing");
    expect(res.status).toBe(403);
  });
});

describe("PATCH /:id/status", () => {
  it("returns 200 and calls transitionOrder", async () => {
    const { transitionOrder } = await import("../src/transitions");
    const mockTransition = transitionOrder as jest.MockedFunction<typeof transitionOrder>;
    mockTransition.mockResolvedValue({ id: "order-existing", status: "WAREHOUSE_PROCESSING" } as any);

    const res = await request(app)
      .patch("/api/orders/order-existing/status")
      .send({ status: "WAREHOUSE_PROCESSING" });

    expect(res.status).toBe(200);
    expect(mockTransition).toHaveBeenCalledWith("order-existing", "WAREHOUSE_PROCESSING", "user-1");
  });

  it("returns 409 when transition is invalid", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockRejectedValue(
      new Error("Cannot transition from COMPLETED to PENDING")
    );
    const res = await request(app)
      .patch("/api/orders/order-existing/status")
      .send({ status: "PENDING" });
    expect(res.status).toBe(409);
  });
});

describe("POST /:id/cancel", () => {
  it("transitions to CANCELLED and releases inventory", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({ id: "order-existing", status: "CANCELLED" });

    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(EXISTING_ORDER) },
      warehouse: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(mockRedis as any);
    mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

    const res = await request(app).post("/api/orders/order-existing/cancel");

    expect(res.status).toBe(200);
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/release"),
      expect.objectContaining({ items: expect.any(Array) })
    );
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).post("/api/orders/order-not-found/cancel");
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/mark-absent", () => {
  it("increments absentAttempts and returns updated count", async () => {
    const mockPrisma = {
      deliveryAssignment: {
        findUnique: jest.fn().mockResolvedValue({ orderId: "order-existing", absentAttempts: 1 }),
        update: jest.fn().mockResolvedValue({ absentAttempts: 2 }),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).post("/api/orders/order-existing/mark-absent");
    expect(res.status).toBe(200);
    expect(res.body.absentAttempts).toBe(2);
  });

  it("publishes order.absent_threshold_reached on 3rd absence", async () => {
    const mockPrisma = {
      deliveryAssignment: {
        findUnique: jest.fn().mockResolvedValue({ orderId: "order-existing", absentAttempts: 2 }),
        update: jest.fn().mockResolvedValue({ absentAttempts: 3 }),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    await request(app).post("/api/orders/order-existing/mark-absent");

    const mockPub = publishEvent as jest.MockedFunction<typeof publishEvent>;
    expect(mockPub).toHaveBeenCalledWith(
      "order.absent_threshold_reached",
      expect.objectContaining({ orderId: "order-existing", attempts: 3 })
    );
  });

  it("returns 404 when no assignment found", async () => {
    const mockPrisma = {
      deliveryAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).post("/api/orders/order-not-found/mark-absent");
    expect(res.status).toBe(404);
  });
});
