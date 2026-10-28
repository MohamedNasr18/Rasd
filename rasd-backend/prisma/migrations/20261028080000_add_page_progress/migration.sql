-- CreateTable
CREATE TABLE "PageProgress" (
    "id" TEXT NOT NULL,
    "siteScanId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'page',
    "position" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "score" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageProgress_siteScanId_idx" ON "PageProgress"("siteScanId");

-- CreateIndex
CREATE UNIQUE INDEX "PageProgress_siteScanId_kind_url_key" ON "PageProgress"("siteScanId", "kind", "url");

-- AddForeignKey
ALTER TABLE "PageProgress" ADD CONSTRAINT "PageProgress_siteScanId_fkey" FOREIGN KEY ("siteScanId") REFERENCES "SiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
