-- Track which analyzer version produced each scan, so the UI only shows
-- before/after deltas when both scans used the same rules.
ALTER TABLE "Scan" ADD COLUMN "analyzerVersion" TEXT;
