-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OWNER', 'WORKER', 'CUSTOMER');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'WORKER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreadType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'boeren',
    "weightGrams" INTEGER NOT NULL DEFAULT 750,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BreadType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "breadTypeId" TEXT NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "waterPct" DOUBLE PRECISION NOT NULL DEFAULT 71.5,
    "desemPct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "zoutPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "inwasPct" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "doughWeightPerLoaf" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "mixerGroup" TEXT NOT NULL DEFAULT 'boeren',

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeFlour" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeFlour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeTopping" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gramsPerLoaf" DOUBLE PRECISION NOT NULL,
    "requiresKoking" BOOLEAN NOT NULL DEFAULT false,
    "waterRatio" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeTopping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinkelTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "breadTypeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WinkelTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "RecurringOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringOrderLine" (
    "id" TEXT NOT NULL,
    "recurringOrderId" TEXT NOT NULL,
    "breadTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecurringOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOffOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneOffOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOffOrderLine" (
    "id" TEXT NOT NULL,
    "oneOffId" TEXT NOT NULL,
    "breadTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OneOffOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "mixerCount" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDayLine" (
    "id" TEXT NOT NULL,
    "productionDayId" TEXT NOT NULL,
    "breadTypeId" TEXT NOT NULL,
    "winkelQty" INTEGER NOT NULL DEFAULT 0,
    "horecaQty" INTEGER NOT NULL DEFAULT 0,
    "totalQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionDayLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "BreadType_tenantId_idx" ON "BreadType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BreadType_tenantId_slug_key" ON "BreadType"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_breadTypeId_key" ON "Recipe"("breadTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "WinkelTemplate_tenantId_breadTypeId_weekday_key" ON "WinkelTemplate"("tenantId", "breadTypeId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOrder_tenantId_customerId_weekday_key" ON "RecurringOrder"("tenantId", "customerId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOrderLine_recurringOrderId_breadTypeId_key" ON "RecurringOrderLine"("recurringOrderId", "breadTypeId");

-- CreateIndex
CREATE INDEX "OneOffOrder_tenantId_deliveryDate_idx" ON "OneOffOrder"("tenantId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "OneOffOrderLine_oneOffId_breadTypeId_key" ON "OneOffOrderLine"("oneOffId", "breadTypeId");

-- CreateIndex
CREATE INDEX "ProductionDay_tenantId_deliveryDate_idx" ON "ProductionDay"("tenantId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionDay_tenantId_productionDate_key" ON "ProductionDay"("tenantId", "productionDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionDayLine_productionDayId_breadTypeId_key" ON "ProductionDayLine"("productionDayId", "breadTypeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreadType" ADD CONSTRAINT "BreadType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_breadTypeId_fkey" FOREIGN KEY ("breadTypeId") REFERENCES "BreadType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeFlour" ADD CONSTRAINT "RecipeFlour_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeTopping" ADD CONSTRAINT "RecipeTopping_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinkelTemplate" ADD CONSTRAINT "WinkelTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinkelTemplate" ADD CONSTRAINT "WinkelTemplate_breadTypeId_fkey" FOREIGN KEY ("breadTypeId") REFERENCES "BreadType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrder" ADD CONSTRAINT "RecurringOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrder" ADD CONSTRAINT "RecurringOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderLine" ADD CONSTRAINT "RecurringOrderLine_recurringOrderId_fkey" FOREIGN KEY ("recurringOrderId") REFERENCES "RecurringOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOrderLine" ADD CONSTRAINT "RecurringOrderLine_breadTypeId_fkey" FOREIGN KEY ("breadTypeId") REFERENCES "BreadType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOffOrder" ADD CONSTRAINT "OneOffOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOffOrder" ADD CONSTRAINT "OneOffOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOffOrderLine" ADD CONSTRAINT "OneOffOrderLine_oneOffId_fkey" FOREIGN KEY ("oneOffId") REFERENCES "OneOffOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOffOrderLine" ADD CONSTRAINT "OneOffOrderLine_breadTypeId_fkey" FOREIGN KEY ("breadTypeId") REFERENCES "BreadType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDay" ADD CONSTRAINT "ProductionDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDayLine" ADD CONSTRAINT "ProductionDayLine_productionDayId_fkey" FOREIGN KEY ("productionDayId") REFERENCES "ProductionDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDayLine" ADD CONSTRAINT "ProductionDayLine_breadTypeId_fkey" FOREIGN KEY ("breadTypeId") REFERENCES "BreadType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
