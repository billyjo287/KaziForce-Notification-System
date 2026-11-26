-- A/B test (ml-v2 plan step 8): the person's group, when they joined, and their settings then.
ALTER TABLE "User" ADD COLUMN "abGroup" VARCHAR(1),
ADD COLUMN "abAssignedAt" TIMESTAMP(3),
ADD COLUMN "abBaseline" JSONB;
