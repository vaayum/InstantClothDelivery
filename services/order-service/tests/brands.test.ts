jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));

import request from "supertest";
import { getPrisma } from "../src/lib/db";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
let app: any;

beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/brands", () => {
  it("returns all brands ordered by name", async () => {
    mockGetPrisma.mockReturnValue({
      brand: {
        findMany: jest.fn().mockResolvedValue([
          { id: "b1", name: "Nike", slug: "nike", logoUrl: null, createdAt: new Date() },
          { id: "b2", name: "Zara", slug: "zara", logoUrl: "https://cdn.threaddash.in/brands/zara/logo.png", createdAt: new Date() },
        ]),
      },
    } as any);

    const res = await request(app).get("/api/brands");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: "b1", name: "Nike", logoUrl: null });
    expect(res.body[1]).toMatchObject({ id: "b2", logoUrl: "https://cdn.threaddash.in/brands/zara/logo.png" });
  });
});
