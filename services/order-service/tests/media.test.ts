jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/s3", () => ({
  getPresignedUploadUrl: jest.fn().mockResolvedValue("https://s3.amazonaws.com/presigned"),
  cdnUrl: jest.fn((key: string) => `https://cdn.threaddash.in/${key}`),
}));
jest.mock("@threaddash/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

import request from "supertest";
import { getPrisma } from "../src/lib/db";
import { getPresignedUploadUrl } from "../src/lib/s3";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockPresign = getPresignedUploadUrl as jest.MockedFunction<typeof getPresignedUploadUrl>;
let app: any;

beforeAll(async () => {
  process.env.CLOUDFRONT_DOMAIN = "https://cdn.threaddash.in";
  app = (await import("../src/index")).default;
});
afterAll(() => { delete process.env.CLOUDFRONT_DOMAIN; });
beforeEach(() => { jest.clearAllMocks(); });

describe("POST /api/media/presign", () => {
  it("returns uploadUrl and cdnUrl for a valid product image request", async () => {
    mockGetPrisma.mockReturnValue({
      product: { findUnique: jest.fn().mockResolvedValue({ id: "prod-123" }) },
    } as any);

    const res = await request(app)
      .post("/api/media/presign")
      .send({ entityType: "product", entityId: "prod-123", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe("https://s3.amazonaws.com/presigned");
    expect(res.body.cdnUrl).toMatch(/^https:\/\/cdn\.threaddash\.in\/products\/prod-123\/.+\.jpeg$/);
    expect(mockPresign).toHaveBeenCalledWith(
      expect.stringMatching(/^products\/prod-123\/.+\.jpeg$/),
      "image/jpeg"
    );
  });

  it("rejects unsupported content types with 400", async () => {
    const res = await request(app)
      .post("/api/media/presign")
      .send({ entityType: "product", entityId: "prod-123", contentType: "image/gif" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects entityId with path traversal characters", async () => {
    const res = await request(app)
      .post("/api/media/presign")
      .send({ entityType: "product", entityId: "../../etc/passwd", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid characters/);
  });

  it("returns 404 when product does not exist", async () => {
    mockGetPrisma.mockReturnValue({
      product: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any);

    const res = await request(app)
      .post("/api/media/presign")
      .send({ entityType: "product", entityId: "nonexistent", contentType: "image/jpeg" });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/media/products/:id/images", () => {
  it("appends cdnUrl to product images array", async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockGetPrisma.mockReturnValue({
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: "prod-1",
          images: ["https://cdn.threaddash.in/products/prod-1/old.jpeg"],
        }),
        update: mockUpdate,
      },
    } as any);

    const res = await request(app)
      .post("/api/media/products/prod-1/images")
      .send({ cdnUrl: "https://cdn.threaddash.in/products/prod-1/new.jpeg" });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: {
        images: [
          "https://cdn.threaddash.in/products/prod-1/old.jpeg",
          "https://cdn.threaddash.in/products/prod-1/new.jpeg",
        ],
      },
    });
  });

  it("rejects URLs not from the configured CDN origin", async () => {
    const res = await request(app)
      .post("/api/media/products/prod-1/images")
      .send({ cdnUrl: "https://attacker.com/malicious.jpeg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CDN origin/);
  });

  it("returns 404 when product not found", async () => {
    mockGetPrisma.mockReturnValue({
      product: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any);

    const res = await request(app)
      .post("/api/media/products/missing/images")
      .send({ cdnUrl: "https://cdn.threaddash.in/x.jpeg" });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/media/brands/:id/logo", () => {
  it("sets logoUrl on the brand", async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockGetPrisma.mockReturnValue({
      brand: {
        findUnique: jest.fn().mockResolvedValue({ id: "brand-nike" }),
        update: mockUpdate,
      },
    } as any);

    const res = await request(app)
      .patch("/api/media/brands/brand-nike/logo")
      .send({ logoUrl: "https://cdn.threaddash.in/brands/nike/logo.png" });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "brand-nike" },
      data: { logoUrl: "https://cdn.threaddash.in/brands/nike/logo.png" },
    });
  });

  it("rejects logoUrl not from the configured CDN origin", async () => {
    const res = await request(app)
      .patch("/api/media/brands/brand-nike/logo")
      .send({ logoUrl: "https://attacker.com/fake-logo.png" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CDN origin/);
  });

  it("returns 404 when brand not found", async () => {
    mockGetPrisma.mockReturnValue({
      brand: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any);

    const res = await request(app)
      .patch("/api/media/brands/nonexistent/logo")
      .send({ logoUrl: "https://cdn.threaddash.in/brands/x/logo.png" });

    expect(res.status).toBe(404);
  });
});
