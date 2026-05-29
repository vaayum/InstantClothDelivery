import { Router } from "express";
import { getPresignedUploadUrl, cdnUrl } from "../lib/s3";
import { getPrisma } from "../lib/db";

const router = Router();
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

router.post("/presign", async (req, res): Promise<void> => {
  const { entityType, entityId, contentType } = req.body as {
    entityType: "product" | "brand";
    entityId: string;
    contentType: string;
  };
  if (!entityType || !entityId || !contentType) {
    res.status(400).json({ error: "entityType, entityId, and contentType are required" });
    return;
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    res.status(400).json({ error: "contentType must be image/jpeg, image/png, or image/webp" });
    return;
  }
  const ext = EXT_MAP[contentType];
  const filename = `${crypto.randomUUID()}.${ext}`;
  const key = entityType === "brand"
    ? `brands/${entityId}/${filename}`
    : `products/${entityId}/${filename}`;

  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  res.json({ uploadUrl, cdnUrl: cdnUrl(key), key });
});

router.post("/products/:id/images", async (req, res): Promise<void> => {
  const { cdnUrl: imageUrl } = req.body as { cdnUrl: string };
  const prisma = getPrisma();
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const existing = (product.images as string[]) ?? [];
  await prisma.product.update({
    where: { id: req.params.id },
    data: { images: [...existing, imageUrl] },
  });
  res.json({ success: true });
});

router.patch("/brands/:id/logo", async (req, res): Promise<void> => {
  const { logoUrl } = req.body as { logoUrl: string };
  const prisma = getPrisma();
  const brand = await prisma.brand.findUnique({ where: { id: req.params.id } });
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  await prisma.brand.update({ where: { id: req.params.id }, data: { logoUrl } });
  res.json({ success: true });
});

export default router;
