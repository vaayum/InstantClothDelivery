jest.mock("@prisma/client", () => {
  const mockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    warehouse: { findUnique: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma), __mock: mockPrisma };
});
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "user-1", role: "CUSTOMER", phone: "+919876500001" };
    next();
  },
}));

import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mock: mockPrisma } = require("@prisma/client");

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});
beforeEach(() => { jest.clearAllMocks(); });

describe("PATCH /api/users/me/pinned-warehouse", () => {
  it("updates pinnedWarehouseId and returns warehouseChanged: true when warehouse changes", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ pinnedWarehouseId: "wh-old" });
    mockPrisma.warehouse.findUnique.mockResolvedValue({ id: "wh-hsr", status: "ACTIVE" });
    mockPrisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .patch("/api/users/me/pinned-warehouse")
      .send({ warehouseId: "wh-hsr" });

    expect(res.status).toBe(200);
    expect(res.body.warehouseChanged).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { pinnedWarehouseId: "wh-hsr" },
    });
  });

  it("returns warehouseChanged: false when the same warehouse is set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ pinnedWarehouseId: "wh-hsr" });
    mockPrisma.warehouse.findUnique.mockResolvedValue({ id: "wh-hsr", status: "ACTIVE" });
    mockPrisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .patch("/api/users/me/pinned-warehouse")
      .send({ warehouseId: "wh-hsr" });

    expect(res.status).toBe(200);
    expect(res.body.warehouseChanged).toBe(false);
  });

  it("returns 404 when warehouse does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ pinnedWarehouseId: null });
    mockPrisma.warehouse.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/users/me/pinned-warehouse")
      .send({ warehouseId: "wh-ghost" });

    expect(res.status).toBe(404);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when warehouseId is missing", async () => {
    const res = await request(app).patch("/api/users/me/pinned-warehouse").send({});
    expect(res.status).toBe(400);
  });
});
