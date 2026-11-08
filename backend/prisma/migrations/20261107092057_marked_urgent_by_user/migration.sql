-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "markedUrgentAt" TIMESTAMP(3),
ADD COLUMN     "markedUrgentByUser" BOOLEAN NOT NULL DEFAULT false;
