CREATE TYPE "MemberTargetType" AS ENUM ('portfolio', 'account');

CREATE TABLE "member_access" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" "AuthzGrantStatus" NOT NULL DEFAULT 'active',
  "target_type" "MemberTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,

  CONSTRAINT "member_access_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_access_member_id_idx" ON "member_access"("member_id");
CREATE INDEX "member_access_target_type_target_id_idx" ON "member_access"("target_type", "target_id");

ALTER TABLE "member_access"
ADD CONSTRAINT "member_access_member_id_fkey"
FOREIGN KEY ("member_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
