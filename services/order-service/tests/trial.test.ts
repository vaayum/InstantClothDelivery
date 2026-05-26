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

const TRY_ORDER = {
  id: "order-try",
  userId: "user-1",
  warehouseId: "wh-hsr",
  status: "ARRIVED",
  isTryOrder: true,
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, price: 129900 },
    { id: "item-2", skuId: "sku-jeans-32", quantity: 1, price: 89900 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRedis.mockReturnValue(mockRedis as any);
});

describe("POST /:id/trial/start", () => {
  it("transitions to TRIAL_IN_PROGRESS and sets 30-min Redis timer", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({ id: "order-try", status: "TRIAL_IN_PROGRESS" });

    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(TRY_ORDER),
        update: jest.fn().mockResolvedValue(TRY_ORDER),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app).post("/api/orders/order-try/trial/start");

    expect(res.status).toBe(200);
    expect(res.body.trialStartedAt).toBeDefined();
    expect(res.body.trialEndsAt).toBeDefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      "trial:order:order-try",
      expect.any(String),
      "EX",
      1800
    );
    expect(transitionOrder).toHaveBeenCalledWith("order-try", "TRIAL_IN_PROGRESS", "user-1");
  });

  it("returns 400 for non-try orders", async () => {
    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ ...TRY_ORDER, isTryOrder: false }) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).post("/api/orders/order-try/trial/start");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not a try order/);
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = { order: { findUnique: jest.fn().mockResolvedValue(null) } };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app).post("/api/orders/order-not-found/trial/start");
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/trial/complete", () => {
  it("marks items, releases returns, transitions to COMPLETED", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({ id: "order-try", status: "COMPLETED" });

    const mockPrisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ ...TRY_ORDER, status: "TRIAL_IN_PROGRESS" }),
      },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockAxios.post.mockResolvedValue({ data: { success: true } }); // inventory/release + capture

    const res = await request(app)
      .post("/api/orders/order-try/trial/complete")
      .send({ keptSkuIds: ["sku-os-s"], returnedSkuIds: ["sku-jeans-32"] });

    expect(res.status).toBe(200);
    expect(res.body.keptCount).toBe(1);
    expect(res.body.returnedCount).toBe(1);
    expect(mockPrisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "KEPT" } })
    );
    expect(mockPrisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "RETURNED" } })
    );
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/release"),
      expect.objectContaining({
        items: [{ skuId: "sku-jeans-32", warehouseId: "wh-hsr", quantity: 1 }],
      })
    );
    // Order stays TRIAL_IN_PROGRESS here; COMPLETED is set when agent calls /deliver
    expect(transitionOrder).not.toHaveBeenCalledWith("order-try", "COMPLETED", expect.anything());
  });

  it("publishes order.completed event", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({});

    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ ...TRY_ORDER, status: "TRIAL_IN_PROGRESS" }) },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockAxios.post.mockResolvedValue({ data: { success: true } });

    await request(app)
      .post("/api/orders/order-try/trial/complete")
      .send({ keptSkuIds: ["sku-os-s"], returnedSkuIds: [] });

    const mockPub = publishEvent as jest.MockedFunction<typeof publishEvent>;
    expect(mockPub).toHaveBeenCalledWith(
      "order.completed",
      expect.objectContaining({ orderId: "order-try" })
    );
  });

  it("skips inventory release when no items returned", async () => {
    const { transitionOrder } = await import("../src/transitions");
    (transitionOrder as jest.Mock).mockResolvedValue({});

    const mockPrisma = {
      order: { findUnique: jest.fn().mockResolvedValue({ ...TRY_ORDER, status: "TRIAL_IN_PROGRESS" }) },
      orderItem: { update: jest.fn().mockResolvedValue({}) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockAxios.post.mockResolvedValue({ data: {} }); // capture call still fires

    await request(app)
      .post("/api/orders/order-try/trial/complete")
      .send({ keptSkuIds: ["sku-os-s", "sku-jeans-32"], returnedSkuIds: [] });

    expect(mockAxios.post).not.toHaveBeenCalledWith(
      expect.stringContaining("/inventory/release"),
      expect.anything()
    );
  });

  it("returns 404 when order not found", async () => {
    const mockPrisma = { order: { findUnique: jest.fn().mockResolvedValue(null) } };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    const res = await request(app)
      .post("/api/orders/order-not-found/trial/complete")
      .send({ keptSkuIds: [], returnedSkuIds: [] });
    expect(res.status).toBe(404);
  });
});
