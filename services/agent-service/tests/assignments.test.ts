jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@threaddash/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: "agent-1", role: "AGENT", phone: "+919876500001" };
    next();
  },
}));
jest.mock("axios");

import request from "supertest";
import axios from "axios";
import { getPrisma } from "../src/lib/db";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

const BASE_ASSIGNMENT = {
  id: "assign-1",
  orderId: "order-1",
  agentId: "agent-1",
  status: "ASSIGNED",
  assignedAt: new Date(),
  acceptedAt: null,
  pickedUpAt: null,
  arrivedAt: null,
  deliveredAt: null,
  absentAttempts: 0,
  notes: null,
};

function makeMockPrisma(overrides: any = {}) {
  const base: any = {
    deliveryAssignment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
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
  mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });
  mockAxios.post = jest.fn().mockResolvedValue({ data: {} });
});

// ─── GET /assignments/:orderId ────────────────────────────────────────────────

describe("GET /assignments/:orderId", () => {
  it("200 with assignment when found", async () => {
    const mockPrisma = makeMockPrisma();
    const assignmentWithAgent = { ...BASE_ASSIGNMENT, agent: { id: "agent-1" } };
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue(assignmentWithAgent);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).get("/api/agents/assignments/order-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "assign-1", orderId: "order-1" });
    expect(mockPrisma.deliveryAssignment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: "order-1" } })
    );
  });

  it("404 when assignment not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).get("/api/agents/assignments/order-nonexistent");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Assignment not found" });
  });
});

// ─── POST /assignments/:orderId/accept ───────────────────────────────────────

describe("POST /assignments/:orderId/accept", () => {
  it("200 on successful accept (ASSIGNED → ACCEPTED)", async () => {
    const mockPrisma = makeMockPrisma();
    // transitionAssignment internally calls findUniqueOrThrow then update
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ASSIGNED",
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ACCEPTED",
      acceptedAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/accept");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("409 on invalid transition", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DELIVERED",
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/accept");

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /assignments/:orderId/decline ──────────────────────────────────────

describe("POST /assignments/:orderId/decline", () => {
  it("200 on success and updates agent to AVAILABLE", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ASSIGNED",
    });
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ASSIGNED",
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DECLINED",
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/decline");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: { status: "AVAILABLE" },
      })
    );
  });

  it("404 when assignment not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/decline");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Assignment not found" });
  });

  it("409 on invalid transition (DELIVERED → DECLINED)", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DELIVERED",
    });
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DELIVERED",
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/decline");

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /assignments/:orderId/pickup ───────────────────────────────────────

describe("POST /assignments/:orderId/pickup", () => {
  it("200 on success and PATCHes order-service with AGENT_EN_ROUTE", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ACCEPTED",
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "PICKED_UP",
      pickedUpAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/pickup");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mockAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining("order-1"),
      { status: "AGENT_EN_ROUTE" }
    );
  });

  it("409 on invalid transition", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ASSIGNED", // must be ACCEPTED first
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/pickup");

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });

  it("502 if order-service PATCH fails", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ACCEPTED",
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "PICKED_UP",
      pickedUpAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockRejectedValue(new Error("Order service down"));

    const res = await request(app).post("/api/agents/assignments/order-1/pickup");

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: "Order service unreachable" });
  });
});

// ─── POST /assignments/:orderId/arrive ───────────────────────────────────────

describe("POST /assignments/:orderId/arrive", () => {
  it("200 on success, sets arrivedAt, PATCHes order-service with ARRIVED", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      arrivedAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/arrive");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mockPrisma.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order-1" },
        data: expect.objectContaining({ arrivedAt: expect.any(Date) }),
      })
    );
    expect(mockAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining("order-1"),
      { status: "ARRIVED" }
    );
  });

  it("502 if order-service PATCH fails", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      arrivedAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockRejectedValue(new Error("Order service down"));

    const res = await request(app).post("/api/agents/assignments/order-1/arrive");

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: "Order service unreachable" });
  });
});

// ─── POST /assignments/:orderId/deliver ──────────────────────────────────────

describe("POST /assignments/:orderId/deliver", () => {
  it("200 on success: transitions to DELIVERED, updates agent AVAILABLE + increments totalDeliveries, PATCHes COMPLETED", async () => {
    const mockPrisma = makeMockPrisma();
    // First findUniqueOrThrow is for transitionAssignment
    // Second findUniqueOrThrow is inside the $transaction in the route
    mockPrisma.deliveryAssignment.findUniqueOrThrow
      .mockResolvedValueOnce({ ...BASE_ASSIGNMENT, status: "PICKED_UP" })
      .mockResolvedValueOnce({ ...BASE_ASSIGNMENT, status: "DELIVERED", agentId: "agent-1" });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DELIVERED",
      deliveredAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/deliver");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: expect.objectContaining({
          status: "AVAILABLE",
          totalDeliveries: { increment: 1 },
        }),
      })
    );
    expect(mockAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining("order-1"),
      { status: "COMPLETED" }
    );
  });

  it("409 on invalid transition (ASSIGNED → DELIVERED)", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ASSIGNED",
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/deliver");

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── POST /assignments/:orderId/absent ───────────────────────────────────────

describe("POST /assignments/:orderId/absent", () => {
  it("returns { absentAttempts: 1, absent: false } before threshold", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      absentAttempts: 0,
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      absentAttempts: 1,
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/absent");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ absentAttempts: 1, absent: false });
    // Should NOT call transition or order-service
    expect(mockPrisma.deliveryAssignment.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it("returns { absentAttempts: 2, absent: false } at second attempt", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      absentAttempts: 1,
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      absentAttempts: 2,
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/absent");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ absentAttempts: 2, absent: false });
  });

  it("at 3 attempts returns { absentAttempts: 3, absent: true } and calls transition + order-service", async () => {
    const mockPrisma = makeMockPrisma();
    // findUnique for initial check: absentAttempts: 2 (before increment)
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      absentAttempts: 2,
      status: "ACCEPTED",
    });
    // update to increment returns absentAttempts: 3
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      absentAttempts: 3,
      status: "ACCEPTED",
    });
    // findUniqueOrThrow for transitionAssignment
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ACCEPTED",
      absentAttempts: 3,
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/absent");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ absentAttempts: 3, absent: true });

    // Should call transitionAssignment (which uses findUniqueOrThrow)
    expect(mockPrisma.deliveryAssignment.findUniqueOrThrow).toHaveBeenCalled();

    // Should POST to order-service mark-absent
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("order-1/mark-absent")
    );
  });

  it("404 when assignment not found", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUnique.mockResolvedValue(null);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).post("/api/agents/assignments/order-1/absent");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Assignment not found" });
  });
});
