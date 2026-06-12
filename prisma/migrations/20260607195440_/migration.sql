-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "cityOrder" INTEGER NOT NULL DEFAULT 99;

-- CreateTable
CREATE TABLE "CityRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 99,

    CONSTRAINT "CityRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CityRoute_tenantId_idx" ON "CityRoute"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CityRoute_tenantId_city_key" ON "CityRoute"("tenantId", "city");
