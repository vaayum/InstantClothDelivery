import { Router } from "express";
import { getPrisma } from "../lib/db";

const router = Router();

// GET /api/admin/orders?status=PENDING&limit=50&offset=0
router.get("/api/admin/orders", async (req, res): Promise<void> => {
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

// GET /api/admin/stats
router.get("/api/admin/stats", async (_req, res): Promise<void> => {
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

// GET /api/admin/agents
router.get("/api/admin/agents", async (_req, res): Promise<void> => {
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

// GET /api/admin/warehouse
router.get("/api/admin/warehouse", async (_req, res): Promise<void> => {
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

export default router;
