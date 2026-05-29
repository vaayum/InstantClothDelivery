import { Router } from "express";
import { requireAuth } from "@threaddash/auth";
import { getPresignedUploadUrl, cdnUrl as buildCdnUrl } from "../lib/s3";
import { getPrisma } from "../lib/db";

const router = Router();
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

// All media write endpoints require authentication
router.use(requireAuth);

// Guard against path traversal: entityId must be a UUID or simple slug
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

function isAllowedUrl(url: string): boolean {
  const cdn = process.env.CLOUDFRONT_DOMAIN;
  const endpoint = process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566";
  const bucket = process.env.AWS_S3_BUCKET ?? "threaddash-media";
  const allowed = cdn ? [cdn] : [`${endpoint}/${bucket}`];
  return allowed.some((prefix) => url.startsWith(prefix));
}

router.post("/presign", async (req, res): Promise<void> => {
  try {
    const { entityType, entityId, contentType } = req.body as {
      entityType: "product" | "brand";
      entityId: string;
      contentType: string;
    };
    if (!entityType || !entityId || !contentType) {
      res.status(400).json({ error: "entityType, entityId, and contentType are required" });
      return;
    }
    if (entityType !== "product" && entityType !== "brand") {
      res.status(400).json({ error: "entityType must be 'product' or 'brand'" });
      return;
    }
    if (!isSafeId(entityId)) {
      res.status(400).json({ error: "entityId contains invalid characters" });
      return;
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      res.status(400).json({ error: "contentType must be image/jpeg, image/png, or image/webp" });
      return;
    }

    const prisma = getPrisma();
    if (entityType === "product") {
      const product = await prisma.product.findUnique({ where: { id: entityId } });
      if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    } else {
      const brand = await prisma.brand.findUnique({ where: { id: entityId } });
      if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
    }

    const ext = EXT_MAP[contentType];
    const filename = `${crypto.randomUUID()}.${ext}`;
    const key = entityType === "brand"
      ? `brands/${entityId}/${filename}`
      : `products/${entityId}/${filename}`;

    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, cdnUrl: buildCdnUrl(key), key });
  } catch {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/products/:id/images", async (req, res): Promise<void> => {
  try {
    const { cdnUrl: imageUrl } = req.body as { cdnUrl: string };
    if (!imageUrl || typeof imageUrl !== "string") {
      res.status(400).json({ error: "cdnUrl is required" });
      return;
    }
    if (!isAllowedUrl(imageUrl)) {
      res.status(400).json({ error: "cdnUrl must point to the configured CDN origin" });
      return;
    }
    const prisma = getPrisma();
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    const existing = (product.images as string[]) ?? [];
    await prisma.product.update({
      where: { id: req.params.id },
      data: { images: [...existing, imageUrl] },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update product images" });
  }
});

router.patch("/brands/:id/logo", async (req, res): Promise<void> => {
  try {
    const { logoUrl } = req.body as { logoUrl: string };
    if (!logoUrl || typeof logoUrl !== "string") {
      res.status(400).json({ error: "logoUrl is required" });
      return;
    }
    if (!isAllowedUrl(logoUrl)) {
      res.status(400).json({ error: "logoUrl must point to the configured CDN origin" });
      return;
    }
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({ where: { id: req.params.id } });
    if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
    await prisma.brand.update({ where: { id: req.params.id }, data: { logoUrl } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update brand logo" });
  }
});

export default router;
