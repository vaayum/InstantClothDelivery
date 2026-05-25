import { Router } from "express";
import crypto from "crypto";
import axios from "axios";
import { getPrisma } from "../lib/db";
import { getRazorpay } from "../lib/razorpay";

const ORDER_URL = process.env.ORDER_SERVICE_URL ?? "http://localhost:3001";

const router = Router();

// POST /payments/create-order
// Called by order-service after order is created
router.post("/create-order", async (req, res) => {
  const { orderId, amount } = req.body as { orderId: string; amount: number };
  if (!orderId || typeof amount !== "number") {
    return res.status(400).json({ error: "orderId and numeric amount (paise) required" });
  }

  const prisma = getPrisma();
  const razorpay = getRazorpay();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  try {
    const rzpOrder = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: orderId,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { razorpayOrderId: rzpOrder.id as string },
    });

    return res.json({ razorpayOrderId: rzpOrder.id, amount });
  } catch (err) {
    console.error("[payment] create-order failed:", err);
    return res.status(502).json({ error: "Razorpay order creation failed" });
  }
});

// POST /payments/capture
// Called by order-service trial.ts when customer keeps items after trial
router.post("/capture", async (req, res) => {
  const { orderId, amount } = req.body as { orderId: string; amount: number };
  if (!orderId || typeof amount !== "number") {
    return res.status(400).json({ error: "orderId and numeric amount (paise) required" });
  }

  const prisma = getPrisma();
  const razorpay = getRazorpay();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.razorpayOrderId) {
    return res.status(409).json({ error: "No Razorpay order on record" });
  }

  try {
    const payments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
    const authorized = (payments as any).items?.find(
      (p: any) => p.status === "authorized"
    );
    if (!authorized) {
      return res.status(409).json({ error: "No authorized payment found" });
    }

    await razorpay.payments.capture(authorized.id, amount, "INR");

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "CAPTURED" },
    });

    return res.json({ success: true, paymentId: authorized.id });
  } catch (err) {
    console.error("[payment] capture failed:", err);
    return res.status(502).json({ error: "Capture failed" });
  }
});

// POST /payments/refund
// Called by order-service trial.ts when customer returns items
router.post("/refund", async (req, res) => {
  const { orderId, amount } = req.body as { orderId: string; amount: number };
  if (!orderId || typeof amount !== "number") {
    return res.status(400).json({ error: "orderId and numeric amount (paise) required" });
  }

  const prisma = getPrisma();
  const razorpay = getRazorpay();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.razorpayOrderId) {
    return res.status(409).json({ error: "No Razorpay order on record" });
  }

  try {
    const payments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
    const captured = (payments as any).items?.find(
      (p: any) => p.status === "captured"
    );
    if (!captured) {
      return res.status(409).json({ error: "No captured payment to refund" });
    }

    await razorpay.payments.refund(captured.id, { amount });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "REFUNDED" },
    });

    return res.json({ success: true, paymentId: captured.id, refundedAmount: amount });
  } catch (err) {
    console.error("[payment] refund failed:", err);
    return res.status(502).json({ error: "Refund failed" });
  }
});

// POST /payments/charge-noshow
// Called by agent-service when customer is absent 3 times (9900 paise = ₹99)
router.post("/charge-noshow", async (req, res) => {
  const { orderId, amount = 9900 } = req.body as { orderId: string; amount?: number };
  if (!orderId) {
    return res.status(400).json({ error: "orderId required" });
  }

  const prisma = getPrisma();
  const razorpay = getRazorpay();

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  try {
    const rzpOrder = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `noshow-${orderId}`,
    });

    console.log(`[payment] No-show order created for ${orderId}: ${rzpOrder.id}, amount: ${amount}`);

    return res.json({ razorpayOrderId: rzpOrder.id, amount });
  } catch (err) {
    console.error("[payment] charge-noshow failed:", err);
    return res.status(502).json({ error: "No-show charge failed" });
  }
});

// POST /payments/webhook
// Razorpay webhook — verifies HMAC signature, updates paymentStatus on Order
router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const rawBody = req.body as Buffer;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(signature ?? "");
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  const { event, payload } = JSON.parse(rawBody.toString()) as {
    event: string;
    payload: { payment: { entity: { order_id: string } } };
  };

  const razorpayOrderId = payload?.payment?.entity?.order_id;
  if (!razorpayOrderId) return res.status(200).json({ ok: true });

  const statusMap: Record<string, string> = {
    "payment.authorized": "AUTHORIZED",
    "payment.captured": "CAPTURED",
    "payment.failed": "FAILED",
    "refund.created": "REFUNDED",
  };

  const newStatus = statusMap[event];
  if (newStatus) {
    const prisma = getPrisma();
    await prisma.order.updateMany({
      where: { razorpayOrderId },
      data: { paymentStatus: newStatus as any },
    });

    if (event === "payment.failed") {
      const order = await prisma.order.findFirst({ where: { razorpayOrderId }, select: { id: true } });
      if (order) {
        axios
          .post(`${ORDER_URL}/internal/orders/${order.id}/cancel`)
          .catch((err) => console.error(`[webhook] order cancel failed for ${order.id}:`, err?.message));
      }
    }
  }

  return res.status(200).json({ ok: true });
});

export default router;
