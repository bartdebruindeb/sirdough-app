CREATE TABLE "Invoice" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "customerId"      TEXT NOT NULL,
  "invoiceNumber"   TEXT,
  "exactGuid"       TEXT,
  "periodStart"     TIMESTAMP(3) NOT NULL,
  "periodEnd"       TIMESTAMP(3) NOT NULL,
  "totalAmountExcl" DECIMAL(65,30) NOT NULL,
  "vatPercent"      INTEGER NOT NULL DEFAULT 9,
  "sentAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceOrder" (
  "id"        TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  CONSTRAINT "InvoiceOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExactToken" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "division"     INTEGER,
  CONSTRAINT "ExactToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExactToken_tenantId_key" ON "ExactToken"("tenantId");
CREATE INDEX "Invoice_tenantId_periodStart_idx" ON "Invoice"("tenantId", "periodStart");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceOrder" ADD CONSTRAINT "InvoiceOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExactToken" ADD CONSTRAINT "ExactToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
