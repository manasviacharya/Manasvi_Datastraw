-- Replace the single minStaffPerDay with a per-weekday array.
--
-- Written by hand rather than generated, because `prisma migrate diff` would
-- drop the old column and create the new one empty, losing every configured
-- minimum. The UPDATE in the middle carries the existing value across: a
-- client that wanted 2 people a day keeps wanting 2 people on all seven days,
-- which is exactly what it meant before.

-- 1. Add the array, temporarily defaulted so existing rows are valid.
ALTER TABLE "BrandProcess"
  ADD COLUMN "minStaffByWeekday" INTEGER[] NOT NULL DEFAULT ARRAY[1,1,1,1,1,1,1]::INTEGER[];

-- 2. Carry the old scalar across to all seven weekdays.
UPDATE "BrandProcess"
SET "minStaffByWeekday" = ARRAY[
  "minStaffPerDay", "minStaffPerDay", "minStaffPerDay", "minStaffPerDay",
  "minStaffPerDay", "minStaffPerDay", "minStaffPerDay"
]::INTEGER[];

-- 3. Drop the old column and the scaffolding default. New rows must now state
--    all seven values explicitly, so nothing silently inherits a 1.
ALTER TABLE "BrandProcess" DROP COLUMN "minStaffPerDay";
ALTER TABLE "BrandProcess" ALTER COLUMN "minStaffByWeekday" DROP DEFAULT;
