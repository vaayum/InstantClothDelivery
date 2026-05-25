import amqp from "amqplib";

const EXCHANGE = "threaddash";
const QUEUE = "notification.events";
const BINDING_KEYS = [
  "order.placed",
  "order.status_changed",
  "assignment.status_changed",
  "order.absent_threshold_reached",
];

export async function startConsumer(
  handler: (routingKey: string, payload: unknown) => Promise<void>
): Promise<void> {
  const url = process.env.RABBITMQ_URL ?? "amqp://localhost";
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();

  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  for (const key of BINDING_KEYS) await ch.bindQueue(QUEUE, EXCHANGE, key);

  ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(msg.fields.routingKey, payload);
      ch.ack(msg);
    } catch (err) {
      console.error("[rabbitmq] handler error:", err);
      ch.nack(msg, false, false);
    }
  });

  console.log("[notification] RabbitMQ consumer started");
}
