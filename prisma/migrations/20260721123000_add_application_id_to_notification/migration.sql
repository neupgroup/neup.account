ALTER TABLE "notification" ADD COLUMN "applicationId" TEXT;

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_applicationId_fkey"
  FOREIGN KEY ("applicationId")
  REFERENCES "application"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "notification_applicationId_createdAt_idx" ON "notification"("applicationId", "createdAt");
CREATE INDEX "notification_applicationId_accountId_createdAt_idx" ON "notification"("applicationId", "accountId", "createdAt");
