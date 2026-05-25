import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { requireRole } from "../lib/role";

const router = Router();
const requireWarehouseStaff = requireRole("WAREHOUSE_STAFF");

router.post("/receive", requireAuth, requireWarehouseStaff, async (req, res) => {
  const { orderItemId, condition, reason, photoUrl } = req.body as {
    orderItemId: string;
    condition: string;
    reason?: string;
    photoUrl?: string;
  };

  if (!orderItemId || !["GOOD", "DAMAGED", "TAGS_MISSING"].includes(condition)) {
    return res.status(400).json({
      error: "orderItemId and condition (GOOD|DAMAGED|TAGS_MISSING) required",
    });
  }

  const prisma = getPrisma();

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true },
  });
  if (!orderItem) return res.status(404).json({ error: "OrderItem not found" });

  const existing = await prisma.return.findUnique({ where: { orderItemId } });
  if (existing) return res.status(409).json({ error: "Return already exists for this item" });

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.return.create({
      data: {
        orderId: orderItem.orderId,
        orderItemId,
        condition: condition as "GOOD" | "DAMAGED" | "TAGS_MISSING",
        reason: reason ?? null,
        photoUrl: photoUrl ?? null,
        refundAmount: 0,
        processedAt: new Date(),
      },
    });

    if (condition === "GOOD") {
      await tx.inventory.update({
        where: {
          skuId_warehouseId: {
            skuId: orderItem.skuId,
            warehouseId: orderItem.order.warehouseId,
          },
        },
        data: { quantityAvailable: { increment: 1 } },
      });
    }
  });

  return res.json({ success: true });
});

export default router;
