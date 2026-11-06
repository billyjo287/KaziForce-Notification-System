-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- Alerts that already exist were handled before this column existed: mark them dispatched, so
-- the dispatch sweeper (BT-06) never plans their outside channels a second time.
UPDATE "Notification" SET "dispatchedAt" = "updatedAt" WHERE "status" <> 'queued' AND "status" <> 'processing';
