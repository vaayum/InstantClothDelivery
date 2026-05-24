jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "staff-1", role: "WAREHOUSE_STAFF", phone: "+919876500002" };
    next();
  },
}));

import request from "supertest";
import { getPrisma } from "../src/lib/db";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => { jest.clearAllMocks(); });

const ORDER_ITEM = {
  id: "item-1",
  orderId: "order-1",
  skuId: "sku-os-s",
  quantity: 1,
  order: { id: "order-1", warehouseId: "wh-hsr-layout" },
};

function makeMockPrisma() {
  const base: any = {
    orderItem: { findUnique: jest.fn().mockResolvedValue(ORDER_ITEM) },
    return: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "return-1" }),
    },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(base)),
  };
  return base;
}

describe("POST /returns/receive", () => {
  it("creates Return and restocks inventory for GOOD condition", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "GOOD", reason: "Changed mind" });

    expect(res.status).toBe(200);
    expect(mockPrisma.return.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderItemId: "item-1",
          condition: "GOOD",
          refundAmount: 0,
          processedAt: expect.any(Date),
        }),
      })
    );
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr-layout" } },
        data: { quantityAvailable: { increment: 1 } },
      })
    );
  });

  it("creates Return but does NOT restock for DAMAGED condition", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "DAMAGED" });

    expect(res.status).toBe(200);
    expect(mockPrisma.return.create).toHaveBeenCalled();
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it("creates Return but does NOT restock for TAGS_MISSING condition", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "TAGS_MISSING" });

    expect(res.status).toBe(200);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it("returns 409 when return already exists for this orderItemId", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.return.findUnique.mockResolvedValue({ id: "existing-return" });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "GOOD" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("returns 404 when orderItem not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.orderItem.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "bad-id", condition: "GOOD" });

    expect(res.status).toBe(404);
  });

  it("returns 400 when condition is invalid", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ orderItemId: "item-1", condition: "PERFECT" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when orderItemId is missing", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/returns/receive")
      .send({ condition: "GOOD" });

    expect(res.status).toBe(400);
  });
});
