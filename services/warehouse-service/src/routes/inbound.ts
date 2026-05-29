import { Router } from 'express'
import { requireAuth } from '@threaddash/auth'
import { requireRole } from '../lib/role'
import { getPrisma } from '../lib/db'

const router = Router()

// GET /inbound?warehouseId=X
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { warehouseId } = req.query as { warehouseId: string }
  if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' })

  const prisma = getPrisma()
  const shipments = await prisma.inboundShipment.findMany({
    where: { warehouseId },
    include: {
      items: {
        include: {
          sku: { select: { id: true, size: true, color: true, barcode: true, product: { select: { name: true, brand: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(shipments)
})

// POST /inbound — create shipment with line items
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { warehouseId, supplier, referenceNo, expectedAt, notes, items } = req.body
  // items: Array<{ skuId: string; expectedQty: number }>

  if (!warehouseId || !supplier || !referenceNo || !items?.length) {
    return res.status(400).json({ error: 'warehouseId, supplier, referenceNo, items required' })
  }

  const prisma = getPrisma()

  try {
    const shipment = await prisma.inboundShipment.create({
      data: {
        warehouseId,
        supplier,
        referenceNo,
        expectedAt: expectedAt ? new Date(expectedAt) : null,
        notes,
        createdBy: req.user!.userId,
        items: {
          create: (items as { skuId: string; expectedQty: number }[]).map((i) => ({
            skuId: i.skuId,
            expectedQty: i.expectedQty,
          })),
        },
      },
      include: { items: true },
    })
    res.status(201).json(shipment)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Reference number already exists' })
    throw e
  }
})

// POST /inbound/:id/receive-items — update received qty, upsert inventory
router.post('/:id/receive-items', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { items } = req.body
  // items: Array<{ itemId: string; receivedQty: number; binLocationId?: string }>

  const prisma = getPrisma()
  const shipment = await prisma.inboundShipment.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  })
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' })
  if (shipment.status === 'COMPLETED') return res.status(400).json({ error: 'Shipment already completed' })

  await prisma.$transaction(async (tx) => {
    for (const incoming of items as { itemId: string; receivedQty: number; binLocationId?: string }[]) {
      const shipmentItem = shipment.items.find((i) => i.id === incoming.itemId)
      if (!shipmentItem) continue

      await tx.inboundShipmentItem.update({
        where: { id: incoming.itemId },
        data: { receivedQty: incoming.receivedQty, binLocationId: incoming.binLocationId ?? null },
      })

      await tx.inventory.upsert({
        where: { skuId_warehouseId: { skuId: shipmentItem.skuId, warehouseId: shipment.warehouseId } },
        update: {
          quantityAvailable: { increment: incoming.receivedQty },
          ...(incoming.binLocationId ? { binLocationId: incoming.binLocationId } : {}),
        },
        create: {
          skuId: shipmentItem.skuId,
          warehouseId: shipment.warehouseId,
          quantityAvailable: incoming.receivedQty,
          quantityReserved: 0,
          reorderThreshold: 3,
          binLocationId: incoming.binLocationId ?? null,
        },
      })
    }

    if (shipment.status === 'EXPECTED') {
      await tx.inboundShipment.update({
        where: { id: req.params.id },
        data: { status: 'RECEIVING' },
      })
    }
  })

  res.json({ success: true })
})

// POST /inbound/:id/complete — finalize; auto-detect DISCREPANCY
router.post('/:id/complete', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const prisma = getPrisma()
  const shipment = await prisma.inboundShipment.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  })
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' })

  const hasDiscrepancy = shipment.items.some((i) => i.receivedQty !== i.expectedQty)
  const finalStatus = hasDiscrepancy ? 'DISCREPANCY' : 'COMPLETED'

  await prisma.inboundShipment.update({
    where: { id: req.params.id },
    data: { status: finalStatus, receivedAt: new Date() },
  })

  res.json({ success: true, status: finalStatus })
})

export default router
