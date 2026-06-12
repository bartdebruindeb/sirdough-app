-- AlterTable
ALTER TABLE "BreadType" ADD COLUMN     "doughTypeId" TEXT,
ADD COLUMN     "doughWeightPerLoaf" DOUBLE PRECISION NOT NULL DEFAULT 1010;

-- CreateTable
CREATE TABLE "DoughType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "waterPct" DOUBLE PRECISION NOT NULL DEFAULT 71.5,
    "desemPct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "zoutPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "inwasPct" DOUBLE PRECISION NOT NULL DEFAULT 6,

    CONSTRAINT "DoughType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoughFlour" (
    "id" TEXT NOT NULL,
    "doughTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DoughFlour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoughType_tenantId_idx" ON "DoughType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DoughType_tenantId_slug_key" ON "DoughType"("tenantId", "slug");

-- AddForeignKey
ALTER TABLE "DoughType" ADD CONSTRAINT "DoughType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoughFlour" ADD CONSTRAINT "DoughFlour_doughTypeId_fkey" FOREIGN KEY ("doughTypeId") REFERENCES "DoughType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreadType" ADD CONSTRAINT "BreadType_doughTypeId_fkey" FOREIGN KEY ("doughTypeId") REFERENCES "DoughType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
