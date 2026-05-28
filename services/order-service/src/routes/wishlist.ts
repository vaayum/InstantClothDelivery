import { Router } from "express";
import { getPrisma } from "../lib/db";
import { requireAuth } from "@threaddash/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.user!.userId;
  const prisma = getPrisma();
  const items = await prisma.wishlist.findMany({
    where: { userId },
    select: { productId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json(items);
});

router.post("/", async (req, res) => {
  const userId = req.user!.userId;
  const { productId } = req.body as { productId: string };
  if (!productId) return res.status(400).json({ error: "productId required" });
  const prisma = getPrisma();
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  const item = await prisma.wishlist.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
  return res.status(201).json(item);
});

router.delete("/:productId", async (req, res) => {
  const userId = req.user!.userId;
  const { productId } = req.params;
  const prisma = getPrisma();
  await prisma.wishlist.deleteMany({ where: { userId, productId } });
  return res.json({ success: true });
});

export default router;
