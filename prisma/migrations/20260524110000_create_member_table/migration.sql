CREATE TABLE "member" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "target_type" "MemberTargetType" NOT NULL,
  "target_account_id" TEXT,
  "target_portfolio_id" TEXT,
  "status" TEXT NOT NULL,
  "is_permanent" BOOLEAN NOT NULL DEFAULT false,
  "has_full_access" BOOLEAN NOT NULL DEFAULT false,
  "details" JSONB,

  CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_member_id_idx" ON "member"("member_id");
CREATE INDEX "member_target_account_id_idx" ON "member"("target_account_id");
CREATE INDEX "member_target_portfolio_id_idx" ON "member"("target_portfolio_id");
CREATE INDEX "member_target_type_target_account_id_idx" ON "member"("target_type", "target_account_id");
CREATE INDEX "member_target_type_target_portfolio_id_idx" ON "member"("target_type", "target_portfolio_id");

ALTER TABLE "member"
ADD CONSTRAINT "member_member_id_fkey"
FOREIGN KEY ("member_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member"
ADD CONSTRAINT "member_target_account_id_fkey"
FOREIGN KEY ("target_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member"
ADD CONSTRAINT "member_target_portfolio_id_fkey"
FOREIGN KEY ("target_portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;