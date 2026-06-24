-- AlterTable
ALTER TABLE "OneOffOrder" ADD COLUMN "deliveryAddressId" TEXT;

-- AddForeignKey
ALTER TABLE "OneOffOrder" ADD CONSTRAINT "OneOffOrder_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "CustomerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
