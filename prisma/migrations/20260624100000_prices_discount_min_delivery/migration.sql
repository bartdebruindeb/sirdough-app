-- AlterTable: add price to BreadType
ALTER TABLE "BreadType" ADD COLUMN "price" DECIMAL(65,30);

-- AlterTable: add discountPercent to Customer
ALTER TABLE "Customer" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: add minDeliveryAmount to Tenant
ALTER TABLE "Tenant" ADD COLUMN "minDeliveryAmount" DECIMAL(65,30);
