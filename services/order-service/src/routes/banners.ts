import { Router } from "express";
import { getPrisma } from "../lib/db";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  const prisma = getPrisma();
  const now = new Date();

  const banners = await prisma.banner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { sortOrder: "asc" },
  });

  res.json(banners);
});

export default router;
