import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { requireRole } from "../lib/role";

const router = Router();
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? "http://localhost:3001";
const requireWarehouseStaff = requireRole("WAREHOUSE_STAFF");

router.get("/:warehouseId", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { warehouseId } = req.params;
  const prisma = getPrisma();
  const tasks = await prisma.pickingTask.findMany({
    where: { warehouseId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    orderBy: { slaDeadline: "asc" },
    include: { items: { include: { sku: true } } },
  });
  return res.json(tasks);
});

router.post("/:orderId/pick-item", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { orderId } = req.params;
  const { skuId, status } = req.body as { skuId: string; status: string };

  if (!skuId || !["FOUND", "NOT_AVAILABLE"].includes(status)) {
    return res.status(400).json({ error: "skuId and status (FOUND|NOT_AVAILABLE) required" });
  }

  const prisma = getPrisma();
  const task = await prisma.pickingTask.findUnique({
    where: { orderId },
    include: { items: true },
  });
  if (!task) return res.status(404).json({ error: "PickingTask not found" });

  const item = task.items.find((i) => i.skuId === skuId);
  if (!item) return res.status(404).json({ error: "Item not found in task" });
  if (item.status !== "PENDING") return res.status(409).json({ error: "Item already scanned" });

  await prisma.$transaction(async (tx) => {
    await tx.pickingItem.update({
      where: { id: item.id },
      data: { status: status as "FOUND" | "NOT_AVAILABLE", scannedAt: new Date() },
    });
    if (task.status === "PENDING") {
      await tx.pickingTask.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS" },
      });
    }
  });

  if (task.status === "PENDING") {
    try {
      await axios.patch(`${ORDER_SERVICE_URL}/${orderId}/status`, { status: "WAREHOUSE_PROCESSING" });
    } catch {
      // non-fatal — order may already be in WAREHOUSE_PROCESSING
    }
  }

  return res.json({ success: true });
});

router.post("/:orderId/pack-ready", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { orderId } = req.params;
  const prisma = getPrisma();

  const task = await prisma.pickingTask.findUnique({
    where: { orderId },
    include: { items: true },
  });
  if (!task) return res.status(404).json({ error: "PickingTask not found" });

  if (task.items.some((i) => i.status === "PENDING")) {
    return res.status(400).json({ error: "All items must be scanned before packing" });
  }

  const foundItems = task.items.filter((i) => i.status === "FOUND");
  const notAvailableItems = task.items.filter((i) => i.status === "NOT_AVAILABLE");

  await prisma.$transaction(async (tx) => {
    await tx.pickingTask.update({ where: { id: task.id }, data: { status: "PACKED" } });
    for (const item of foundItems) {
      await tx.inventory.update({
        where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: task.warehouseId } },
        data: { quantityReserved: { decrement: item.quantity } },
      });
    }
    for (const item of notAvailableItems) {
      await tx.inventory.update({
        where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: task.warehouseId } },
        data: {
          quantityReserved: { decrement: item.quantity },
          quantityAvailable: { increment: item.quantity },
        },
      });
    }
  });

  try {
    await axios.patch(`${ORDER_SERVICE_URL}/${orderId}/status`, { status: "READY_FOR_PICKUP" });
  } catch {
    return res.status(502).json({ error: "Order service unreachable" });
  }

  return res.json({ success: true });
});

export default router;
