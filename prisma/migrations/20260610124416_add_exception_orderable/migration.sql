-- AlterTable
ALTER TABLE "BreadType" ADD COLUMN     "customerOrderable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecurringOrderException" (
    "id" TEXT NOT NULL,
    "recurringOrderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "RecurringOrderException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringOrderException_recurringOrderId_idx" ON "RecurringOrderException"("recurringOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOrderException_recurringOrderId_date_key" ON "RecurringOrderException"("recurringOrderId", "date");

-- AddForeignKey
ALTER TABLE "RecurringOrderException" ADD CONSTRAINT "RecurringOrderException_recurringOrderId_fkey" FOREIGN KEY ("recurringOrderId") REFERENCES "RecurringOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
