import { Router } from "express";
import axios from "axios";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { transitionOrder } from "../transitions";
import type { OrderStatus } from "@prisma/client";

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

// Internal-only endpoint — no auth. Called by agent-service for intermediate status transitions.
router.patch("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: string };
  if (!status) return res.status(400).json({ error: "status required" });

  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.status === status) return res.json(order);

  try {
    const updated = await transitionOrder(id, status as OrderStatus, "system:agent-service");
    return res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status update failed";
    const code = message.includes("Cannot transition") || message.includes("not found") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

// Internal-only endpoint — no auth. Called by agent-service on /deliver.
// Determines the correct terminal status from item statuses so the order
// service owns that logic: DELIVERED / PARTIALLY_DELIVERED / RETURNED.
router.post("/orders/:id/finalize", async (req, res) => {
  const { id } = req.params;
  const prisma = getPrisma();

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  let target: OrderStatus;
  if (!order.isTryOrder) {
    target = "DELIVERED";
  } else {
    const kept = order.items.filter((i) => i.status === "KEPT").length;
    const returned = order.items.filter((i) => i.status === "RETURNED").length;
    if (kept > 0 && returned === 0) target = "DELIVERED";
    else if (kept > 0 && returned > 0) target = "PARTIALLY_DELIVERED";
    else target = "RETURNED";
  }

  try {
    const updated = await transitionOrder(id, target, "system:agent-service");
    return res.json({ ...updated, deliveryOutcome: target });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finalize failed";
    const code = message.includes("Cannot transition") ? 409 : 500;
    return res.status(code).json({ error: message });
  }
});

// Internal-only endpoint — no auth. Called by agent-service before finalizing delivery.
router.post("/orders/:id/verify-delivery-otp", async (req, res) => {
  const { id } = req.params;
  const { otp } = req.body as { otp: string };
  if (!otp) return res.status(400).json({ error: "otp required" });

  const stored = await getRedis().get(`delivery:otp:${id}`);
  if (!stored) return res.status(410).json({ error: "OTP expired or not found" });
  if (stored !== otp) return res.status(400).json({ error: "Invalid OTP" });

  await getRedis().del(`delivery:otp:${id}`);
  return res.json({ success: true });
});

export default router;
