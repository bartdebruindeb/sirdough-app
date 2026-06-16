-- Remap existing BEZORGER users to BAKKER before removing the enum value
UPDATE "User" SET role = 'BAKKER' WHERE role = 'BEZORGER';

-- Recreate enum without BEZORGER
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('OWNER', 'ORDER_TABLET', 'BAKKER', 'CUSTOMER');
ALTER TABLE "User" ALTER COLUMN role DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN role TYPE "Role" USING role::text::"Role";
DROP TYPE "Role_old";
