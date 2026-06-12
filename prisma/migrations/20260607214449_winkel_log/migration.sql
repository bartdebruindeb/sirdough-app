-- CreateTable
CREATE TABLE "WinkelLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantities" JSONB NOT NULL,
    "weatherTemp" DOUBLE PRECISION,
    "weatherCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinkelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinkelOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "breadTypeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "WinkelOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinkelLog_tenantId_shopName_date_idx" ON "WinkelLog"("tenantId", "shopName", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WinkelLog_tenantId_shopName_date_key" ON "WinkelLog"("tenantId", "shopName", "date");

-- CreateIndex
CREATE INDEX "WinkelOverride_tenantId_shopName_date_idx" ON "WinkelOverride"("tenantId", "shopName", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WinkelOverride_tenantId_shopName_breadTypeId_date_key" ON "WinkelOverride"("tenantId", "shopName", "breadTypeId", "date");
