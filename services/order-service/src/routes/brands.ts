import { Router } from "express";
import { getPrisma } from "../lib/db";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  try {
    const prisma = getPrisma();
    const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
    res.json(brands);
  } catch {
    res.status(500).json({ error: "Failed to fetch brands" });
  }
});

export default router;
