jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { isValidAssignmentTransition, transitionAssignment } from "../src/transitions";
import { publishEvent } from "../src/lib/rabbitmq";
import { getPrisma } from "../src/lib/db";

const mockPublishEvent = publishEvent as jest.MockedFunction<typeof publishEvent>;
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

const BASE_ASSIGNMENT = {
  id: "assign-1",
  orderId: "order-1",
  agentId: "agent-1",
  status: "ASSIGNED" as const,
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isValidAssignmentTransition", () => {
  it("returns true for ASSIGNED → ACCEPTED", () => {
    expect(isValidAssignmentTransition("ASSIGNED", "ACCEPTED")).toBe(true);
  });

  it("returns true for ASSIGNED → DECLINED", () => {
    expect(isValidAssignmentTransition("ASSIGNED", "DECLINED")).toBe(true);
  });

  it("returns true for ACCEPTED → PICKED_UP", () => {
    expect(isValidAssignmentTransition("ACCEPTED", "PICKED_UP")).toBe(true);
  });

  it("returns true for PICKED_UP → DELIVERED", () => {
    expect(isValidAssignmentTransition("PICKED_UP", "DELIVERED")).toBe(true);
  });

  it("returns false for ASSIGNED → DELIVERED (skip steps)", () => {
    expect(isValidAssignmentTransition("ASSIGNED", "DELIVERED")).toBe(false);
  });

  it("returns false for DELIVERED → ACCEPTED (terminal state)", () => {
    expect(isValidAssignmentTransition("DELIVERED", "ACCEPTED")).toBe(false);
  });

  it("returns false for DELIVERED → ASSIGNED (terminal state)", () => {
    expect(isValidAssignmentTransition("DELIVERED", "ASSIGNED")).toBe(false);
  });

  it("returns false for DECLINED → anything (terminal state)", () => {
    expect(isValidAssignmentTransition("DECLINED", "ASSIGNED")).toBe(false);
    expect(isValidAssignmentTransition("DECLINED", "ACCEPTED")).toBe(false);
  });

  it("returns false for ABSENT → anything (terminal state)", () => {
    expect(isValidAssignmentTransition("ABSENT", "ASSIGNED")).toBe(false);
  });
});

describe("transitionAssignment", () => {
  it("success path: loads assignment, validates, updates with correct timestamp field, publishes event", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "ASSIGNED",
    });
    const updatedAssignment = { ...BASE_ASSIGNMENT, status: "ACCEPTED", acceptedAt: new Date() };
    mockPrisma.deliveryAssignment.update.mockResolvedValue(updatedAssignment);
    mockGetPrisma.mockReturnValue(mockPrisma);

    const result = await transitionAssignment("order-1", "ACCEPTED", "agent-1");

    expect(mockPrisma.deliveryAssignment.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
    });

    expect(mockPrisma.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order-1" },
        data: expect.objectContaining({
          status: "ACCEPTED",
          acceptedAt: expect.any(Date),
        }),
      })
    );

    expect(mockPublishEvent).toHaveBeenCalledWith(
      "assignment.status_changed",
      expect.objectContaining({
        orderId: "order-1",
        agentId: "agent-1",
        from: "ASSIGNED",
        to: "ACCEPTED",
        actor: "agent-1",
      })
    );

    expect(result).toEqual(updatedAssignment);
  });

  it("sets pickedUpAt timestamp when transitioning to PICKED_UP", async () => {
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

    await transitionAssignment("order-1", "PICKED_UP", "agent-1");

    expect(mockPrisma.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PICKED_UP",
          pickedUpAt: expect.any(Date),
        }),
      })
    );
  });

  it("sets deliveredAt timestamp when transitioning to DELIVERED", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "PICKED_UP",
    });
    mockPrisma.deliveryAssignment.update.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DELIVERED",
      deliveredAt: new Date(),
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    await transitionAssignment("order-1", "DELIVERED", "agent-1");

    expect(mockPrisma.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DELIVERED",
          deliveredAt: expect.any(Date),
        }),
      })
    );
  });

  it("throws on invalid transition and does not update or publish", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ASSIGNMENT,
      status: "DELIVERED",
    });
    mockGetPrisma.mockReturnValue(mockPrisma);

    await expect(
      transitionAssignment("order-1", "ACCEPTED", "agent-1")
    ).rejects.toThrow("Cannot transition assignment from DELIVERED to ACCEPTED");

    expect(mockPrisma.deliveryAssignment.update).not.toHaveBeenCalled();
    expect(mockPublishEvent).not.toHaveBeenCalled();
  });

  it("throws if assignment not found (findUniqueOrThrow rejects)", async () => {
    const mockPrisma = makeMockPrisma();
    mockPrisma.deliveryAssignment.findUniqueOrThrow.mockRejectedValue(
      new Error("No DeliveryAssignment found")
    );
    mockGetPrisma.mockReturnValue(mockPrisma);

    await expect(
      transitionAssignment("order-nonexistent", "ACCEPTED", "agent-1")
    ).rejects.toThrow("No DeliveryAssignment found");

    expect(mockPrisma.deliveryAssignment.update).not.toHaveBeenCalled();
  });
});
