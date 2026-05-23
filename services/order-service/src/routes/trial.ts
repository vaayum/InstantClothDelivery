import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { publishEvent } from "../lib/rabbitmq";
import { transitionOrder } from "../transitions";

const router = Router();
const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

router.post("/:id/trial/start", requireAuth, async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.isTryOrder) {
    return res.status(400).json({ error: "Not a try order" });
  }

  try {
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + 30 * 60 * 1000);

    await transitionOrder(id, "TRIAL_IN_PROGRESS", req.user!.userId);

    await prisma.order.update({
      where: { id },
      data: { trialStartedAt, trialEndsAt },
    });

    const redis = getRedis();
    await redis.set(`trial:order:${id}`, trialEndsAt.toISOString(), "EX", 1800);

    return res.json({ trialStartedAt, trialEndsAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trial start failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

router.post("/:id/trial/complete", requireAuth, async (req, res) => {
  const { keptSkuIds = [], returnedSkuIds = [] } = req.body as {
    keptSkuIds: string[];
    returnedSkuIds: string[];
  };

  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  try {
    for (const item of order.items) {
      if (keptSkuIds.includes(item.skuId)) {
        await prisma.orderItem.update({ where: { id: item.id }, data: { status: "KEPT" } });
      } else if (returnedSkuIds.includes(item.skuId)) {
        await prisma.orderItem.update({ where: { id: item.id }, data: { status: "RETURNED" } });
      }
    }

    if (returnedSkuIds.length > 0) {
      const releaseItems = order.items
        .filter((i) => returnedSkuIds.includes(i.skuId))
        .map((i) => ({ skuId: i.skuId, warehouseId: order.warehouseId, quantity: i.quantity }));
      await axios.post(`${WAREHOUSE_URL}/inventory/release`, { items: releaseItems });
    }

    await transitionOrder(id, "COMPLETED", req.user!.userId);

    await publishEvent("order.completed", {
      orderId: id,
      keptSkuIds,
      returnedSkuIds,
      timestamp: new Date().toISOString(),
    });

    const redis = getRedis();
    await redis.del(`sla:order:${id}`);
    await redis.del(`trial:order:${id}`);

    return res.json({ success: true, keptCount: keptSkuIds.length, returnedCount: returnedSkuIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trial complete failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

export default router;
