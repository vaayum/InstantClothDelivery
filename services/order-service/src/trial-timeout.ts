import cron from "node-cron";
import axios from "axios";
import { getPrisma } from "./lib/db";
import { getRedis } from "./lib/redis";
import { publishEvent } from "./lib/rabbitmq";
import { transitionOrder } from "./transitions";

const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";
const PAYMENT_URL = process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3004";
const REALTIME_URL = process.env.REALTIME_SERVICE_URL ?? "http://localhost:3005";

export async function expireTrials(): Promise<void> {
  const prisma = getPrisma();
  const now = new Date();

  const expired = await prisma.order.findMany({
    where: {
      status: "TRIAL_IN_PROGRESS",
      trialEndsAt: { lt: now },
    },
    include: { items: true },
  });

  for (const order of expired) {
    try {
      const toReturn = order.items.filter((i) => i.status !== "KEPT");
      const keptItems = order.items.filter((i) => i.status === "KEPT");

      await Promise.all(
        toReturn.map((item) =>
          prisma.orderItem.update({ where: { id: item.id }, data: { status: "RETURNED" } })
        )
      );

      if (toReturn.length > 0) {
        const releaseItems = toReturn.map((i) => ({
          skuId: i.skuId,
          warehouseId: order.warehouseId,
          quantity: i.quantity,
        }));
        await axios
          .post(`${WAREHOUSE_URL}/inventory/release`, { items: releaseItems })
          .catch((err) =>
            console.error(`[trial-timeout] inventory release failed for ${order.id}:`, err?.message)
          );
      }

      const returnedAmount = toReturn.reduce((sum, i) => sum + i.price * i.quantity, 0);
      if (returnedAmount > 0) {
        axios
          .post(`${PAYMENT_URL}/payments/refund`, { orderId: order.id, amount: returnedAmount })
          .catch((err) =>
            console.error(`[trial-timeout] refund failed for ${order.id}:`, err?.message)
          );
      }

      await transitionOrder(order.id, "COMPLETED", "system:trial-timeout");

      await publishEvent("order.completed", {
        orderId: order.id,
        keptSkuIds: keptItems.map((i) => i.skuId),
        returnedSkuIds: toReturn.map((i) => i.skuId),
        timestamp: new Date().toISOString(),
      });

      const redis = getRedis();
      await Promise.all([
        redis.del(`trial:order:${order.id}`),
        redis.del(`sla:order:${order.id}`),
      ]);

      console.log(`[trial-timeout] Order ${order.id} auto-completed after trial expiry`);
    } catch (err) {
      console.error(`[trial-timeout] Failed to expire trial for order ${order.id}:`, err);
    }
  }
}

async function broadcastTrialTimers(): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys("trial:order:*");
  if (keys.length === 0) return;

  await Promise.all(
    keys.map(async (key) => {
      const val = await redis.get(key);
      if (!val) return;
      const orderId = key.replace("trial:order:", "");
      const secondsRemaining = Math.max(
        0,
        Math.floor((new Date(val).getTime() - Date.now()) / 1000)
      );
      await axios
        .post(`${REALTIME_URL}/emit/trial-timer`, { orderId, secondsRemaining })
        .catch(() => {});
    })
  );
}

export function startTrialTimeoutMonitor(): void {
  cron.schedule("* * * * *", () => {
    expireTrials().catch((err) =>
      console.error("[trial-timeout] Cron error:", err)
    );
  });
}

export function startTrialTimerBroadcast(): void {
  cron.schedule("*/30 * * * * *", () => {
    broadcastTrialTimers().catch((err) =>
      console.error("[trial-timer-broadcast] Cron error:", err)
    );
  });
}
