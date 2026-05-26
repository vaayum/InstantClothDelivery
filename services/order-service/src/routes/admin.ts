import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { transitionOrder } from "../transitions";

const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

const router = Router();

// GET /orders?status=PENDING&limit=50&offset=0
router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const orders = await getPrisma().order.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      address: { select: { formattedAddress: true, label: true } },
      items: {
        include: { sku: { include: { product: { select: { name: true, brand: true } } } } },
      },
      user: { select: { phone: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: parseInt(limit, 10),
    skip: parseInt(offset, 10),
  });
  res.json(orders);
});

// GET /stats
router.get("/stats", requireAuth, async (_req, res): Promise<void> => {
  const prisma = getPrisma();
  const [statusCounts, agentCounts, todayRevenue, activePickingTasks] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.agent.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.order.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _sum: { totalAmount: true },
    }),
    prisma.pickingTask.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] as any } } }),
  ]);

  const ordersByStatus: Record<string, number> = {};
  for (const row of statusCounts) ordersByStatus[row.status] = row._count.id;

  const agentsByStatus: Record<string, number> = {};
  for (const row of agentCounts) agentsByStatus[row.status] = row._count.id;

  res.json({
    ordersByStatus,
    agentsByStatus,
    todayRevenuePaise: todayRevenue._sum.totalAmount ?? 0,
    activePickingTasks,
  });
});

// GET /agents
router.get("/agents", requireAuth, async (_req, res): Promise<void> => {
  const agents = await getPrisma().agent.findMany({
    include: {
      assignments: {
        where: { status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] as any } },
        take: 1,
        select: { orderId: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(agents);
});

// GET /warehouse
router.get("/warehouse", requireAuth, async (_req, res): Promise<void> => {
  const warehouses = await getPrisma().warehouse.findMany({
    include: {
      inventory: {
        include: { sku: { include: { product: { select: { name: true, brand: true } } } } },
        orderBy: { updatedAt: "desc" },
      },
      _count: { select: { pickingTasks: true } },
    },
  });
  res.json(warehouses);
});

// POST /orders/:id/cancel  — admin force-cancel any cancellable order
router.post("/orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  try {
    await transitionOrder(id, "CANCELLED", `admin:${req.user!.userId}`);

    await axios
      .post(`${WAREHOUSE_URL}/inventory/release`, {
        items: order.items.map((i) => ({ skuId: i.skuId, warehouseId: order.warehouseId, quantity: i.quantity })),
      })
      .catch((err) => console.error(`[admin] inventory release failed for ${id}:`, err?.message));

    await prisma.warehouse.update({
      where: { id: order.warehouseId },
      data: { activeOrderCount: { decrement: 1 } },
    });

    await getRedis().del(`sla:order:${id}`).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    res.status(message.includes("Cannot transition") ? 409 : 500).json({ error: message });
  }
});

export default router;
