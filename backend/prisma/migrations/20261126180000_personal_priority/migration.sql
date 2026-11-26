-- The person's own habits (Objective ii): the classifier's answer when it was changed, and why.
ALTER TABLE "Notification" ADD COLUMN "modelPriority" "Priority",
ADD COLUMN "personalReason" VARCHAR(30);
