import cron from "node-cron";
import { getPrisma } from "./lib/db";
import { publishEvent } from "./lib/rabbitmq";

const ACCEPT_TIMEOUT_MINUTES = 3;

async function expireStaleAssignments(): Promise<void> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - ACCEPT_TIMEOUT_MINUTES * 60 * 1000);

  const stale = await prisma.deliveryAssignment.findMany({
    where: { status: "ASSIGNED", assignedAt: { lt: cutoff } },
  });

  for (const assignment of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.deliveryAssignment.update({
          where: { id: assignment.id },
          data: { status: "DECLINED" },
        });
        await tx.agent.update({
          where: { id: assignment.agentId },
          data: { status: "AVAILABLE" },
        });
      });

      await publishEvent("order.status_changed", {
        orderId: assignment.orderId,
        from: "AGENT_ASSIGNED",
        to: "READY_FOR_PICKUP",
        actor: "system:accept-timeout",
        timestamp: new Date().toISOString(),
      });

      console.log(`[accept-timeout] Assignment ${assignment.id} expired, re-queuing order ${assignment.orderId}`);
    } catch (err) {
      console.error(`[accept-timeout] Failed to expire assignment ${assignment.id}:`, err);
    }
  }
}

export function startAcceptTimeoutMonitor(): void {
  cron.schedule("* * * * *", () => {
    expireStaleAssignments().catch((err) =>
      console.error("[accept-timeout] Cron error:", err)
    );
  });
}
