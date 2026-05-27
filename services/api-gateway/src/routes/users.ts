import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "@threaddash/auth";

const prisma = new PrismaClient();
const router = Router();

router.patch("/me/pinned-warehouse", requireAuth, async (req, res): Promise<void> => {
  const { warehouseId } = req.body as { warehouseId?: string };
  if (!warehouseId) {
    res.status(400).json({ error: "warehouseId required" });
    return;
  }

  const userId = (req as any).user.userId;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, status: true },
  });
  if (!warehouse) {
    res.status(404).json({ error: "Warehouse not found" });
    return;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinnedWarehouseId: true },
  });
  const previousWarehouseId = currentUser?.pinnedWarehouseId ?? null;

  await prisma.user.update({
    where: { id: userId },
    data: { pinnedWarehouseId: warehouseId },
  });

  res.json({ warehouseChanged: warehouseId !== previousWarehouseId });
});

export default router;
