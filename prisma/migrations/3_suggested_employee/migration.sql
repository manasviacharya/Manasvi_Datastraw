-- Store which person a coverage-gap suggestion names.
--
-- The engine already worked this out in order to write the sentence; it was
-- simply discarded afterwards. Keeping it lets the suggestion be applied with
-- one click instead of being retyped into the assignments screen.
--
-- Nullable because most findings have no single action to offer: a staffing
-- shortfall needs a hire or a changed contract, not an assignment.
ALTER TABLE "Violation" ADD COLUMN IF NOT EXISTS "suggestedEmployeeId" TEXT;
