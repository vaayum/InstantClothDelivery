-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pinnedEtaMinutes" INTEGER,
ADD COLUMN     "pinnedWarehouseId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_pinnedWarehouseId_fkey" FOREIGN KEY ("pinnedWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
