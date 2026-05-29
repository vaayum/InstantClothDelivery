import { Router } from "express";
import { getPrisma } from "../lib/db";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  const prisma = getPrisma();
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
  res.json(brands);
});

export default router;
