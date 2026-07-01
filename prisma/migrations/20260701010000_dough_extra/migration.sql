CREATE TABLE "DoughExtra" (
  "id"          TEXT NOT NULL,
  "doughTypeId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "percentage"  DOUBLE PRECISION NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DoughExtra_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DoughExtra" ADD CONSTRAINT "DoughExtra_doughTypeId_fkey"
  FOREIGN KEY ("doughTypeId") REFERENCES "DoughType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
