ALTER TABLE "application_connection" RENAME TO "connection";

ALTER TABLE "connection" RENAME CONSTRAINT "user_app_connections_pkey" TO "connection_pkey";
ALTER TABLE "connection" ADD CONSTRAINT "connection_accountId_appId_key" UNIQUE USING INDEX "user_app_connections_accountId_appId_key";
ALTER TABLE "connection" RENAME CONSTRAINT "user_app_connections_accountId_fkey" TO "connection_accountId_fkey";
ALTER TABLE "connection" RENAME CONSTRAINT "user_app_connections_appId_fkey" TO "connection_appId_fkey";