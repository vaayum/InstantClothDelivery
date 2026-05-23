import cron from "node-cron";
import { getPrisma } from "./lib/db";
import { getRedis } from "./lib/redis";
import { publishEvent } from "./lib/rabbitmq";

const SLA_TOTAL_MINUTES = 45;
const SLA_WARNING_MINUTES = 36; // 80% of 45

export async function checkSlaOnce(): Promise<void> {
  const prisma = getPrisma();
  const redis = getRedis();
  const now = Date.now();

  const activeOrders = await prisma.order.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      createdAt: { gte: new Date(now - 3 * 60 * 60 * 1000) },
    },
    select: { id: true, createdAt: true },
  });

  for (const order of activeOrders) {
    const elapsedMin = (now - order.createdAt.getTime()) / 60000;

    if (elapsedMin >= SLA_WARNING_MINUTES) {
      const warned = await redis.get(`sla:warn:${order.id}`);
      if (!warned) {
        await publishEvent("order.sla_warning", {
          orderId: order.id,
          elapsedMin: Math.floor(elapsedMin),
        });
        await redis.set(`sla:warn:${order.id}`, "1", "EX", 7200);
      }
    }

    if (elapsedMin >= SLA_TOTAL_MINUTES) {
      const breached = await redis.get(`sla:breach:${order.id}`);
      if (!breached) {
        await publishEvent("order.sla_breach", {
          orderId: order.id,
          elapsedMin: Math.floor(elapsedMin),
        });
        await redis.set(`sla:breach:${order.id}`, "1", "EX", 7200);
        await prisma.order.update({
          where: { id: order.id },
          data: { slaBreach: true },
        });
      }
    }
  }
}

export function startSlaMonitor(): cron.ScheduledTask {
  return cron.schedule("* * * * *", checkSlaOnce);
}
