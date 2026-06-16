-- Add closedWeekdays to Tenant (comma-separated weekday numbers, 1=Mon 7=Sun)
ALTER TABLE "Tenant" ADD COLUMN "closedWeekdays" TEXT NOT NULL DEFAULT '1,7';
