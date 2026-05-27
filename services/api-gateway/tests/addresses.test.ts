jest.mock("@prisma/client", () => {
  const mockPrisma = {
    address: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn() },
    warehouse: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma), __mock: mockPrisma };
});
jest.mock("axios");
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "user-1", role: "CUSTOMER", phone: "+919876500001" };
    next();
  },
}));

import request from "supertest";
import axios from "axios";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mock: mockPrisma } = require("@prisma/client");
const mockAxios = axios as jest.Mocked<typeof axios>;

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});
beforeEach(() => { jest.clearAllMocks(); });

const CREATED_ADDRESS = {
  id: "addr-new", userId: "user-1", label: "Home",
  formattedAddress: "Koramangala", lat: 12.9352, lng: 77.6245, isSafeDrop: false, safeDropNote: null,
  createdAt: new Date().toISOString(),
};
const SEED_WAREHOUSES = [
  { id: "wh-hsr", lat: 12.9116, lng: 77.6389, activeOrderCount: 2 },
];

describe("POST /api/addresses", () => {
  it("saves address, pins warehouse, returns enriched response", async () => {
    mockPrisma.address.create.mockResolvedValue(CREATED_ADDRESS);
    mockPrisma.warehouse.findMany.mockResolvedValue(SEED_WAREHOUSES);
    mockPrisma.user.update.mockResolvedValue({});
    mockAxios.post.mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } });

    const res = await request(app).post("/api/addresses").send({
      label: "Home", formattedAddress: "Koramangala", lat: 12.9352, lng: 77.6245,
    });

    expect(res.status).toBe(201);
    expect(res.body.pinnedWarehouseId).toBe("wh-hsr");
    expect(res.body.etaMinutes).toBe(22);
    expect(res.body.deliveryAvailable).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { pinnedWarehouseId: "wh-hsr", pinnedEtaMinutes: 22 },
    });
  });

  it("returns deliveryAvailable: false when routing returns no warehouse_id", async () => {
    mockPrisma.address.create.mockResolvedValue(CREATED_ADDRESS);
    mockPrisma.warehouse.findMany.mockResolvedValue(SEED_WAREHOUSES);
    mockAxios.post.mockResolvedValueOnce({ data: {} });

    const res = await request(app).post("/api/addresses").send({
      label: "Remote", formattedAddress: "Faraway", lat: 0, lng: 0,
    });

    expect(res.status).toBe(201);
    expect(res.body.deliveryAvailable).toBe(false);
    expect(res.body.pinnedWarehouseId).toBeNull();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/addresses").send({ label: "Home" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/addresses/:id/set-primary", () => {
  it("re-pins and returns warehouseChanged: true when warehouse changes", async () => {
    mockPrisma.address.findFirst.mockResolvedValue(CREATED_ADDRESS);
    mockPrisma.user.findUnique.mockResolvedValue({ pinnedWarehouseId: "wh-old" });
    mockPrisma.warehouse.findMany.mockResolvedValue(SEED_WAREHOUSES);
    mockPrisma.user.update.mockResolvedValue({});
    mockAxios.post.mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } });

    const res = await request(app).post("/api/addresses/addr-new/set-primary");

    expect(res.status).toBe(200);
    expect(res.body.warehouseChanged).toBe(true);
    expect(res.body.pinnedWarehouseId).toBe("wh-hsr");
  });

  it("returns warehouseChanged: false when same warehouse is selected", async () => {
    mockPrisma.address.findFirst.mockResolvedValue(CREATED_ADDRESS);
    mockPrisma.user.findUnique.mockResolvedValue({ pinnedWarehouseId: "wh-hsr" });
    mockPrisma.warehouse.findMany.mockResolvedValue(SEED_WAREHOUSES);
    mockPrisma.user.update.mockResolvedValue({});
    mockAxios.post.mockResolvedValueOnce({ data: { warehouse_id: "wh-hsr", eta_minutes: 22 } });

    const res = await request(app).post("/api/addresses/addr-new/set-primary");

    expect(res.status).toBe(200);
    expect(res.body.warehouseChanged).toBe(false);
  });

  it("returns 404 when address does not belong to the user", async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/addresses/addr-other/set-primary");
    expect(res.status).toBe(404);
  });
});
