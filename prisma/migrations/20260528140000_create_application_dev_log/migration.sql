CREATE TABLE "application_dev_log" (
  "id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "requester_ip" TEXT,
  "origin" TEXT,
  "referer" TEXT,
  "user_agent" TEXT,
  "request_body" JSONB,
  "query" JSONB,
  "request_meta" JSONB,
  "response_body" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_dev_log_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "application_dev_log"
  ADD CONSTRAINT "application_dev_log_app_id_fkey"
  FOREIGN KEY ("app_id") REFERENCES "application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "application_dev_log_app_id_created_at_idx"
  ON "application_dev_log"("app_id", "created_at");

CREATE INDEX "application_dev_log_created_at_idx"
  ON "application_dev_log"("created_at");
