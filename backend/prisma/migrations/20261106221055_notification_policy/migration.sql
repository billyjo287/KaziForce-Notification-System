-- CreateTable
CREATE TABLE "NotificationPolicy" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'platform',
    "dailyTextLimit" INTEGER,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPolicy_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NotificationPolicy" ADD CONSTRAINT "NotificationPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
