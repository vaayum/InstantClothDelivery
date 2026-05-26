import { Router } from "express";
import { getPrisma } from "../lib/db";

const router = Router();

router.get("/", async (_req, res): Promise<void> => {
  const products = await getPrisma().product.findMany({
    where: { isActive: true },
    include: { skus: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

router.get("/:id", async (req, res): Promise<void> => {
  const product = await getPrisma().product.findUnique({
    where: { id: req.params.id },
    include: { skus: true },
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(product);
});

export default router;
