import { Router } from 'express'
import { requireAuth } from '@threaddash/auth'
import { requireRole } from '../lib/role'
import { getPrisma } from '../lib/db'

const router = Router()

// GET /bin-locations?warehouseId=X
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { warehouseId } = req.query as { warehouseId: string }
  if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' })

  const prisma = getPrisma()
  const bins = await prisma.binLocation.findMany({
    where: { warehouseId },
    include: {
      inventory: {
        include: {
          sku: {
            select: {
              id: true,
              size: true,
              color: true,
              barcode: true,
              product: { select: { name: true, brand: true } },
            },
          },
        },
      },
    },
    orderBy: [{ zone: 'asc' }, { aisle: 'asc' }, { rack: 'asc' }, { shelf: 'asc' }],
  })

  res.json(bins)
})

// POST /bin-locations
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { warehouseId, zone, aisle, rack, shelf, capacity } = req.body

  if (!warehouseId || !zone || !aisle || !rack || !shelf) {
    return res.status(400).json({ error: 'warehouseId, zone, aisle, rack, shelf are required' })
  }

  const locationCode = `${zone}-${aisle}-${rack}-${shelf}`
  const prisma = getPrisma()

  try {
    const bin = await prisma.binLocation.create({
      data: { warehouseId, zone, aisle, rack, shelf, locationCode, capacity: capacity ?? 100 },
    })
    res.status(201).json(bin)
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Bin location code already exists' })
    throw e
  }
})

// PUT /bin-locations/:id
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { capacity, isActive } = req.body

  if (capacity === undefined && isActive === undefined) {
    return res.status(400).json({ error: 'capacity or isActive required' })
  }

  const prisma = getPrisma()

  try {
    const bin = await prisma.binLocation.update({
      where: { id: req.params.id },
      data: { ...(capacity !== undefined ? { capacity } : {}), ...(isActive !== undefined ? { isActive } : {}) },
    })
    res.json(bin)
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Bin location not found' })
    throw e
  }
})

// PATCH /bin-locations/:id/assign-sku — link an inventory record to this bin
router.patch('/:id/assign-sku', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { skuId, warehouseId } = req.body

  if (!skuId || !warehouseId) {
    return res.status(400).json({ error: 'skuId and warehouseId required' })
  }

  const prisma = getPrisma()

  try {
    const inventory = await prisma.inventory.update({
      where: { skuId_warehouseId: { skuId, warehouseId } },
      data: { binLocationId: req.params.id },
    })
    res.json(inventory)
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Inventory record not found' })
    throw e
  }
})

export default router
