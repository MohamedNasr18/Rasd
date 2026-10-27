-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "previousScanId" TEXT,
ADD COLUMN     "triggeredBy" TEXT NOT NULL DEFAULT 'scan';
