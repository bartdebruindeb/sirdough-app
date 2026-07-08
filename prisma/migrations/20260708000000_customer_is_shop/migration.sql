ALTER TABLE "Customer" ADD COLUMN "isShop" BOOLEAN NOT NULL DEFAULT false;

-- Carry over this deployment's existing config-based shops so they keep working
-- after cutover to the dynamic (UI-managed) shop list.
UPDATE "Customer" SET "isShop" = true WHERE name IN ('Winkel Delft', 'Winkel Den Haag');
