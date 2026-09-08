ALTER TABLE "application" ADD COLUMN "usePermissionFrom" TEXT;
CREATE INDEX "application_usePermissionFrom_idx" ON "application"("usePermissionFrom");
ALTER TABLE "application" ADD CONSTRAINT "application_usePermissionFrom_fkey"
  FOREIGN KEY ("usePermissionFrom") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "application" ADD CONSTRAINT "application_permission_source_not_self"
  CHECK ("usePermissionFrom" IS DISTINCT FROM "id");

ALTER TABLE "application" ADD COLUMN "developer" TEXT;
CREATE INDEX "application_developer_idx" ON "application"("developer");
ALTER TABLE "application" ADD CONSTRAINT "application_developer_fkey"
  FOREIGN KEY ("developer") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
