import { Router } from 'express'
import { requireAuth } from '@threaddash/auth'
import { requireRole } from '../lib/role'
import { getPrisma } from '../lib/db'

const router = Router()

// GET /adjustments?warehouseId=X&skuId=Y(optional)
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { warehouseId, skuId } = req.query as { warehouseId: string; skuId?: string }
  if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' })

  const prisma = getPrisma()
  const adjustments = await prisma.stockAdjustment.findMany({
    where: { warehouseId, ...(skuId ? { skuId } : {}) },
    include: {
      sku: {
        select: {
          id: true, size: true, color: true, barcode: true,
          product: { select: { name: true, brand: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  res.json(adjustments)
})

// POST /adjustments
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { warehouseId, skuId, quantityDelta, reason, notes } = req.body

  if (!warehouseId || !skuId || quantityDelta === undefined || !reason) {
    return res.status(400).json({ error: 'warehouseId, skuId, quantityDelta, reason required' })
  }
  if (quantityDelta === 0) return res.status(400).json({ error: 'quantityDelta cannot be zero' })

  const prisma = getPrisma()

  try {
    await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: { skuId_warehouseId: { skuId, warehouseId } },
      })
      if (!inventory) throw Object.assign(new Error('Inventory record not found'), { status: 404 })

      const newQty = inventory.quantityAvailable + quantityDelta
      if (newQty < 0) throw Object.assign(new Error('Adjustment would result in negative available stock'), { status: 400 })

      await tx.inventory.update({
        where: { skuId_warehouseId: { skuId, warehouseId } },
        data: { quantityAvailable: newQty },
      })

      await tx.stockAdjustment.create({
        data: { warehouseId, skuId, quantityDelta, reason, notes, createdBy: req.user!.userId },
      })
    })

    res.status(201).json({ success: true })
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    throw e
  }
})

export default router
