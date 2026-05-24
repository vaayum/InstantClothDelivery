import amqp from "amqplib";
import axios from "axios";
import { getPrisma } from "./lib/db";
import { publishEvent } from "./lib/rabbitmq";

const EXCHANGE = "threaddash";
const QUEUE = "agent.order.ready";
const ROUTING_KEY = "order.status_changed";
const ROUTING_URL = process.env.ROUTING_SERVICE_URL ?? "http://localhost:8000";
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? "http://localhost:3001";

interface OrderStatusChangedPayload {
  orderId: string;
  from: string;
  to: string;
  actor: string;
  timestamp: string;
}

interface RoutingCandidate {
  agent_id: string;
  eta_to_warehouse_minutes: number;
  eta_to_customer_minutes: number;
  score: number;
}

export async function handleOrderReadyForPickup(payload: OrderStatusChangedPayload): Promise<void> {
  const { orderId } = payload;
  const prisma = getPrisma();

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      address: true,
      warehouse: true,
    },
  });

  const allAgents = await prisma.agent.findMany({
    where: { status: "AVAILABLE" },
    include: {
      assignments: {
        where: { status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } },
      },
    },
  });

  const eligibleAgents = allAgents.filter(
    (a) => a.assignments.length < a.maxConcurrent && a.currentLat !== null && a.currentLng !== null
  );

  if (eligibleAgents.length === 0) {
    console.warn(`[agent-consumer] No eligible agents for order ${orderId}`);
    await publishEvent("assignment.no_agent_available", { orderId, timestamp: new Date().toISOString() });
    return;
  }

  const { data } = await axios.post<{ candidates: RoutingCandidate[] }>(
    `${ROUTING_URL}/assign-agent`,
    {
      warehouse_coords: { lat: order.warehouse.lat, lng: order.warehouse.lng },
      delivery_coords: { lat: order.address.lat, lng: order.address.lng },
      agents: eligibleAgents.map((a) => ({
        agent_id: a.id,
        lat: a.currentLat!,
        lng: a.currentLng!,
        current_order_count: a.assignments.length,
        max_concurrent: a.maxConcurrent,
      })),
    }
  );

  if (!data.candidates || data.candidates.length === 0) {
    console.warn(`[agent-consumer] Routing service returned no candidates for order ${orderId}`);
    await publishEvent("assignment.no_agent_available", { orderId, timestamp: new Date().toISOString() });
    return;
  }

  const best = data.candidates[0];

  await prisma.$transaction(async (tx) => {
    await tx.deliveryAssignment.upsert({
      where: { orderId },
      create: { orderId, agentId: best.agent_id, status: "ASSIGNED" },
      update: {
        agentId: best.agent_id,
        status: "ASSIGNED",
        assignedAt: new Date(),
        acceptedAt: null,
        pickedUpAt: null,
        arrivedAt: null,
        deliveredAt: null,
        absentAttempts: 0,
      },
    });
    await tx.agent.update({
      where: { id: best.agent_id },
      data: { status: "EN_ROUTE_WAREHOUSE" },
    });
  });

  try {
    await axios.patch(`${ORDER_SERVICE_URL}/${orderId}/status`, { status: "AGENT_ASSIGNED" });
  } catch (err) {
    console.error(`[agent-consumer] Failed to update order ${orderId} status to AGENT_ASSIGNED:`, err);
  }

  await publishEvent("assignment.status_changed", {
    orderId,
    agentId: best.agent_id,
    from: "UNASSIGNED",
    to: "ASSIGNED",
    actor: "system",
    timestamp: new Date().toISOString(),
  });
}

export async function startConsumer(): Promise<void> {
  const conn = await amqp.connect(
    process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672"
  );
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  const q = await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, ROUTING_KEY);

  ch.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString()) as OrderStatusChangedPayload;
      if (payload.to !== "READY_FOR_PICKUP") {
        ch.ack(msg);
        return;
      }
      await handleOrderReadyForPickup(payload);
      ch.ack(msg);
    } catch (err) {
      console.error(`[agent-consumer] Failed to process message:`, err);
      ch.nack(msg, false, false);
    }
  });
}
