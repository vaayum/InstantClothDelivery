jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/lib/redis", () => ({
  getRedis: jest.fn().mockReturnValue({
    set: jest.fn().mockResolvedValue("OK"),
  }),
}));
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "agent-1", role: "AGENT", phone: "+919876500001" };
    next();
  },
}));

import request from "supertest";
import { getPrisma } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;

const BASE_AGENT = {
  id: "agent-1",
  userId: "user-agent-1",
  status: "AVAILABLE",
  currentLat: 12.97,
  currentLng: 77.59,
  lastUpdatedAt: new Date(),
  vehicleType: "two_wheeler",
  maxConcurrent: 3,
  rating: 5.0,
  totalDeliveries: 10,
};

function makeMockPrisma(overrides: any = {}) {
  const base: any = {
    deliveryAssignment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    agent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(base)),
    ...overrides,
  };
  return base;
}

let app: any;
beforeAll(async () => {
  app = (await import("../src/index")).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  // Re-setup redis mock after clearAllMocks
  (mockGetRedis as jest.Mock).mockReturnValue({
    set: jest.fn().mockResolvedValue("OK"),
  });
});

// ─── GET /agents/:agentId ────────────────────────────────────────────────────

describe("GET /agents/:agentId", () => {
  it("200 with agent including _count when found", async () => {
    const mockPrisma = makeMockPrisma();
    const agentWithCount = {
      ...BASE_AGENT,
      _count: { assignments: 2 },
    };
    mockPrisma.agent.findUnique.mockResolvedValue(agentWithCount);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).get("/agents/agent-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "agent-1",
      status: "AVAILABLE",
      _count: { assignments: 2 },
    });
    expect(mockPrisma.agent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        include: expect.objectContaining({ _count: expect.anything() }),
      })
    );
  });

  it("404 if agent not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.agent.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).get("/agents/agent-nonexistent");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Agent not found" });
  });
});

// ─── PATCH /agents/:agentId/location ─────────────────────────────────────────

describe("PATCH /agents/:agentId/location", () => {
  it("200 on success, updates Prisma and Redis", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.agent.update.mockResolvedValue({ ...BASE_AGENT, currentLat: 13.0, currentLng: 77.6 });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const mockRedis = { set: jest.fn().mockResolvedValue("OK") };
    (mockGetRedis as jest.Mock).mockReturnValue(mockRedis);

    const res = await request(app)
      .patch("/agents/agent-1/location")
      .send({ lat: 13.0, lng: 77.6 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });

    // Prisma update called in transaction
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: expect.objectContaining({
          currentLat: 13.0,
          currentLng: 77.6,
          lastUpdatedAt: expect.any(Date),
        }),
      })
    );

    // Redis updated
    expect(mockRedis.set).toHaveBeenCalledWith(
      "agent:location:agent-1",
      expect.stringContaining("13"),
      "EX",
      300
    );
  });

  it("400 if lat is missing", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/location")
      .send({ lng: 77.6 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining("lat") });
  });

  it("400 if lng is missing", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/location")
      .send({ lat: 13.0 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining("lng") });
  });

  it("400 if lat is a string, not a number", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/location")
      .send({ lat: "13.0", lng: 77.6 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining("numbers") });
  });

  it("400 if lng is a string, not a number", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/location")
      .send({ lat: 13.0, lng: "77.6" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining("numbers") });
  });
});

// ─── PATCH /agents/:agentId/status ───────────────────────────────────────────

describe("PATCH /agents/:agentId/status", () => {
  it("200 for AVAILABLE status", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.agent.update.mockResolvedValue({ ...BASE_AGENT, status: "AVAILABLE" });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/status")
      .send({ status: "AVAILABLE" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: { status: "AVAILABLE" },
      })
    );
  });

  it("200 for OFF_DUTY status", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.agent.update.mockResolvedValue({ ...BASE_AGENT, status: "OFF_DUTY" });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/status")
      .send({ status: "OFF_DUTY" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("400 for invalid status (e.g., EN_ROUTE_WAREHOUSE — not self-toggleable)", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/status")
      .send({ status: "EN_ROUTE_WAREHOUSE" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(mockPrisma.agent.update).not.toHaveBeenCalled();
  });

  it("400 for completely unknown status", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/status")
      .send({ status: "INVALID_STATUS" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("400 if status is missing from body", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app)
      .patch("/agents/agent-1/status")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
