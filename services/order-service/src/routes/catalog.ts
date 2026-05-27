import { Router } from "express";
import axios from "axios";
import { getPrisma } from "../lib/db";

const router = Router();
const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

type AvailMap = Record<string, { quantityAvailable: number; available: boolean }>;

async function fetchAvailability(warehouseId: string, skuIds: string[]): Promise<AvailMap> {
  if (!skuIds.length) return {};
  try {
    const { data } = await axios.get<AvailMap>(`${WAREHOUSE_URL}/inventory/availability`, {
      params: { warehouseId, skuIds: skuIds.join(",") },
    });
    return data;
  } catch {
    return {};
  }
}

function enrichSkus(
  skus: { id: string; [key: string]: any }[],
  primaryMap: AvailMap,
  altWarehouseId?: string,
  altMap?: AvailMap
) {
  return skus.map((s) => {
    const primary = primaryMap[s.id];
    const available = primary?.available ?? true;
    const quantityAvailable = primary?.quantityAvailable ?? 0;
    const alternativeWarehouseId =
      !available && altWarehouseId && altMap?.[s.id]?.available ? altWarehouseId : undefined;
    return {
      ...s,
      available,
      quantityAvailable,
      ...(alternativeWarehouseId ? { alternativeWarehouseId } : {}),
    };
  });
}

router.get("/", async (req, res): Promise<void> => {
  const { warehouseId } = req.query as { warehouseId?: string };
  const prisma = getPrisma();

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { skus: true },
    orderBy: { createdAt: "desc" },
  });

  if (!warehouseId) {
    res.json(products);
    return;
  }

  const allSkuIds = products.flatMap((p) => p.skus.map((s) => s.id));
  const primaryMap = await fetchAvailability(warehouseId, allSkuIds);

  const oosSkuIds = allSkuIds.filter((id) => !primaryMap[id]?.available);
  let altWarehouseId: string | undefined;
  let altMap: AvailMap = {};

  if (oosSkuIds.length > 0) {
    const otherWarehouses = await (prisma.warehouse as any).findMany({
      where: { status: "ACTIVE", id: { not: warehouseId } },
      select: { id: true },
    });
    for (const wh of otherWarehouses) {
      const candidate = await fetchAvailability(wh.id, oosSkuIds);
      if (oosSkuIds.some((id) => candidate[id]?.available)) {
        altWarehouseId = wh.id;
        altMap = candidate;
        break;
      }
    }
  }

  res.json(products.map((p) => ({
    ...p,
    skus: enrichSkus(p.skus, primaryMap, altWarehouseId, altMap),
  })));
});

router.get("/:id", async (req, res): Promise<void> => {
  const { warehouseId } = req.query as { warehouseId?: string };
  const prisma = getPrisma();

  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { skus: true },
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (!warehouseId) {
    res.json(product);
    return;
  }

  const skuIds = product.skus.map((s) => s.id);
  const primaryMap = await fetchAvailability(warehouseId, skuIds);

  const oosSkuIds = skuIds.filter((id) => !primaryMap[id]?.available);
  let altWarehouseId: string | undefined;
  let altMap: AvailMap = {};

  if (oosSkuIds.length > 0) {
    const otherWarehouses = await (prisma.warehouse as any).findMany({
      where: { status: "ACTIVE", id: { not: warehouseId } },
      select: { id: true },
    });
    for (const wh of otherWarehouses) {
      const candidate = await fetchAvailability(wh.id, oosSkuIds);
      if (oosSkuIds.some((id) => candidate[id]?.available)) {
        altWarehouseId = wh.id;
        altMap = candidate;
        break;
      }
    }
  }

  res.json({
    ...product,
    skus: enrichSkus(product.skus, primaryMap, altWarehouseId, altMap),
  });
});

export default router;
