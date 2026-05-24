import amqp from "amqplib";
import { getPrisma } from "./lib/db";

const EXCHANGE = "threaddash";
const QUEUE = "warehouse.order.placed";
const ROUTING_KEY = "order.placed";
const SLA_MINUTES = 45;

export async function handleOrderPlaced(payload: {
  orderId: string;
  warehouseId: string;
}): Promise<void> {
  const prisma = getPrisma();
  const items = await prisma.orderItem.findMany({ where: { orderId: payload.orderId } });
  const slaDeadline = new Date(Date.now() + SLA_MINUTES * 60 * 1000);

  await prisma.pickingTask.create({
    data: {
      orderId: payload.orderId,
      warehouseId: payload.warehouseId,
      status: "PENDING",
      slaDeadline,
      items: {
        create: items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          status: "PENDING",
        })),
      },
    },
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
      const payload = JSON.parse(msg.content.toString());
      await handleOrderPlaced(payload);
      ch.ack(msg);
    } catch (err) {
      console.error(`[warehouse-consumer] Failed to process message:`, err);
      ch.nack(msg, false, false);
    }
  });
}
