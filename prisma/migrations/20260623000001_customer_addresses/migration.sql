CREATE TABLE "CustomerAddress" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label"      TEXT NOT NULL DEFAULT 'Hoofdlocatie',
  "street"     TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "city"       TEXT NOT NULL,
  "isDefault"  BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
