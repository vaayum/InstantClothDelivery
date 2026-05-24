jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("axios");

import axios from "axios";
import { getPrisma } from "../src/lib/db";
import { publishEvent } from "../src/lib/rabbitmq";
import { handleOrderReadyForPickup } from "../src/consumer";

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockPublishEvent = publishEvent as jest.MockedFunction<typeof publishEvent>;

const BASE_ORDER = {
  id: "order-1",
  address: { lat: 12.95, lng: 77.60 },
  warehouse: { id: "wh-1", lat: 12.97, lng: 77.59 },
};

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
  assignments: [],
};

const PAYLOAD = {
  orderId: "order-1",
  from: "PICKING_COMPLETE",
  to: "READY_FOR_PICKUP",
  actor: "warehouse-service",
  timestamp: new Date().toISOString(),
};

function makeMockPrisma(overrides: any = {}) {
  const base: any = {
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(BASE_ORDER),
    },
    deliveryAssignment: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    agent: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([BASE_AGENT]),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(base)),
    ...overrides,
  };
  return base;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("handleOrderReadyForPickup", () => {
  it("happy path: finds order, finds eligible agents, calls routing-service, creates assignment, updates agent, patches order-service, publishes event", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    mockAxios.post.mockImplementation((url: string) => {
      if (url.includes("/assign-agent")) {
        return Promise.resolve({
          data: {
            candidates: [
              {
                agent_id: "agent-1",
                eta_to_warehouse_minutes: 5,
                eta_to_customer_minutes: 15,
                score: 0.9,
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });

    await handleOrderReadyForPickup(PAYLOAD);

    // Loads order
    expect(mockPrisma.order.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order-1" } })
    );

    // Finds eligible agents
    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "AVAILABLE" } })
    );

    // Calls routing service
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/assign-agent"),
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ agent_id: "agent-1" }),
        ]),
      })
    );

    // Creates DeliveryAssignment + updates Agent in $transaction
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.deliveryAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order-1",
          agentId: "agent-1",
          status: "ASSIGNED",
        }),
      })
    );
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1" },
        data: { status: "EN_ROUTE_WAREHOUSE" },
      })
    );

    // PATCHes order-service
    expect(mockAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining("order-1"),
      { status: "AGENT_ASSIGNED" }
    );

    // Publishes assignment.status_changed
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "assignment.status_changed",
      expect.objectContaining({
        orderId: "order-1",
        agentId: "agent-1",
        from: "UNASSIGNED",
        to: "ASSIGNED",
        actor: "system",
      })
    );
  });

  it("no eligible agents: skips routing call, publishes no_agent_available, resolves without throwing", async () => {
    const mockPrisma = makeMockPrisma();
    // All agents are at max concurrent
    mockPrisma.agent.findMany.mockResolvedValue([
      { ...BASE_AGENT, maxConcurrent: 1, assignments: [{ status: "ASSIGNED" }] },
    ]);
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });

    await expect(handleOrderReadyForPickup(PAYLOAD)).resolves.toBeUndefined();

    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "assignment.no_agent_available",
      expect.objectContaining({ orderId: "order-1" })
    );
    expect(mockPublishEvent).not.toHaveBeenCalledWith("assignment.status_changed", expect.anything());
  });

  it("no eligible agents because currentLat/currentLng is null: skips routing, publishes no_agent_available", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.agent.findMany.mockResolvedValue([
      { ...BASE_AGENT, currentLat: null, currentLng: null, assignments: [] },
    ]);
    mockGetPrisma.mockReturnValue(mockPrisma);
    mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });

    await expect(handleOrderReadyForPickup(PAYLOAD)).resolves.toBeUndefined();

    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "assignment.no_agent_available",
      expect.objectContaining({ orderId: "order-1" })
    );
  });

  it("routing-service returns empty candidates: publishes no_agent_available", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    mockAxios.post = jest.fn().mockResolvedValue({
      data: { candidates: [] },
    });
    mockAxios.patch = jest.fn().mockResolvedValue({ data: {} });

    await expect(handleOrderReadyForPickup(PAYLOAD)).resolves.toBeUndefined();

    expect(mockPublishEvent).toHaveBeenCalledWith(
      "assignment.no_agent_available",
      expect.objectContaining({ orderId: "order-1" })
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("order-service PATCH fails: logs error but resolves (non-fatal)", async () => {
    const mockPrisma = makeMockPrisma();
    mockGetPrisma.mockReturnValue(mockPrisma);

    mockAxios.post = jest.fn().mockResolvedValue({
      data: {
        candidates: [
          {
            agent_id: "agent-1",
            eta_to_warehouse_minutes: 5,
            eta_to_customer_minutes: 15,
            score: 0.9,
          },
        ],
      },
    });
    mockAxios.patch = jest.fn().mockRejectedValue(new Error("Order service down"));

    // Should not throw — order-service PATCH failure is non-fatal
    await expect(handleOrderReadyForPickup(PAYLOAD)).resolves.toBeUndefined();

    // Transaction still ran
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // Event still published
    expect(mockPublishEvent).toHaveBeenCalledWith(
      "assignment.status_changed",
      expect.objectContaining({ orderId: "order-1" })
    );
  });
});
