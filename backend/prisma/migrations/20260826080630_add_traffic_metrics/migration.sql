-- CreateTable
CREATE TABLE "traffic_metrics" (
    "id" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "allowedRequests" INTEGER NOT NULL DEFAULT 0,
    "blockedRequests" INTEGER NOT NULL DEFAULT 0,
    "sqlInjectionBlocks" INTEGER NOT NULL DEFAULT 0,
    "xssBlocks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "traffic_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traffic_metrics_bucketStart_key" ON "traffic_metrics"("bucketStart");
