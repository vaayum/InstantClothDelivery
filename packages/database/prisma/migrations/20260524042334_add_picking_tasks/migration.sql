-- CreateEnum
CREATE TYPE "PickingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PACKED');

-- CreateEnum
CREATE TYPE "PickItemStatus" AS ENUM ('PENDING', 'FOUND', 'NOT_AVAILABLE');

-- CreateTable
CREATE TABLE "picking_tasks" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "PickingStatus" NOT NULL DEFAULT 'PENDING',
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "picking_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picking_items" (
    "id" TEXT NOT NULL,
    "pickingTaskId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "PickItemStatus" NOT NULL DEFAULT 'PENDING',
    "scannedAt" TIMESTAMP(3),

    CONSTRAINT "picking_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "picking_tasks_orderId_key" ON "picking_tasks"("orderId");

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_items" ADD CONSTRAINT "picking_items_pickingTaskId_fkey" FOREIGN KEY ("pickingTaskId") REFERENCES "picking_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_items" ADD CONSTRAINT "picking_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
