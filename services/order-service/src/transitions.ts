import { OrderStatus } from "@prisma/client";
import { getPrisma } from "./lib/db";
import { publishEvent } from "./lib/rabbitmq";

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING:              ["WAREHOUSE_PROCESSING", "CANCELLED"],
  WAREHOUSE_PROCESSING: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP:     ["AGENT_ASSIGNED"],
  AGENT_ASSIGNED:       ["AGENT_EN_ROUTE", "CANCELLED"],
  AGENT_EN_ROUTE:       ["ARRIVED"],
  ARRIVED:              ["TRIAL_IN_PROGRESS", "COMPLETED", "RESCHEDULED"],
  TRIAL_IN_PROGRESS:    ["COMPLETED"],
  COMPLETED:            [],
  CANCELLED:            [],
  RESCHEDULED:          ["AGENT_ASSIGNED"],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export async function transitionOrder(
  orderId: string,
  newStatus: OrderStatus,
  actor: string
) {
  const prisma = getPrisma();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  if (!isValidTransition(order.status, newStatus)) {
    throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus },
  });

  await publishEvent("order.status_changed", {
    orderId,
    from: order.status,
    to: newStatus,
    actor,
    timestamp: new Date().toISOString(),
  });

  return updated;
}
