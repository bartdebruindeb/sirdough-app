/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,shopName,breadTypeId,weekday]` on the table `WinkelTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "WinkelTemplate_tenantId_breadTypeId_weekday_key";

-- AlterTable
ALTER TABLE "WinkelTemplate" ADD COLUMN     "shopName" TEXT NOT NULL DEFAULT 'Winkel Delft';

-- CreateIndex
CREATE UNIQUE INDEX "WinkelTemplate_tenantId_shopName_breadTypeId_weekday_key" ON "WinkelTemplate"("tenantId", "shopName", "breadTypeId", "weekday");
