-- CreateTable: ProductionBatch
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "mixerGroup" TEXT NOT NULL,
    "groupLabel" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "totalLoaves" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "startedAt" TIMESTAMP(3),
    "rijzenAt" TIMESTAMP(3),
    "klaarAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DeliveryStatus
CREATE TABLE "DeliveryStatus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "inBusAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_tenantId_productionDate_mixerGroup_batchNumber_key" ON "ProductionBatch"("tenantId", "productionDate", "mixerGroup", "batchNumber");
CREATE INDEX "ProductionBatch_tenantId_productionDate_idx" ON "ProductionBatch"("tenantId", "productionDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryStatus_tenantId_date_customerId_key" ON "DeliveryStatus"("tenantId", "date", "customerId");
CREATE INDEX "DeliveryStatus_tenantId_date_idx" ON "DeliveryStatus"("tenantId", "date");

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStatus" ADD CONSTRAINT "DeliveryStatus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStatus" ADD CONSTRAINT "DeliveryStatus_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
