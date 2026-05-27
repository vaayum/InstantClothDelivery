import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";

const prisma = new PrismaClient();
const router = Router();
const ROUTING_URL = process.env.ROUTING_SERVICE_URL ?? "http://localhost:8000";

router.use(requireAuth);

router.get("/", async (req, res): Promise<void> => {
  const addresses = await prisma.address.findMany({
    where: { userId: (req as any).user.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(addresses);
});

async function pinWarehouse(
  userId: string,
  lat: number,
  lng: number
): Promise<{ pinnedWarehouseId: string | null; etaMinutes: number | null }> {
  const warehouses = await prisma.warehouse.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, lat: true, lng: true, activeOrderCount: true },
  });
  if (!warehouses.length) return { pinnedWarehouseId: null, etaMinutes: null };

  try {
    const { data } = await axios.post(`${ROUTING_URL}/select-warehouse`, {
      delivery_coords: { lat, lng },
      warehouses: warehouses.map((w) => ({
        warehouse_id: w.id,
        lat: w.lat,
        lng: w.lng,
        active_order_count: w.activeOrderCount,
        has_stock: true,
      })),
    });
    if (!data.warehouse_id) return { pinnedWarehouseId: null, etaMinutes: null };

    await prisma.user.update({
      where: { id: userId },
      data: { pinnedWarehouseId: data.warehouse_id, pinnedEtaMinutes: data.eta_minutes },
    });
    return { pinnedWarehouseId: data.warehouse_id as string, etaMinutes: data.eta_minutes as number };
  } catch {
    return { pinnedWarehouseId: null, etaMinutes: null };
  }
}

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

  const userId = (req as any).user.userId;
  const address = await prisma.address.create({
    data: { userId, label, formattedAddress, lat, lng, isSafeDrop: isSafeDrop ?? false, safeDropNote },
  });

  const { pinnedWarehouseId, etaMinutes } = await pinWarehouse(userId, lat, lng);
  res.status(201).json({
    ...address,
    pinnedWarehouseId,
    etaMinutes,
    deliveryAvailable: pinnedWarehouseId !== null,
  });
});

router.post("/:id/set-primary", async (req, res): Promise<void> => {
  const userId = (req as any).user.userId;
  const address = await prisma.address.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!address) {
    res.status(404).json({ error: "Address not found" });
    return;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinnedWarehouseId: true },
  });
  const previousWarehouseId = currentUser?.pinnedWarehouseId ?? null;

  const { pinnedWarehouseId, etaMinutes } = await pinWarehouse(userId, address.lat, address.lng);
  res.json({
    ...address,
    pinnedWarehouseId,
    etaMinutes,
    deliveryAvailable: pinnedWarehouseId !== null,
    warehouseChanged: pinnedWarehouseId !== previousWarehouseId,
  });
});

export default router;
