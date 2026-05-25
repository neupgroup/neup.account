-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'individual',
    "displayImage" TEXT,
    "status" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_meta__individual" (
    "accountId" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "countryOfResidence" TEXT,
    "details" JSONB,
    "roleId" TEXT,

    CONSTRAINT "account_meta__individual_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "account_meta__brand" (
    "accountId" TEXT NOT NULL,
    "brandName" TEXT,
    "isLegalEntity" BOOLEAN NOT NULL DEFAULT false,
    "originCountry" TEXT,
    "details" JSONB,

    CONSTRAINT "account_meta__brand_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "authn_request" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "data" JSONB NOT NULL DEFAULT '{}',
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "actor_account_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geolocation" TEXT,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "action" TEXT,
    "title" TEXT,
    "message" TEXT,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletable_on" TIMESTAMP(3),
    "persistence" TEXT,
    "detail" JSONB,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "action" TEXT NOT NULL,
    "type" TEXT,
    "data" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_member" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',

    CONSTRAINT "family_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "category" TEXT,
    "done_by" TEXT,
    "done_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previously" TEXT,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neupid" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "neupId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neup_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authn_method" (
    "accountId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "authn_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authn_session" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "validTill" TIMESTAMP(3),
    "lastLoggedIn" TIMESTAMP(3) NOT NULL,
    "loginType" TEXT NOT NULL,
    "geolocation" TEXT,
    "deviceType" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_error" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,
    "geolocation" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "website" TEXT,
    "developer" TEXT,
    "appSecret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoints" JSONB,
    "status" TEXT NOT NULL DEFAULT 'development',
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_asset" (
    "id" TEXT NOT NULL,
    "parentPortfolioId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "portfolio_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_member" (
    "id" TEXT NOT NULL,
    "parentPortfolioId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "portfolio_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_connection" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_app_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_bridge" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_bridge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_policies" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "policy_type" TEXT NOT NULL,
    "policy_value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authz_capability" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "app_id" TEXT,
    "scope" TEXT,

    CONSTRAINT "authz_capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authz_role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "app_id" TEXT,
    "scope" TEXT,

    CONSTRAINT "authz_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authz_role_capability_map" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,

    CONSTRAINT "authz_role_capability_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authz_account_access_grant" (
    "id" TEXT NOT NULL,
    "owner_account_id" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "portfolio_id" TEXT,

    CONSTRAINT "authz_account_access_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets_access_grant" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,

    CONSTRAINT "assets_access_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_type__individual_accountId_key" ON "account_meta__individual"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_type__brand_accountId_key" ON "account_meta__brand"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "family_member_family_member_key" ON "family_member"("family_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "neupid_neupid_key" ON "neupid"("neupId");

-- CreateIndex
CREATE INDEX "authn_method_accountId_idx" ON "authn_method"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "authn_method_accountId_type_order_key" ON "authn_method"("accountId", "type", "order");

-- CreateIndex
CREATE INDEX "portfolio_assets_assetType_assetId_idx" ON "portfolio_asset"("assetType", "assetId");

-- CreateIndex
CREATE INDEX "portfolio_assets_portfolioId_idx" ON "portfolio_asset"("parentPortfolioId");

-- CreateIndex
CREATE INDEX "portfolio_members_accountId_idx" ON "portfolio_member"("accountId");

-- CreateIndex
CREATE INDEX "portfolio_members_portfolioId_idx" ON "portfolio_member"("parentPortfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_members_portfolioId_accountId_key" ON "portfolio_member"("parentPortfolioId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "user_app_connections_accountId_appId_key" ON "application_connection"("account_id", "app_id");

-- CreateIndex
CREATE INDEX "application_bridge_app_id_type_idx" ON "application_bridge"("app_id", "type");

-- CreateIndex
CREATE INDEX "application_policies_app_id_policy_type_idx" ON "application_policies"("app_id", "policy_type");

-- CreateIndex
CREATE INDEX "authz_account_access_grant_owner_account_id_idx" ON "authz_account_access_grant"("owner_account_id");

-- CreateIndex
CREATE INDEX "authz_account_access_grant_target_account_id_idx" ON "authz_account_access_grant"("target_account_id");

-- CreateIndex
CREATE INDEX "authz_account_access_grant_role_id_idx" ON "authz_account_access_grant"("role_id");

-- CreateIndex
CREATE INDEX "authz_account_access_grant_app_id_idx" ON "authz_account_access_grant"("app_id");

-- CreateIndex
CREATE INDEX "assets_access_grant_asset_id_idx" ON "assets_access_grant"("assetId");

-- CreateIndex
CREATE INDEX "assets_access_grant_target_account_id_idx" ON "assets_access_grant"("target_account_id");

-- CreateIndex
CREATE INDEX "assets_access_grant_role_id_idx" ON "assets_access_grant"("role_id");

-- CreateIndex
CREATE INDEX "assets_access_grant_portfolio_id_idx" ON "assets_access_grant"("portfolio_id");

-- AddForeignKey
ALTER TABLE "account_meta__individual" ADD CONSTRAINT "account_type__individual_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_meta__brand" ADD CONSTRAINT "account_type__brand_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notifications_accountId_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "requests_recipientId_fkey" FOREIGN KEY ("recipient_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification" ADD CONSTRAINT "verification_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification" ADD CONSTRAINT "verification_done_by_fkey" FOREIGN KEY ("done_by") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neupid" ADD CONSTRAINT "neup_ids_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authn_method" ADD CONSTRAINT "passwords_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authn_session" ADD CONSTRAINT "sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_error" ADD CONSTRAINT "error_logs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_asset" ADD CONSTRAINT "portfolio_assets_portfolioId_fkey" FOREIGN KEY ("parentPortfolioId") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_member" ADD CONSTRAINT "portfolio_members_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_member" ADD CONSTRAINT "portfolio_members_portfolioId_fkey" FOREIGN KEY ("parentPortfolioId") REFERENCES "portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_connection" ADD CONSTRAINT "user_app_connections_accountId_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_connection" ADD CONSTRAINT "user_app_connections_appId_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_bridge" ADD CONSTRAINT "application_bridge_appId_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_policies" ADD CONSTRAINT "application_policies_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_capability" ADD CONSTRAINT "authz_capability_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_role" ADD CONSTRAINT "authz_role_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_role_capability_map" ADD CONSTRAINT "authz_role_capability_map_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "authz_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_role_capability_map" ADD CONSTRAINT "authz_role_capability_map_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "authz_capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_account_access_grant" ADD CONSTRAINT "authz_account_access_grant_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_account_access_grant" ADD CONSTRAINT "authz_account_access_grant_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_account_access_grant" ADD CONSTRAINT "authz_account_access_grant_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "authz_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_account_access_grant" ADD CONSTRAINT "authz_account_access_grant_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authz_account_access_grant" ADD CONSTRAINT "authz_account_access_grant_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets_access_grant" ADD CONSTRAINT "assets_access_grant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "portfolio_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets_access_grant" ADD CONSTRAINT "assets_access_grant_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets_access_grant" ADD CONSTRAINT "assets_access_grant_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "authz_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets_access_grant" ADD CONSTRAINT "assets_access_grant_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

