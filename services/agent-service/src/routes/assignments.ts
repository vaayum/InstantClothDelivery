import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { requireRole } from "../lib/role";
import { transitionAssignment } from "../transitions";
import { publishEvent } from "../lib/rabbitmq";

const router = Router();
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? "http://localhost:3001";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3004";
const requireAgent = requireRole("AGENT");

// GET /assignments/:orderId
router.get("/:orderId", requireAuth, async (req, res) => {
  const { orderId } = req.params;
  const prisma = getPrisma();

  try {
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId },
      include: {
        agent: true,
        order: {
          include: {
            address: { select: { formattedAddress: true } },
            items: {
              include: { sku: { include: { product: { select: { name: true } } } } },
            },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const { order, ...rest } = assignment as any;
    return res.json({
      ...rest,
      order: order ? {
        id: order.id,
        status: order.status,
        totalAmount: order.totalAmount,
        isTryOrder: order.isTryOrder,
        trialEndsAt: order.trialEndsAt,
        deliveryAddress: order.address?.formattedAddress ?? "",
        items: order.items.map((i: any) => ({
          id: i.id,
          skuId: i.skuId,
          productName: i.sku?.product?.name ?? "",
          size: i.sku?.size,
          color: i.sku?.color,
          quantity: i.quantity,
          price: i.price,
          status: i.status,
        })),
      } : null,
    });
  } catch (err) {
    console.error("GET /assignments/:orderId error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /assignments/:orderId/accept
router.post("/:orderId/accept", requireAuth, requireAgent, async (req, res) => {
  const { orderId } = req.params;

  try {
    await transitionAssignment(orderId, "ACCEPTED", req.user!.userId);
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /assignments/:orderId/accept error", err);
    return res.status(409).json({ error: (err as Error).message });
  }
});

// POST /assignments/:orderId/decline
router.post("/:orderId/decline", requireAuth, requireAgent, async (req, res) => {
  const { orderId } = req.params;
  const prisma = getPrisma();

  try {
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId },
      include: { order: { select: { warehouseId: true, userId: true, isTryOrder: true } } },
    });
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    await transitionAssignment(orderId, "DECLINED", req.user!.userId);

    await prisma.agent.update({
      where: { id: assignment.agentId },
      data: { status: "AVAILABLE" },
    });

    // Re-publish order.placed so the auto-dispatch consumer assigns a new agent.
    // consumer.ts skips warehouse simulation when order is already past PENDING.
    await publishEvent("order.placed", {
      orderId,
      warehouseId: assignment.order.warehouseId,
      userId: assignment.order.userId,
      customerId: assignment.order.userId,
      isTryOrder: assignment.order.isTryOrder,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /assignments/:orderId/decline error", err);
    return res.status(409).json({ error: (err as Error).message });
  }
});

// POST /assignments/:orderId/pickup
router.post("/:orderId/pickup", requireAuth, requireAgent, async (req, res) => {
  const { orderId } = req.params;

  try {
    await transitionAssignment(orderId, "PICKED_UP", req.user!.userId);
  } catch (err) {
    console.error("POST /assignments/:orderId/pickup transition error", err);
    return res.status(409).json({ error: (err as Error).message });
  }

  try {
    await axios.patch(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/status`, { status: "AGENT_EN_ROUTE" });
  } catch (err) {
    console.error("POST /assignments/:orderId/pickup order-service error", err);
    return res.status(502).json({ error: "Order service unreachable" });
  }

  return res.json({ success: true });
});

// POST /assignments/:orderId/arrive
router.post("/:orderId/arrive", requireAuth, requireAgent, async (req, res) => {
  const { orderId } = req.params;
  const prisma = getPrisma();

  try {
    await prisma.deliveryAssignment.update({
      where: { orderId },
      data: { arrivedAt: new Date() },
    });
  } catch (err) {
    console.error("POST /assignments/:orderId/arrive db error", err);
    return res.status(500).json({ error: "Internal server error" });
  }

  try {
    await axios.patch(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/status`, { status: "ARRIVED" });
  } catch (err) {
    console.error("POST /assignments/:orderId/arrive order-service error", err);
    return res.status(502).json({ error: "Order service unreachable" });
  }

  return res.json({ success: true });
});

// POST /assignments/:orderId/deliver
router.post("/:orderId/deliver", requireAuth, requireAgent, async (req, res) => {
  const { orderId } = req.params;
  const { otp } = req.body as { otp?: string };
  const prisma = getPrisma();

  if (!otp) {
    return res.status(400).json({ error: "otp required" });
  }

  try {
    await axios.post(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/verify-delivery-otp`, { otp });
  } catch (err: any) {
    const message = err.response?.data?.error ?? "OTP verification failed";
    return res.status(err.response?.status === 410 ? 410 : 400).json({ error: message });
  }

  try {
    await transitionAssignment(orderId, "DELIVERED", req.user!.userId);
  } catch (err) {
    console.error("POST /assignments/:orderId/deliver transition error", err);
    return res.status(409).json({ error: (err as Error).message });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findUniqueOrThrow({ where: { orderId } });
      await tx.agent.update({
        where: { id: assignment.agentId },
        data: {
          status: "AVAILABLE",
          totalDeliveries: { increment: 1 },
        },
      });
    });
  } catch (err) {
    console.error("POST /assignments/:orderId/deliver agent update error", err);
    return res.status(500).json({ error: "Internal server error" });
  }

  try {
    await axios.post(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/finalize`);
  } catch (err) {
    console.error("POST /assignments/:orderId/deliver finalize error", err);
    return res.status(502).json({ error: "Order service unreachable" });
  }

  // Fire-and-forget — record-cod 409s silently for non-COD orders
  axios.post(`${PAYMENT_SERVICE_URL}/payments/record-cod`, { orderId }).catch(() => {});

  return res.json({ success: true });
});

// POST /assignments/:orderId/absent
router.post("/:orderId/absent", requireAuth, requireAgent, async (req, res) => {
  const { orderId } = req.params;
  const prisma = getPrisma();

  try {
    const existing = await prisma.deliveryAssignment.findUnique({ where: { orderId } });
    if (!existing) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { orderId },
      data: { absentAttempts: { increment: 1 } },
    });

    const newCount = updated.absentAttempts;
    const isAbsent = newCount >= 3;

    if (isAbsent) {
      try {
        await transitionAssignment(orderId, "ABSENT", req.user!.userId);
      } catch (err) {
        console.error("POST /assignments/:orderId/absent transition error", err);
      }

      try {
        await axios.patch(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/status`, { status: "RESCHEDULED" });
      } catch (err) {
        console.error("POST /assignments/:orderId/absent order-service error (non-fatal)", err);
      }

      try {
        await axios.post(`${PAYMENT_SERVICE_URL}/payments/charge-noshow`, { orderId, amount: 9900 });
      } catch (err) {
        console.error("POST /assignments/:orderId/absent payment charge error (non-fatal)", err);
      }

      // Reset agent to AVAILABLE so they can receive new assignments.
      await prisma.agent.update({
        where: { id: existing.agentId },
        data: { status: "AVAILABLE" },
      }).catch((err) => console.error("POST /assignments/:orderId/absent agent reset error (non-fatal)", err));
    }

    return res.json({ absentAttempts: newCount, absent: isAbsent });
  } catch (err) {
    console.error("POST /assignments/:orderId/absent error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
