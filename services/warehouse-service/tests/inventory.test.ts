jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));

import request from "supertest";
import { getPrisma } from "../src/lib/db";

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

const mockTx = {
  inventory: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
const mockPrisma = {
  $transaction: jest.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrisma.mockReturnValue(mockPrisma as any);
});

describe("POST /inventory/reserve", () => {
  it("returns 200 and decrements availability on sufficient stock", async () => {
    mockTx.inventory.findUnique.mockResolvedValue({ quantityAvailable: 8, quantityReserved: 0 });
    mockTx.inventory.update.mockResolvedValue({});

    const res = await request(app)
      .post("/inventory/reserve")
      .send({ orderId: "order-abc", items: [{ skuId: "sku-os-s", warehouseId: "wh-hsr", quantity: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockTx.inventory.update).toHaveBeenCalledWith({
      where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr" } },
      data: { quantityAvailable: { decrement: 2 }, quantityReserved: { increment: 2 } },
    });
  });

  it("returns 409 when quantityAvailable < requested quantity", async () => {
    mockTx.inventory.findUnique.mockResolvedValue({ quantityAvailable: 1, quantityReserved: 0 });
    const res = await request(app)
      .post("/inventory/reserve")
      .send({ orderId: "order-abc", items: [{ skuId: "sku-os-s", warehouseId: "wh-hsr", quantity: 5 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Insufficient stock/);
    expect(mockTx.inventory.update).not.toHaveBeenCalled();
  });

  it("returns 409 when inventory row does not exist", async () => {
    mockTx.inventory.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/inventory/reserve")
      .send({ orderId: "order-abc", items: [{ skuId: "sku-missing", warehouseId: "wh-hsr", quantity: 1 }] });
    expect(res.status).toBe(409);
  });

  it("returns 400 when items array is empty", async () => {
    const res = await request(app).post("/inventory/reserve").send({ orderId: "order-abc", items: [] });
    expect(res.status).toBe(400);
  });
});

describe("POST /inventory/release", () => {
  it("returns 200 and increments availability", async () => {
    mockTx.inventory.update.mockResolvedValue({});
    const res = await request(app)
      .post("/inventory/release")
      .send({ items: [{ skuId: "sku-os-s", warehouseId: "wh-hsr", quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockTx.inventory.update).toHaveBeenCalledWith({
      where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr" } },
      data: { quantityAvailable: { increment: 2 }, quantityReserved: { decrement: 2 } },
    });
  });

  it("returns 400 when items missing from body", async () => {
    const res = await request(app).post("/inventory/release").send({});
    expect(res.status).toBe(400);
  });
});

describe("GET /inventory/availability", () => {
  it("returns availability map keyed by skuId", async () => {
    const mockPrisma = {
      inventory: {
        findMany: jest.fn().mockResolvedValue([
          { skuId: "sku-1", quantityAvailable: 3 },
          { skuId: "sku-2", quantityAvailable: 0 },
        ]),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app)
      .get("/inventory/availability")
      .query({ warehouseId: "wh-hsr", skuIds: "sku-1,sku-2" });

    expect(res.status).toBe(200);
    expect(res.body["sku-1"]).toEqual({ quantityAvailable: 3, available: true });
    expect(res.body["sku-2"]).toEqual({ quantityAvailable: 0, available: false });
  });

  it("returns available: false for skuIds with no inventory row", async () => {
    const mockPrisma = {
      inventory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);

    const res = await request(app)
      .get("/inventory/availability")
      .query({ warehouseId: "wh-hsr", skuIds: "sku-ghost" });

    expect(res.status).toBe(200);
    expect(res.body["sku-ghost"]).toEqual({ quantityAvailable: 0, available: false });
  });

  it("returns 400 when warehouseId is missing", async () => {
    const res = await request(app)
      .get("/inventory/availability")
      .query({ skuIds: "sku-1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when skuIds is missing", async () => {
    const res = await request(app)
      .get("/inventory/availability")
      .query({ warehouseId: "wh-hsr" });
    expect(res.status).toBe(400);
  });
});
