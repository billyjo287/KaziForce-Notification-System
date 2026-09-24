-- AlterTable
ALTER TABLE "DomainEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" VARCHAR(500);
