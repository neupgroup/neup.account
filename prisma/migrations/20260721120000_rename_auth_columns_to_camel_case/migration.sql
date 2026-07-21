ALTER TABLE "account" RENAME COLUMN "linked_account_id" TO "linkedAccountId";

ALTER TABLE "resources" RENAME COLUMN "account_id" TO "accountId";
ALTER TABLE "resources" RENAME COLUMN "uploaded_by" TO "uploadedBy";
ALTER TABLE "resources" RENAME COLUMN "uploaded_on" TO "uploadedOn";

ALTER TABLE "activity" RENAME COLUMN "target_account_id" TO "targetAccountId";
ALTER TABLE "activity" RENAME COLUMN "actor_account_id" TO "actorAccountId";

ALTER TABLE "notification" RENAME COLUMN "account_id" TO "accountId";
ALTER TABLE "notification" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "notification" RENAME COLUMN "deletable_on" TO "deletableOn";
