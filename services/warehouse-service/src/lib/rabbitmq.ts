import amqp from "amqplib";
import type { Channel } from "amqplib";

let channel: Channel | null = null;

export async function getChannel(): Promise<Channel> {
  if (!channel) {
    const conn = await amqp.connect(
      process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672"
    );
    channel = await conn.createChannel();
    await channel.assertExchange("threaddash", "topic", { durable: true });
  }
  return channel;
}

export async function publishEvent(routingKey: string, payload: object): Promise<void> {
  const ch = await getChannel();
  ch.publish(
    "threaddash",
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
}
