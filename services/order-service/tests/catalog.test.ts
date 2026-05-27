jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("axios");

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

const SEED_PRODUCTS = [
  {
    id: "prod-1", name: "Linen Shirt", brand: "Marks", category: "Shirts",
    description: null, price: 129900, images: [], isActive: true, isTryable: true,
    createdAt: new Date().toISOString(),
    skus: [
      { id: "sku-m", productId: "prod-1", size: "M", color: "Navy", barcode: "BAR-M", createdAt: new Date().toISOString() },
      { id: "sku-l", productId: "prod-1", size: "L", color: "Navy", barcode: "BAR-L", createdAt: new Date().toISOString() },
    ],
  },
];

describe("GET /api/catalog (with warehouseId)", () => {
  it("enriches SKUs with availability flags", async () => {
    mockGetPrisma.mockReturnValue({
      product: { findMany: jest.fn().mockResolvedValue(SEED_PRODUCTS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([]) },
    } as any);
    mockAxios.get.mockResolvedValueOnce({
      data: {
        "sku-m": { quantityAvailable: 3, available: true },
        "sku-l": { quantityAvailable: 0, available: false },
      },
    });

    const res = await request(app).get("/api/catalog?warehouseId=wh-hsr");

    expect(res.status).toBe(200);
    expect(res.body[0].skus[0]).toMatchObject({ id: "sku-m", available: true, quantityAvailable: 3 });
    expect(res.body[0].skus[1]).toMatchObject({ id: "sku-l", available: false, quantityAvailable: 0 });
  });

  it("includes alternativeWarehouseId on OOS SKUs available elsewhere", async () => {
    mockGetPrisma.mockReturnValue({
      product: { findMany: jest.fn().mockResolvedValue(SEED_PRODUCTS) },
      warehouse: { findMany: jest.fn().mockResolvedValue([{ id: "wh-alt" }]) },
    } as any);
    mockAxios.get
      .mockResolvedValueOnce({
        data: {
          "sku-m": { quantityAvailable: 3, available: true },
          "sku-l": { quantityAvailable: 0, available: false },
        },
      })
      .mockResolvedValueOnce({
        data: { "sku-l": { quantityAvailable: 2, available: true } },
      });

    const res = await request(app).get("/api/catalog?warehouseId=wh-hsr");

    expect(res.status).toBe(200);
    expect(res.body[0].skus[1].alternativeWarehouseId).toBe("wh-alt");
  });

  it("returns products without availability fields when warehouseId is absent", async () => {
    mockGetPrisma.mockReturnValue({
      product: { findMany: jest.fn().mockResolvedValue(SEED_PRODUCTS) },
    } as any);

    const res = await request(app).get("/api/catalog");

    expect(res.status).toBe(200);
    expect(mockAxios.get).not.toHaveBeenCalled();
    expect(res.body[0].skus[0].available).toBeUndefined();
  });
});
