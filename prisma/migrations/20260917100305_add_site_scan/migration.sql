-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "siteScanId" TEXT,
ADD COLUMN     "url" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SiteScan" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "averageScore" INTEGER,
    "pageCount" INTEGER NOT NULL,
    "completedPages" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteScan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SiteScan" ADD CONSTRAINT "SiteScan_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_siteScanId_fkey" FOREIGN KEY ("siteScanId") REFERENCES "SiteScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
