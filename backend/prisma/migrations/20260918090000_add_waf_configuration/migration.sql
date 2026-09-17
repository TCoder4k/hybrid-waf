-- CreateTable
CREATE TABLE "waf_configurations" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "upstreamUrl" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "lastLatencyMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waf_configurations_pkey" PRIMARY KEY ("id")
);