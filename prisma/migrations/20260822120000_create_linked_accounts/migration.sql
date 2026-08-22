CREATE TABLE "linked_accounts" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "created_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connected_by" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "more_details" JSONB,
  "token_data" JSONB NOT NULL,

  CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "linked_accounts_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "linked_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "linked_accounts_platform_idx" ON "linked_accounts"("platform");
CREATE INDEX "linked_accounts_connected_by_idx" ON "linked_accounts"("connected_by");
CREATE INDEX "linked_accounts_owner_id_idx" ON "linked_accounts"("owner_id");
