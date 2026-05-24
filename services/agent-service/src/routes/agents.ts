import { Router } from "express";
import { AgentStatus } from "@prisma/client";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { requireRole } from "../lib/role";

const router = Router();
const requireAgent = requireRole("AGENT");

const SELF_TOGGLE_STATUSES: AgentStatus[] = ["AVAILABLE", "OFF_DUTY"];

// GET /agents/:agentId
router.get("/:agentId", requireAuth, async (req, res) => {
  const { agentId } = req.params;
  const prisma = getPrisma();

  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        _count: {
          select: {
            assignments: {
              where: {
                status: { in: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] },
              },
            },
          },
        },
      },
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    return res.json(agent);
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

    await getRedis().set(
      `agent:location:${agentId}`,
      JSON.stringify({ lat, lng, timestamp: new Date().toISOString() }),
      "EX",
      300
    );

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
