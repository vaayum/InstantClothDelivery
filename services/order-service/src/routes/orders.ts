import { Router } from "express";
import axios from "axios";
import { requireAuth } from "@threaddash/auth";
import { getPrisma } from "../lib/db";
import { getRedis } from "../lib/redis";
import { publishEvent } from "../lib/rabbitmq";
import { PaymentMethod } from "@prisma/client";

const router = Router();

const ROUTING_URL = process.env.ROUTING_SERVICE_URL ?? "http://localhost:8000";
const WAREHOUSE_URL = process.env.WAREHOUSE_SERVICE_URL ?? "http://localhost:3002";

router.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { items, addressId, paymentMethod, isTryOrder = false } = req.body as {
    items: { skuId: string; quantity: number }[];
    addressId: string;
    paymentMethod: PaymentMethod;
    isTryOrder?: boolean;
  };

  if (!items?.length || !addressId || !paymentMethod) {
    return res.status(400).json({ error: "items, addressId, and paymentMethod required" });
  }

  const prisma = getPrisma();

  const skuIds = items.map((i) => i.skuId);
  const skus = await prisma.sku.findMany({ where: { id: { in: skuIds } }, include: { product: true } });
  if (skus.length !== skuIds.length) {
    return res.status(400).json({ error: "One or more SKUs not found" });
  }

  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) {
    return res.status(400).json({ error: "Address not found" });
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, lat: true, lng: true, activeOrderCount: true },
  });
  if (!warehouses.length) {
    return res.status(503).json({ error: "No warehouses available" });
  }

  let routingResult: { warehouse_id: string; eta_minutes: number };
  try {
    const { data } = await axios.post(`${ROUTING_URL}/select-warehouse`, {
      delivery_coords: { lat: address.lat, lng: address.lng },
      warehouses: warehouses.map((w) => ({
        warehouse_id: w.id,
        lat: w.lat,
        lng: w.lng,
        active_order_count: w.activeOrderCount,
        has_stock: true,
      })),
    });
    if (!data.warehouse_id) {
      return res.status(503).json({ error: "No warehouse available for delivery area" });
    }
    routingResult = data;
  } catch {
    return res.status(503).json({ error: "Routing service unavailable" });
  }

  const reserveItems = items.map((i) => ({
    skuId: i.skuId,
    warehouseId: routingResult.warehouse_id,
    quantity: i.quantity,
  }));

  try {
    await axios.post(`${WAREHOUSE_URL}/inventory/reserve`, { orderId: "pending", items: reserveItems });
  } catch (err: any) {
    const status = err.response?.status === 409 ? 409 : 503;
    const message = err.response?.data?.error ?? "Inventory reservation failed";
    return res.status(status).json({ error: message });
  }

  const totalAmount = items.reduce((sum, item) => {
    const sku = skus.find((s) => s.id === item.skuId)!;
    return sum + sku.product.price * item.quantity;
  }, 0);
  const deliveryFee = paymentMethod === "COD" ? 2000 : 0;

  let order;
  try {
    order = await prisma.order.create({
      data: {
        userId,
        addressId,
        warehouseId: routingResult.warehouse_id,
        paymentMethod,
        isTryOrder,
        totalAmount,
        deliveryFee,
        items: {
          create: items.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
            price: skus.find((s) => s.id === item.skuId)!.product.price,
          })),
        },
      },
      include: { items: true },
    });
  } catch (err) {
    await axios.post(`${WAREHOUSE_URL}/inventory/release`, { items: reserveItems }).catch(() => {});
    return res.status(500).json({ error: "Order creation failed" });
  }

  await prisma.warehouse.update({
    where: { id: routingResult.warehouse_id },
    data: { activeOrderCount: { increment: 1 } },
  });

  await publishEvent("order.placed", {
    orderId: order.id,
    warehouseId: routingResult.warehouse_id,
    userId,
    isTryOrder,
    timestamp: new Date().toISOString(),
  });

  const redis = getRedis();
  await redis.set(`sla:order:${order.id}`, new Date().toISOString(), "EX", 7200);

  return res.status(201).json({ ...order, estimatedMinutes: routingResult.eta_minutes });
});

export default router;
