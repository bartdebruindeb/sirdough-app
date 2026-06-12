-- Map old Role values to new ones, then swap the enum type safely

-- 1. Create the new enum
CREATE TYPE "Role_new" AS ENUM ('OWNER', 'ORDER_TABLET', 'BAKKER', 'BEZORGER', 'CUSTOMER');

-- 2. Add a temporary column using the new enum
ALTER TABLE "User" ADD COLUMN "role_new" "Role_new";

-- 3. Migrate existing values: old WORKER -> BAKKER, old ADMIN -> OWNER, others map 1:1
UPDATE "User" SET "role_new" = CASE "role"::text
  WHEN 'WORKER' THEN 'BAKKER'
  WHEN 'ADMIN'  THEN 'OWNER'
  ELSE "role"::text
END::"Role_new";

-- 4. Drop the old column + enum, rename the new ones into place
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'BAKKER';

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";