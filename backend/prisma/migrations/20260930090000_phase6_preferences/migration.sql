-- Phase 6: quiet hours hold non-urgent external sends until the quiet period ends.
ALTER TABLE "Notification" ADD COLUMN "heldUntil" TIMESTAMP(3);

-- The retention job removes delivery logs older than 180 days (DR-4).
CREATE INDEX "DeliveryLog_createdAt_idx" ON "DeliveryLog"("createdAt");
