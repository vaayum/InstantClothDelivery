import { Router } from "express";
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
    await prisma.$transaction(async (tx) => {
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
    await prisma.$transaction(async (tx) => {
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

export default router;
