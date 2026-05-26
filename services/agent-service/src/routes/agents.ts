import { Router } from "express";
import axios from "axios";
import { AgentStatus } from "@prisma/client";
import { requireAuth, signJwt } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { requireRole } from "../lib/role";

const router = Router();
const requireAgent = requireRole("AGENT");
const REALTIME_SERVICE_URL = process.env.REALTIME_SERVICE_URL ?? "http://localhost:3005";

const SELF_TOGGLE_STATUSES: AgentStatus[] = ["AVAILABLE", "OFF_DUTY"];

// POST /agents — register a new agent profile
router.post("/", requireAuth, async (req, res) => {
  const { userId, vehicleType } = req.body as { userId?: string; vehicleType?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const prisma = getPrisma();
  try {
    const existing = await prisma.agent.findUnique({ where: { userId } });
    if (existing) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const token = user ? signJwt({ userId, role: "AGENT", phone: user.phone }) : null;
      return res.status(409).json({ error: "Agent profile already exists", agent: existing, token });
    }

    const [agent, user] = await Promise.all([
      prisma.agent.create({ data: { userId, vehicleType: vehicleType ?? "two_wheeler" } }),
      prisma.user.update({ where: { id: userId }, data: { role: "AGENT" } }),
    ]);

    const newToken = signJwt({ userId, role: "AGENT", phone: user.phone });
    return res.status(201).json({ ...agent, token: newToken });
  } catch (err) {
    console.error("POST /agents error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /agents/:agentId
router.get("/:agentId", requireAuth, async (req, res) => {
  const { agentId } = req.params;
  const prisma = getPrisma();

  try {
    const agent = await prisma.agent.findFirst({
      where: { OR: [{ id: agentId }, { userId: agentId }] },
      include: {
        _count: {
          select: {
            assignments: {
              where: { status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } },
            },
          },
        },
        assignments: {
          where: { status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } },
          take: 1,
          include: {
            order: {
              select: {
                id: true,
                address: { select: { formattedAddress: true } },
                items: {
                  select: { id: true, skuId: true, quantity: true, price: true },
                },
              },
            },
          },
        },
      },
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const { assignments, ...rest } = agent as any;
    return res.json({
      ...rest,
      activeAssignment: assignments?.[0]
        ? {
            ...assignments[0],
            order: assignments[0].order
              ? {
                  id: assignments[0].order.id,
                  deliveryAddress: assignments[0].order.address?.formattedAddress ?? "",
                  items: assignments[0].order.items,
                }
              : undefined,
          }
        : undefined,
    });
  } catch (err) {
    console.error("GET /agents/:agentId error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /agents/:agentId/location
router.patch("/:agentId/location", requireAuth, requireAgent, async (req, res) => {
  const { agentId } = req.params;
  const { lat, lng } = req.body as { lat: unknown; lng: unknown };

  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return res.status(400).json({ error: "lat and lng are required" });
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng must be numbers" });
  }

  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.agent.update({
        where: { id: agentId },
        data: {
          currentLat: lat,
          currentLng: lng,
          lastUpdatedAt: new Date(),
        },
      });
    });

    const timestamp = new Date().toISOString();
    await getRedis().set(
      `agent:location:${agentId}`,
      JSON.stringify({ lat, lng, timestamp }),
      "EX",
      300
    );

    const activeAssignment = await prisma.deliveryAssignment.findFirst({
      where: { agentId, status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] } },
    });
    if (activeAssignment) {
      axios.post(`${REALTIME_SERVICE_URL}/emit/agent-location`, {
        agentId,
        orderId: activeAssignment.orderId,
        lat,
        lng,
        timestamp,
      }).catch((err) => console.error("[location] realtime push failed (non-fatal):", err));
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /agents/:agentId/location error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /agents/:agentId/status
router.patch("/:agentId/status", requireAuth, requireAgent, async (req, res) => {
  const { agentId } = req.params;
  const { status } = req.body as { status: unknown };

  if (!status || !SELF_TOGGLE_STATUSES.includes(status as AgentStatus)) {
    return res.status(400).json({
      error: `status must be one of: ${SELF_TOGGLE_STATUSES.join(", ")}`,
    });
  }

  const prisma = getPrisma();

  try {
    await prisma.agent.update({
      where: { id: agentId },
      data: { status: status as AgentStatus },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /agents/:agentId/status error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
