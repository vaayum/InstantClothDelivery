import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "@threaddash/auth";

const prisma = new PrismaClient();
const router = Router();

router.use(requireAuth);

router.get("/", async (req, res): Promise<void> => {
  const addresses = await prisma.address.findMany({
    where: { userId: (req as any).user.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(addresses);
});

router.post("/", async (req, res): Promise<void> => {
  const { label, formattedAddress, lat, lng, isSafeDrop, safeDropNote } = req.body as {
    label: string;
    formattedAddress: string;
    lat: number;
    lng: number;
    isSafeDrop?: boolean;
    safeDropNote?: string;
  };
  if (!label || !formattedAddress || lat == null || lng == null) {
    res.status(400).json({ error: "label, formattedAddress, lat, lng required" });
    return;
  }
  const address = await prisma.address.create({
    data: {
      userId: (req as any).user.userId,
      label,
      formattedAddress,
      lat,
      lng,
      isSafeDrop: isSafeDrop ?? false,
      safeDropNote,
    },
  });
  res.status(201).json(address);
});

export default router;
