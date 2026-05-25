import { getPrisma } from "./lib/db";
import { sendPush } from "./lib/firebase";
import { sendSms } from "./lib/twilio";

function isCustomerDnd(): boolean {
  const utcHours = new Date().getUTCHours();
  const utcMinutes = new Date().getUTCMinutes();
  const istMinutes = utcHours * 60 + utcMinutes + 330; // UTC+5:30
  const istHour = Math.floor((istMinutes % 1440) / 60);
  return istHour >= 22 || istHour < 8;
}

async function getFcmToken(userId: string): Promise<string | null> {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  return user?.fcmToken ?? null;
}

async function getPhone(userId: string): Promise<string | null> {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { phone: true } });
  return user?.phone ?? null;
}

async function pushCustomer(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (isCustomerDnd()) return;
  const token = await getFcmToken(userId);
  if (token) await sendPush(token, title, body, data);
}

async function pushAgent(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const token = await getFcmToken(userId);
  if (token) await sendPush(token, title, body, data);
}

export async function handleEvent(routingKey: string, payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown>;

  if (routingKey === "order.placed") {
    const customerId = p.customerId as string;
    const orderId = p.orderId as string;
    await pushCustomer(customerId, "Order Confirmed!", "Your order is being picked.", { orderId });
  } else if (routingKey === "order.status_changed") {
    const customerId = p.customerId as string | undefined;
    const agentId = p.agentId as string | undefined;
    const orderId = p.orderId as string;
    const status = p.status as string;

    if (status === "PICKING") {
      if (customerId) await pushCustomer(customerId, "Packing your order", "Your order is being packed.", { orderId });
    } else if (status === "OUT_FOR_DELIVERY") {
      if (customerId) await pushCustomer(customerId, "On the way!", "Your delivery is heading to you.", { orderId });
    } else if (status === "ARRIVED") {
      if (customerId) {
        await pushCustomer(customerId, "Agent arrived!", "Your delivery agent is here. Please collect your order.", { orderId });
        const phone = await getPhone(customerId);
        if (phone) await sendSms(phone, "Your ThreadDash delivery has arrived! Please collect your order.");
      }
    } else if (status === "TRIAL_IN_PROGRESS") {
      if (customerId) await pushCustomer(customerId, "Trial started!", "30-minute try-on window started. Keep what you love!", { orderId });
    } else if (status === "COMPLETED") {
      if (customerId) await pushCustomer(customerId, "Order complete", "Thanks for shopping with ThreadDash!", { orderId });
    } else if (status === "CANCELLED") {
      if (customerId) await pushCustomer(customerId, "Order cancelled", "Your order has been cancelled.", { orderId });
      if (agentId) await pushAgent(agentId, "Order cancelled", "The order has been cancelled.", { orderId });
    }
  } else if (routingKey === "assignment.status_changed") {
    const agentId = p.agentId as string;
    const status = p.status as string;
    const orderId = p.orderId as string;

    if (status === "ASSIGNED") {
      await pushAgent(agentId, "New delivery request", "You have a new delivery assigned to you.", { orderId });
    } else if (status === "ACCEPTED") {
      // No external notification needed — internal state
    } else if (status === "COMPLETED") {
      await pushAgent(agentId, "Delivery complete", "Great work! Delivery marked complete.", { orderId });
    }
  } else if (routingKey === "assignment.no_agent_available") {
    const orderId = p.orderId as string;
    console.error(
      `[notification] NO AGENT AVAILABLE — orderId=${orderId} at ${new Date().toISOString()}`
    );
    // TODO: replace with admin push/SMS once admin FCM token is stored
  } else if (routingKey === "order.absent_threshold_reached") {
    const customerId = p.customerId as string;
    const orderId = p.orderId as string;
    const fee = p.fee as number | undefined;
    const feeText = fee ? `A no-show fee of ₹${(fee / 100).toFixed(0)} will be charged.` : "A no-show fee will be charged.";

    const phone = await getPhone(customerId);
    if (phone) await sendSms(phone, `ThreadDash: Your delivery agent couldn't reach you. ${feeText}`);
    await pushCustomer(customerId, "Missed delivery!", feeText, { orderId });
  }
}
