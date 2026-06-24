CREATE TABLE "BillingEntity" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "companyAddress"   TEXT,
  "companyPostal"    TEXT,
  "companyCity"      TEXT,
  "kvk"              TEXT,
  "btwNumber"        TEXT,
  "iban"             TEXT,
  "bic"              TEXT,
  "companyPhone"     TEXT,
  "companyEmail"     TEXT,
  "companyWebsite"   TEXT,
  "paymentTermDays"  INTEGER NOT NULL DEFAULT 30,
  "paymentCondition" TEXT NOT NULL DEFAULT '30 dagen',
  "isDefault"        BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "BillingEntity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingEntity_tenantId_idx" ON "BillingEntity"("tenantId");

ALTER TABLE "BillingEntity" ADD CONSTRAINT "BillingEntity_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD COLUMN "billingEntityId" TEXT;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingEntityId_fkey"
  FOREIGN KEY ("billingEntityId") REFERENCES "BillingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
