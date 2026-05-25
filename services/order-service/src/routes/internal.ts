import { Router } from "express";
import axios from "axios";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { transitionOrder } from "../transitions";

const router = Router();
const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

// Internal-only endpoint — no auth. Called by payment-service on payment.failed.
router.post("/orders/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  try {
    await transitionOrder(id, "CANCELLED", "system:payment-failed");

    const releaseItems = order.items.map((item) => ({
      skuId: item.skuId,
      warehouseId: order.warehouseId,
      quantity: item.quantity,
    }));
    await axios
      .post(`${WAREHOUSE_URL}/inventory/release`, { items: releaseItems })
      .catch((err) => console.error(`[internal] inventory release failed for ${id}:`, err?.message));

    await prisma.warehouse.update({
      where: { id: order.warehouseId },
      data: { activeOrderCount: { decrement: 1 } },
    });

    const redis = getRedis();
    await redis.del(`sla:order:${id}`);

    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

export default router;
