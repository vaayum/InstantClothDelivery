jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { isValidTransition, transitionOrder } from "../src/transitions";
import { getPrisma } from "../src/lib/db";
import { publishEvent } from "../src/lib/rabbitmq";
import { OrderStatus } from "@prisma/client";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockPublish = publishEvent as jest.MockedFunction<typeof publishEvent>;

function makeMockPrisma(currentStatus: OrderStatus) {
  return {
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "order-1", status: currentStatus }),
      update: jest.fn().mockResolvedValue({ id: "order-1", status: currentStatus }),
    },
  };
}

beforeEach(() => { jest.clearAllMocks(); });

describe("isValidTransition", () => {
  it("allows PENDING → WAREHOUSE_PROCESSING", () => {
    expect(isValidTransition("PENDING", "WAREHOUSE_PROCESSING")).toBe(true);
  });
  it("allows PENDING → CANCELLED", () => {
    expect(isValidTransition("PENDING", "CANCELLED")).toBe(true);
  });
  it("allows ARRIVED → TRIAL_IN_PROGRESS", () => {
    expect(isValidTransition("ARRIVED", "TRIAL_IN_PROGRESS")).toBe(true);
  });
  it("allows ARRIVED → RESCHEDULED", () => {
    expect(isValidTransition("ARRIVED", "RESCHEDULED")).toBe(true);
  });
  it("allows RESCHEDULED → AGENT_ASSIGNED", () => {
    expect(isValidTransition("RESCHEDULED", "AGENT_ASSIGNED")).toBe(true);
  });
  it("rejects COMPLETED → PENDING", () => {
    expect(isValidTransition("COMPLETED", "PENDING")).toBe(false);
  });
  it("rejects WAREHOUSE_PROCESSING → CANCELLED", () => {
    expect(isValidTransition("WAREHOUSE_PROCESSING", "CANCELLED")).toBe(false);
  });
  it("rejects TRIAL_IN_PROGRESS → PENDING", () => {
    expect(isValidTransition("TRIAL_IN_PROGRESS", "PENDING")).toBe(false);
  });
});

describe("transitionOrder", () => {
  it("updates status and publishes order.status_changed on valid transition", async () => {
    const mock = makeMockPrisma("PENDING");
    mockGetPrisma.mockReturnValue(mock as any);

    await transitionOrder("order-1", "WAREHOUSE_PROCESSING", "staff-1");

    expect(mock.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "WAREHOUSE_PROCESSING" },
    });
    expect(mockPublish).toHaveBeenCalledWith(
      "order.status_changed",
      expect.objectContaining({
        orderId: "order-1",
        from: "PENDING",
        to: "WAREHOUSE_PROCESSING",
        actor: "staff-1",
      })
    );
  });

  it("throws and does NOT publish on invalid transition", async () => {
    const mock = makeMockPrisma("COMPLETED");
    mockGetPrisma.mockReturnValue(mock as any);

    await expect(
      transitionOrder("order-1", "PENDING", "actor")
    ).rejects.toThrow("Cannot transition from COMPLETED to PENDING");

    expect(mockPublish).not.toHaveBeenCalled();
    expect(mock.order.update).not.toHaveBeenCalled();
  });
});
