jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));
jest.mock("../src/lib/redis", () => ({ getRedis: jest.fn() }));
jest.mock("../src/lib/rabbitmq", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { checkSlaOnce } from "../src/sla-monitor";
import { getPrisma } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";
import { publishEvent } from "../src/lib/rabbitmq";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;
const mockGetRedis = getRedis as jest.MockedFunction<typeof getRedis>;
const mockPublish = publishEvent as jest.MockedFunction<typeof publishEvent>;

function makeRedis(keys: Record<string, string | null> = {}) {
  return {
    get: jest.fn((key: string) => Promise.resolve(keys[key] ?? null)),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000);

beforeEach(() => { jest.clearAllMocks(); });

describe("checkSlaOnce", () => {
  it("does nothing for orders under 36 minutes old", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: "order-1", createdAt: minutesAgo(20) }]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis() as any);

    await checkSlaOnce();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("publishes order.sla_warning for orders 36–44 minutes old", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: "order-1", createdAt: minutesAgo(38) }]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis() as any);

    await checkSlaOnce();

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      "order.sla_warning",
      expect.objectContaining({ orderId: "order-1" })
    );
  });

  it("publishes sla_breach AND updates slaBreach flag for orders >= 45 minutes old", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: "order-1", createdAt: minutesAgo(47) }]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis() as any);

    await checkSlaOnce();

    expect(mockPublish).toHaveBeenCalledWith("order.sla_warning", expect.objectContaining({ orderId: "order-1" }));
    expect(mockPublish).toHaveBeenCalledWith("order.sla_breach", expect.objectContaining({ orderId: "order-1" }));
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { slaBreach: true },
    });
  });

  it("does NOT re-publish warning when sla:warn key exists", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: "order-1", createdAt: minutesAgo(38) }]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis({ "sla:warn:order-1": "1" }) as any);

    await checkSlaOnce();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("does NOT re-publish breach when sla:breach key exists", async () => {
    const mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: "order-1", createdAt: minutesAgo(50) }]),
        update: jest.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(mockPrisma as any);
    mockGetRedis.mockReturnValue(makeRedis({ "sla:warn:order-1": "1", "sla:breach:order-1": "1" }) as any);

    await checkSlaOnce();

    expect(mockPublish).not.toHaveBeenCalled();
  });
});
