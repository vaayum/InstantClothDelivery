jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("axios");
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "staff-1", role: "WAREHOUSE_STAFF", phone: "+919876500002" };
    next();
  },
}));

import request from "supertest";
import axios from "axios";
import { getPrisma } from "../src/lib/db";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => { jest.clearAllMocks(); });

const TASK_PENDING = {
  id: "task-1",
  orderId: "order-1",
  warehouseId: "wh-hsr-layout",
  status: "PENDING",
  slaDeadline: new Date(Date.now() + 30 * 60 * 1000),
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, status: "PENDING", scannedAt: null },
  ],
};

const TASK_ALL_FOUND = {
  ...TASK_PENDING,
  status: "IN_PROGRESS",
  items: [
    { id: "item-1", skuId: "sku-os-s", quantity: 1, status: "FOUND", scannedAt: new Date() },
  ],
};

function makeMockPrisma() {
  const base: any = {
    pickingTask: {
      findMany: jest.fn().mockResolvedValue([TASK_PENDING]),
      findUnique: jest.fn().mockResolvedValue(TASK_PENDING),
      update: jest.fn().mockResolvedValue({}),
    },
    pickingItem: { update: jest.fn().mockResolvedValue({}) },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(base)),
  };
  return base;
}

describe("GET /picking-queue/:warehouseId", () => {
  it("returns tasks ordered by slaDeadline asc", async () => {
    const earlier = new Date(Date.now() + 10 * 60 * 1000);
    const later = new Date(Date.now() + 30 * 60 * 1000);
    const tasks = [
      { ...TASK_PENDING, id: "task-1", slaDeadline: earlier },
      { ...TASK_PENDING, id: "task-2", slaDeadline: later },
    ];
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findMany.mockResolvedValue(tasks);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).get("/picking-queue/wh-hsr-layout");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe("task-1");
    expect(mockPrisma.pickingTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warehouseId: "wh-hsr-layout", status: { in: ["PENDING", "IN_PROGRESS"] } },
        orderBy: { slaDeadline: "asc" },
      })
    );
  });
});

describe("POST /picking-queue/:orderId/pick-item", () => {
  it("marks item FOUND and transitions task to IN_PROGRESS", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "FOUND" });

    expect(res.status).toBe(200);
    expect(mockPrisma.pickingItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({ status: "FOUND" }),
      })
    );
    expect(mockPrisma.pickingTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "IN_PROGRESS" } })
    );
  });

  it("marks item NOT_AVAILABLE", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "NOT_AVAILABLE" });

    expect(res.status).toBe(200);
    expect(mockPrisma.pickingItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NOT_AVAILABLE" }) })
    );
  });

  it("returns 409 when item already scanned", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue({
      ...TASK_PENDING,
      items: [{ ...TASK_PENDING.items[0], status: "FOUND" }],
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "FOUND" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already scanned/i);
  });

  it("returns 404 when task not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-999/pick-item")
      .send({ skuId: "sku-os-s", status: "FOUND" });

    expect(res.status).toBe(404);
  });

  it("returns 400 when status is invalid", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .post("/picking-queue/order-1/pick-item")
      .send({ skuId: "sku-os-s", status: "MAYBE" });

    expect(res.status).toBe(400);
  });
});

describe("POST /picking-queue/:orderId/pack-ready", () => {
  it("packs task, confirms inventory, calls order-service READY_FOR_PICKUP", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(TASK_ALL_FOUND);
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });

    const res = await request(app).post("/picking-queue/order-1/pack-ready");

    expect(res.status).toBe(200);
    expect(mockPrisma.pickingTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PACKED" } })
    );
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { skuId_warehouseId: { skuId: "sku-os-s", warehouseId: "wh-hsr-layout" } },
        data: { quantityReserved: { decrement: 1 } },
      })
    );
    expect(mockAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining("/order-1/status"),
      { status: "READY_FOR_PICKUP" }
    );
  });

  it("returns 400 when any item still PENDING", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/picking-queue/order-1/pack-ready");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scanned/i);
  });

  it("returns 502 when order-service call fails; task is already PACKED", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(TASK_ALL_FOUND);
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).post("/picking-queue/order-1/pack-ready");

    expect(res.status).toBe(502);
    expect(mockPrisma.pickingTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PACKED" } })
    );
  });

  it("returns 404 when task not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.pickingTask.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/picking-queue/order-999/pack-ready");

    expect(res.status).toBe(404);
  });
});
