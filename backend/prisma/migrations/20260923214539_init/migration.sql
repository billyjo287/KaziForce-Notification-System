-- CreateEnum
CREATE TYPE "Role" AS ENUM ('worker', 'business', 'admin');

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('worker', 'business', 'admin', 'system');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'sw');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('job_alert', 'status_update', 'message', 'announcement');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('urgent', 'medium', 'low');

-- CreateEnum
CREATE TYPE "PredictionSource" AS ENUM ('ml', 'rules', 'rules_fallback');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'processing', 'blocked', 'held', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('in_app', 'whatsapp', 'sms', 'email');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "Preset" AS ENUM ('recommended', 'urgent_only', 'everything', 'custom');

-- CreateEnum
CREATE TYPE "TextSize" AS ENUM ('normal', 'large');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('open', 'closed', 'removed');

-- CreateEnum
CREATE TYPE "JobUrgency" AS ENUM ('normal', 'urgent');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('received', 'reviewed', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "language" "Language" NOT NULL DEFAULT 'en',
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "consentSmsWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "usesWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "companyName" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "preset" "Preset" NOT NULL DEFAULT 'recommended',
    "channelOrder" "Channel"[] DEFAULT ARRAY['whatsapp', 'sms', 'email']::"Channel"[],
    "channelSettings" JSONB NOT NULL,
    "urgentOnBothChannels" BOOLEAN NOT NULL DEFAULT false,
    "quietHours" JSONB NOT NULL,
    "dailySummary" BOOLEAN NOT NULL DEFAULT true,
    "textSize" "TextSize" NOT NULL DEFAULT 'normal',
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "channelSuggestionShownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "recipientRole" "Role" NOT NULL,
    "senderId" UUID,
    "senderRole" "SenderRole" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "category" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "link" TEXT,
    "jobId" UUID,
    "deadlineAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "predictedPriority" "Priority",
    "priorityConfidence" DOUBLE PRECISION,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "spamScore" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "predictionSource" "PredictionSource",
    "explanation" JSONB,
    "correctedPriority" "Priority",
    "correctedSpam" BOOLEAN,
    "correctedById" UUID,
    "correctedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "markedNotImportant" BOOLEAN NOT NULL DEFAULT false,
    "markedNotImportantAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalatedTo" "Channel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "isEscalation" BOOLEAN NOT NULL DEFAULT false,
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MLMetadata" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "description" TEXT,
    "metrics" JSONB,
    "datasetInfo" JSONB,
    "artifactPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MLMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "employerId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "location" TEXT NOT NULL,
    "skillTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deadline" TIMESTAMP(3) NOT NULL,
    "urgency" "JobUrgency" NOT NULL DEFAULT 'normal',
    "status" "JobStatus" NOT NULL DEFAULT 'open',
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'received',
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "jobId" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_isSpam_createdAt_idx" ON "Notification"("isSpam", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_notificationId_idx" ON "DeliveryLog"("notificationId");

-- CreateIndex
CREATE INDEX "DeliveryLog_channel_status_createdAt_idx" ON "DeliveryLog"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_providerMessageId_idx" ON "DeliveryLog"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MLMetadata_version_key" ON "MLMetadata"("version");

-- CreateIndex
CREATE INDEX "Job_status_location_idx" ON "Job"("status", "location");

-- CreateIndex
CREATE INDEX "Job_employerId_idx" ON "Job"("employerId");

-- CreateIndex
CREATE INDEX "Application_workerId_idx" ON "Application"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_workerId_key" ON "Application"("jobId", "workerId");

-- CreateIndex
CREATE INDEX "Message_recipientId_createdAt_idx" ON "Message"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_recipientId_idx" ON "Message"("senderId", "recipientId");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
