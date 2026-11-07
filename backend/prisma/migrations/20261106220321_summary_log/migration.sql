-- CreateTable
CREATE TABLE "SummaryLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "frequency" "SummaryFrequency" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "alertCount" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "providerMessageId" TEXT,
    "error" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SummaryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SummaryLog_createdAt_idx" ON "SummaryLog"("createdAt");

-- CreateIndex
CREATE INDEX "SummaryLog_userId_createdAt_idx" ON "SummaryLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SummaryLog" ADD CONSTRAINT "SummaryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
