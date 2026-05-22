import jwt from "jsonwebtoken";
import { signJwt, verifyJwt, requireAuth } from "../src/index";
import type { JwtPayload } from "../src/index";
import type { Request, Response, NextFunction } from "express";

const SECRET = "test-secret-phase0";

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

describe("signJwt", () => {
  it("returns a string", () => {
    const token = signJwt({ userId: "u1", role: "CUSTOMER", phone: "+919999999999" });
    expect(typeof token).toBe("string");
  });

  it("encodes expected payload", () => {
    const input: JwtPayload = { userId: "u1", role: "CUSTOMER", phone: "+919999999999" };
    const token = signJwt(input);
    const decoded = jwt.verify(token, SECRET) as JwtPayload;
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("CUSTOMER");
    expect(decoded.phone).toBe("+919999999999");
  });
});

describe("verifyJwt", () => {
  it("decodes a valid token", () => {
    const token = signJwt({ userId: "u2", role: "AGENT", phone: "+918888888888" });
    const payload = verifyJwt(token);
    expect(payload.userId).toBe("u2");
    expect(payload.role).toBe("AGENT");
  });

  it("throws on tampered token", () => {
    expect(() => verifyJwt("not.a.real.token")).toThrow();
  });

  it("throws on expired token", () => {
    const expired = jwt.sign(
      { userId: "u3", role: "CUSTOMER", phone: "+917777777777" },
      SECRET,
      { expiresIn: -1 }
    );
    expect(() => verifyJwt(expired)).toThrow();
  });
});

describe("requireAuth middleware", () => {
  const mockNext = jest.fn() as unknown as NextFunction;

  function mockRes(): Response {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  function mockReq(headers: Record<string, string> = {}): Request {
    return { headers } as unknown as Request;
  }

  beforeEach(() => jest.clearAllMocks());

  it("returns 401 with no Authorization header", () => {
    requireAuth(mockReq(), mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer scheme", () => {
    requireAuth(mockReq({ authorization: "Basic dXNlcjpwYXNz" }), mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", () => {
    requireAuth(mockReq({ authorization: "Bearer garbage.token.here" }), mockRes(), mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("calls next() and attaches user for a valid token", () => {
    const token = signJwt({ userId: "u4", role: "ADMIN", phone: "+916666666666" });
    const req = mockReq({ authorization: `Bearer ${token}` });
    requireAuth(req, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect((req as any).user.userId).toBe("u4");
    expect((req as any).user.role).toBe("ADMIN");
  });
});
