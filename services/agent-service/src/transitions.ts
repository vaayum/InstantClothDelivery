import { AssignmentStatus } from "@prisma/client";
import { getPrisma } from "./lib/db";
import { publishEvent } from "./lib/rabbitmq";

export const VALID_ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  ASSIGNED:    ["ACCEPTED", "DECLINED", "ABSENT", "RESCHEDULED"],
  ACCEPTED:    ["PICKED_UP", "ABSENT", "RESCHEDULED"],
  PICKED_UP:   ["DELIVERED"],
  DELIVERED:   [],
  DECLINED:    [],
  ABSENT:      [],
  RESCHEDULED: ["ASSIGNED"],
};

export function isValidAssignmentTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return (VALID_ASSIGNMENT_TRANSITIONS[from] ?? []).includes(to);
}

function timestampFieldForStatus(status: AssignmentStatus): Record<string, Date> {
  const now = new Date();
  switch (status) {
    case "ACCEPTED":  return { acceptedAt: now };
    case "PICKED_UP": return { pickedUpAt: now };
    case "DELIVERED": return { deliveredAt: now };
    default:          return {};
  }
}

export async function transitionAssignment(
  orderId: string,
  newStatus: AssignmentStatus,
  actor: string
) {
  const prisma = getPrisma();
  const assignment = await prisma.deliveryAssignment.findUniqueOrThrow({ where: { orderId } });

  if (!isValidAssignmentTransition(assignment.status, newStatus)) {
    throw new Error(`Cannot transition assignment from ${assignment.status} to ${newStatus}`);
  }

  const updated = await prisma.deliveryAssignment.update({
    where: { orderId },
    data: { status: newStatus, ...timestampFieldForStatus(newStatus) },
  });

  await publishEvent("assignment.status_changed", {
    orderId,
    agentId: assignment.agentId,
    from: assignment.status,
    to: newStatus,
    actor,
    timestamp: new Date().toISOString(),
  });

  return updated;
}
