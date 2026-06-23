ALTER TABLE "authz_permission"
ADD COLUMN "acquisition_type" TEXT NOT NULL DEFAULT 'assignment',
ADD COLUMN "approval_policy" TEXT NOT NULL DEFAULT 'none';
