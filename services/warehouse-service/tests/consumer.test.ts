jest.mock("../src/lib/db", () => ({ getPrisma: jest.fn() }));

import { getPrisma } from "../src/lib/db";
import { handleOrderPlaced } from "../src/consumer";

const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>;

beforeEach(() => { jest.clearAllMocks(); });

describe("handleOrderPlaced", () => {
  it("creates PickingTask with slaDeadline ~45 min from now and one PickingItem per order item", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: "task-1" });
    const mockFindMany = jest.fn().mockResolvedValue([
      { id: "item-1", skuId: "sku-os-s", quantity: 1 },
      { id: "item-2", skuId: "sku-os-m", quantity: 2 },
    ]);
    mockGetPrisma.mockReturnValue({
      orderItem: { findMany: mockFindMany },
      pickingTask: { create: mockCreate },
    } as any);

    const before = Date.now();
    await handleOrderPlaced({ orderId: "order-1", warehouseId: "wh-hsr-layout" });
    const after = Date.now();

    expect(mockFindMany).toHaveBeenCalledWith({ where: { orderId: "order-1" } });

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.orderId).toBe("order-1");
    expect(callArg.data.warehouseId).toBe("wh-hsr-layout");
    expect(callArg.data.status).toBe("PENDING");

    const sla = new Date(callArg.data.slaDeadline).getTime();
    expect(sla).toBeGreaterThanOrEqual(before + 45 * 60 * 1000 - 200);
    expect(sla).toBeLessThanOrEqual(after + 45 * 60 * 1000 + 200);

    expect(callArg.data.items.create).toEqual([
      { skuId: "sku-os-s", quantity: 1, status: "PENDING" },
      { skuId: "sku-os-m", quantity: 2, status: "PENDING" },
    ]);
  });

  it("creates an empty PickingTask when order has no items", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ id: "task-2" });
    mockGetPrisma.mockReturnValue({
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      pickingTask: { create: mockCreate },
    } as any);

    await expect(
      handleOrderPlaced({ orderId: "order-empty", warehouseId: "wh-hsr-layout" })
    ).resolves.not.toThrow();

    expect(mockCreate.mock.calls[0][0].data.items.create).toEqual([]);
  });
});
