import request from "supertest";
import express from "express";

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn().mockResolvedValue("OK");
const mockRedisDel = jest.fn().mockResolvedValue(1);

jest.mock("../src/lib/redis", () => ({
  getRedis: () => ({ get: mockRedisGet, set: mockRedisSet, del: mockRedisDel }),
}));

jest.mock("../src/lib/twilio", () => ({
  sendSms: jest.fn().mockResolvedValue(undefined),
}));

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: { findUnique: mockUserFindUnique, create: mockUserCreate },
  })),
}));

process.env.JWT_SECRET = "test-secret-auth-routes";

import authRouter from "../src/routes/auth";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);

const PHONE = "+919876543210";
const OTP = "654321";
const USER = { id: "user-uuid-1", phone: PHONE, role: "CUSTOMER" };

beforeEach(() => jest.clearAllMocks());

describe("POST /auth/send-otp", () => {
  it("returns 400 for missing phone", async () => {
    const res = await request(app).post("/auth/send-otp").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid phone format", async () => {
    const res = await request(app).post("/auth/send-otp").send({ phone: "abc" });
    expect(res.status).toBe(400);
  });

  it("stores OTP in Redis and returns 200 for a valid phone", async () => {
    const res = await request(app).post("/auth/send-otp").send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("OTP sent");
    expect(mockRedisSet).toHaveBeenCalledWith(
      `otp:${PHONE}`,
      expect.stringMatching(/^\d{6}$/),
      "EX",
      300
    );
  });
});

describe("POST /auth/verify-otp", () => {
  it("returns 400 for missing otp", async () => {
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE });
    expect(res.status).toBe(400);
  });

  it("returns 401 when no OTP in Redis", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(401);
  });

  it("returns 401 when OTP does not match", async () => {
    mockRedisGet.mockResolvedValueOnce("000000");
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(401);
  });

  it("returns JWT and existing user on correct OTP", async () => {
    mockRedisGet.mockResolvedValueOnce(OTP);
    mockUserFindUnique.mockResolvedValueOnce(USER);
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.id).toBe(USER.id);
    expect(mockRedisDel).toHaveBeenCalledWith(`otp:${PHONE}`);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("creates a new user on first login", async () => {
    const newUser = { id: "user-new", phone: PHONE, role: "CUSTOMER" };
    mockRedisGet.mockResolvedValueOnce(OTP);
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce(newUser);
    const res = await request(app).post("/auth/verify-otp").send({ phone: PHONE, otp: OTP });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-new");
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: { phone: PHONE, name: "New User" },
    });
  });
});

describe("GET /api/me via requireAuth", () => {
  let meApp: ReturnType<typeof express>;

  beforeAll(async () => {
    const { default: mainApp } = await import("../src/index");
    meApp = mainApp as ReturnType<typeof express>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await request(meApp).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("returns 200 with user payload for a valid JWT", async () => {
    const { signJwt } = await import("@threaddash/auth");
    const token = signJwt({ userId: "u5", role: "CUSTOMER", phone: "+910000000000" });
    const res = await request(meApp).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe("u5");
  });
});
