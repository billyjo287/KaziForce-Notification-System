-- AlterTable
ALTER TABLE "User" ADD COLUMN     "smsOptedOutAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptedOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TrackedLink" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedLink_token_key" ON "TrackedLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedLink_notificationId_channel_key" ON "TrackedLink"("notificationId", "channel");

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

