import { Router } from "express";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/db";

const router = Router();

router.post("/reserve", async (req, res) => {
  const { orderId, items } = req.body as {
    orderId: string;
    items: { skuId: string; warehouseId: string; quantity: number }[];
  };

  if (!orderId || !items?.length) {
    return res.status(400).json({ error: "orderId and items required" });
  }

  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const item of items) {
        const inv = await tx.inventory.findUnique({
          where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: item.warehouseId } },
        });
        if (!inv || inv.quantityAvailable < item.quantity) {
          throw new Error(`Insufficient stock for SKU ${item.skuId}`);
        }
        await tx.inventory.update({
          where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: item.warehouseId } },
          data: {
            quantityAvailable: { decrement: item.quantity },
            quantityReserved: { increment: item.quantity },
          },
        });
      }
    });
    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reservation failed";
    if (message.includes("Insufficient stock")) {
      return res.status(409).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

router.post("/release", async (req, res) => {
  const { items } = req.body as {
    items: { skuId: string; warehouseId: string; quantity: number }[];
  };

  if (!items?.length) {
    return res.status(400).json({ error: "items required" });
  }

  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const item of items) {
        await tx.inventory.update({
          where: { skuId_warehouseId: { skuId: item.skuId, warehouseId: item.warehouseId } },
          data: {
            quantityAvailable: { increment: item.quantity },
            quantityReserved: { decrement: item.quantity },
          },
        });
      }
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Release failed" });
  }
});

router.get("/availability", async (req, res) => {
  const { warehouseId, skuIds } = req.query as { warehouseId?: string; skuIds?: string };
  if (!warehouseId || !skuIds) {
    return res.status(400).json({ error: "warehouseId and skuIds are required" });
  }

  const skuIdList = skuIds.split(",").filter(Boolean);
  const prisma = getPrisma();

  const rows = await prisma.inventory.findMany({
    where: { warehouseId, skuId: { in: skuIdList } },
    select: { skuId: true, quantityAvailable: true },
  });

  const rowMap = new Map(rows.map((r) => [r.skuId, r.quantityAvailable]));
  const result: Record<string, { quantityAvailable: number; available: boolean }> = {};
  for (const skuId of skuIdList) {
    const qty = rowMap.get(skuId) ?? 0;
    result[skuId] = { quantityAvailable: qty, available: qty > 0 };
  }

  return res.json(result);
});

export default router;
