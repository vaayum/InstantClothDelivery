import amqp from "amqplib";
import axios from "axios";
import { getPrisma } from "./lib/db";
import { publishEvent } from "./lib/rabbitmq";

const EXCHANGE = "threaddash";
const QUEUE = "agent.order.placed";
const ROUTING_KEY = "order.placed";
const ROUTING_URL = process.env.ROUTING_SERVICE_URL ?? "http://localhost:8000";
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? "http://localhost:3001";

interface OrderPlacedPayload {
  orderId: string;
  warehouseId: string;
  userId: string;
  isTryOrder: boolean;
  timestamp: string;
}

interface RoutingCandidate {
  agent_id: string;
  eta_to_warehouse_minutes: number;
  eta_to_customer_minutes: number;
  score: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handleOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
  const { orderId } = payload;
  const prisma = getPrisma();

  // Step through warehouse states so the customer tracking screen
  // shows intermediate progress before agent assignment.
  await axios.patch(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/status`, { status: "WAREHOUSE_PROCESSING" });
  await delay(3000);
  await axios.patch(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/status`, { status: "READY_FOR_PICKUP" });
  await delay(2000);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { address: true, warehouse: true },
  });

  const allAgents = await prisma.agent.findMany({
    where: { status: "AVAILABLE" },
    include: {
      assignments: {
        where: { status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } },
      },
    },
  });

  const eligibleAgents = allAgents.filter((a) => a.assignments.length < a.maxConcurrent);

  if (eligibleAgents.length === 0) {
    console.warn(`[agent-consumer] No eligible agents for order ${orderId}`);
    await publishEvent("assignment.no_agent_available", { orderId, timestamp: new Date().toISOString() });
    return;
  }

  // Use routing service when agents have GPS; otherwise pick first available
  const agentsWithGps = eligibleAgents.filter((a) => a.currentLat !== null && a.currentLng !== null);
  let bestAgentId: string;

  if (agentsWithGps.length > 0) {
    const { data } = await axios.post<{ candidates: RoutingCandidate[] }>(
      `${ROUTING_URL}/assign-agent`,
      {
        warehouse_coords: { lat: order.warehouse.lat, lng: order.warehouse.lng },
        delivery_coords: { lat: order.address.lat, lng: order.address.lng },
        agents: agentsWithGps.map((a) => ({
          agent_id: a.id,
          lat: a.currentLat!,
          lng: a.currentLng!,
          current_order_count: a.assignments.length,
          max_concurrent: a.maxConcurrent,
        })),
      }
    );
    bestAgentId = data.candidates?.[0]?.agent_id ?? agentsWithGps[0].id;
  } else {
    bestAgentId = eligibleAgents[0].id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryAssignment.upsert({
      where: { orderId },
      create: { orderId, agentId: bestAgentId, status: "ASSIGNED" },
      update: {
        agentId: bestAgentId,
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
      where: { id: bestAgentId },
      data: { status: "EN_ROUTE_WAREHOUSE" },
    });
  });

  try {
    await axios.patch(`${ORDER_SERVICE_URL}/internal/orders/${orderId}/status`, { status: "AGENT_ASSIGNED" });
  } catch (err) {
    console.error(`[agent-consumer] Failed to update order ${orderId} status:`, err);
  }

  await publishEvent("assignment.status_changed", {
    orderId,
    agentId: bestAgentId,
    from: "UNASSIGNED",
    to: "ASSIGNED",
    actor: "system",
    timestamp: new Date().toISOString(),
  });

  console.log(`[agent-consumer] Assigned order ${orderId} to agent ${bestAgentId}`);
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
      const payload = JSON.parse(msg.content.toString()) as OrderPlacedPayload;
      await handleOrderPlaced(payload);
      ch.ack(msg);
    } catch (err) {
      console.error(`[agent-consumer] Failed to process message:`, err);
      ch.nack(msg, false, false);
    }
  });

  console.log(`[agent-consumer] Listening on queue ${QUEUE}`);
}
