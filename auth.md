::neup.documentation::unified-auth-permission-system
::title Unified Auth Permission System Architecture

Defines how Neup stores authentication, authorization, access grants, role definitions, permission definitions, sessions, login methods, and auth activity data.

::private

## Goal

The unified permission system should make one authorization path responsible for every access decision:

1. Identify the actor account through authn data.
2. Resolve the actor's membership context through `member`.
3. Resolve the protected resource through `assets`.
4. Resolve the grant through `access`.
5. Resolve the assigned role through `authz_role`.
6. Resolve role permissions through `authz_role_permission_map` and `authz_permission`.
7. Evaluate active status, temporary expiry, scope rules, and approval rules before allowing the action.

The system should avoid duplicated business logic. Permission definitions and role definitions live in authz tables. Access rows and role assignment rows materialize who has what role over which asset.

Field names below use the Prisma model property when it is the clearer application-facing name. Where the database column differs materially, the mapped table or column name is called out in the section heading or field description.

## Table Field Reference

This reference lists the database table name associated with each auth-related model and every stored column in that table. Relation-only Prisma properties are not listed because they are not database columns.

table: `account`
purpose: Root identity table for every account that can authenticate, own resources, receive grants, or act in audit logs.

id: `String`, not nullable, primary key, default `uuid()`.
displayName: `String`, nullable.
accountType: `String`, not nullable, default `individual`.
displayImage: `String`, nullable.
status: `String`, nullable.
isVerified: `Boolean`, not nullable, default `false`.
details: `Json`, nullable.
createdAt: `DateTime`, not nullable, default `now()`.
linkedAccountId: `String`, nullable, references `account.id`.



======>
table: `resources`
purpose: Uploaded or linked resources associated with accounts, including identity or verification documents when used by auth flows.

id: `String`, not nullable, primary key, default `uuid()`.
type: `String`, not nullable.
accountId: `String`, nullable, references `account.id` with set null on delete.
uploadedBy: `String`, not nullable, references `account.id` with cascade delete.
value: `String`, not nullable.
details: `Json`, nullable.
uploadedOn: `DateTime`, not nullable, default `now()`.

action: let's drop this table, this will come from the drive application.
=======>


=======>
table: `account_individual`
purpose: Type-specific profile data for individual accounts.

accountId: `String`, not nullable, primary key, unique, references `account.id` with cascade delete.
firstName: `String`, nullable.
middleName: `String`, nullable.
lastName: `String`, nullable.
dateOfBirth: `DateTime`, nullable.
countryOfResidence: `String`, nullable.
details: `Json`, nullable.
roleId: `String`, nullable.
=======>


=======>
table: `account_brand`
purpose: Type-specific profile data for brand accounts.

accountId: `String`, not nullable, primary key, unique, references `account.id` with cascade delete.
brandName: `String`, nullable.
isLegalEntity: `Boolean`, not nullable, default `false`.
originCountry: `String`, nullable.
details: `Json`, nullable.
=======>


=======>
table: `system_config`
purpose: System-level configuration storage for auth, policy, or application settings.

key: `String`, not nullable, primary key.
data: `Json`, not nullable.
updatedAt: `DateTime`, not nullable, default `now()`, auto-updated.

action: drop this table after the file based system is active.
=======>


=======>done
table: `authn_request`
purpose: Temporary authentication or authorization flow state, such as login, verification, consent, and step-up requests.

id: `String`, not nullable, primary key, default `uuid()`.
type: `String`, not nullable.
status: `String`, not nullable, default `pending`.
data: `Json`, not nullable, default `{}`.
accountId: `String`, nullable.
createdAt: `DateTime`, not nullable, default `now()`.
expiresAt: `DateTime`, not nullable.

=======>done
table: `authn_method`
purpose: Login methods and credential records for an account.

accountId: `String`, not nullable, references `account.id`.
value: `String`, not nullable.
id: `String`, not nullable, primary key, default `uuid()`.
type: `String`, not nullable.
order: `String`, not nullable.
status: `String`, not nullable.
detail: `Json`, nullable.

=======>done
table: `authn_session`
purpose: Active and historical login sessions used to authenticate requests.

id: `String`, not nullable, primary key, default `uuid()`.
accountId: `String`, not nullable, references `account.id`.
key: `String`, nullable.
ipAddress: `String`, not nullable.
userAgent: `String`, not nullable.
validTill: `DateTime`, nullable.
lastLoggedIn: `DateTime`, not nullable.
loginType: `String`, not nullable.
geolocation: `String`, nullable.
deviceType: `String`, nullable.


=======>
table: `activity`
purpose: Security and auth audit log for actions performed by one account against another target.

id: `String`, not nullable, primary key, default `uuid()`.
targetAccountId: `String`, not nullable.
actorAccountId: `String`, not nullable.
action: `String`, not nullable.
status: `String`, not nullable.
ip: `String`, not nullable.
timestamp: `DateTime`, not nullable, default `now()`.
geolocation: `String`, nullable.

action: make a standard payload system and use that on all applications.
=======>


=======>
table: `system_error`
purpose: Diagnostic error log with optional account and request metadata.

id: `String`, not nullable, primary key, default `uuid()`.
message: `String`, not nullable.
context: `String`, not nullable.
timestamp: `DateTime`, not nullable, default `now()`.
accountId: `String`, nullable, references `account.id`.
geolocation: `String`, nullable.
ipAddress: `String`, nullable.
=======>


=======>
table: `notification`
purpose: Account notification table for auth events, requests, verification updates, and access changes.

id: `String`, not nullable, primary key, default `uuid()`.
accountId: `String`, not nullable, references `account.id`.
action: `String`, nullable.
title: `String`, nullable.
message: `String`, nullable.
type: `String`, not nullable, default `info`.
read: `Boolean`, not nullable, default `false`.
createdAt: `DateTime`, not nullable, default `now()`.
deletableOn: `DateTime`, nullable.
persistence: `String`, nullable.
detail: `Json`, nullable.

action: use this as the base notification provider for all the applications of NeupEcosystem and other apps as well. make a standard action and readAs payload format for this.
=======>


=======>
table: `application_dev_log`
purpose: Application API request and response log for debugging, status tracking, and auth failure visibility.

id: `String`, not nullable, primary key, default `uuid()`.
app_id: `String`, not nullable, references `application.id` with cascade delete.
endpoint: `String`, not nullable.
method: `String`, not nullable.
status_code: `Int`, not nullable.
requester_ip: `String`, nullable.
origin: `String`, nullable.
referer: `String`, nullable.
user_agent: `String`, nullable.
request_body: `Json`, nullable.
query: `Json`, nullable.
request_meta: `Json`, nullable.
response_body: `Json`, nullable.
error: `String`, nullable.
created_at: `DateTime`, not nullable, default `now()`.

action: change the table name and also change the dev log payload and make it standard, make a system so that all apps in neup ecosystem use this dev logger.
=======>


=======>done
table: `authz_permission`
purpose: Canonical permission catalog for application and system permissions.

id: `String`, not nullable, primary key, default `uuid()`.
name: `String`, not nullable.
description: `String`, nullable.
app_id: `String`, nullable, references `application.id`.
scope_for: `Json`, nullable, default `[]`.
scope_level: `Json`, nullable, default `[]`.
approval_policy: `String`, nullable, default `none`.
rules: `String`, nullable.
status: `String`, nullable.
tag: `Json`, nullable.
=======>


=======>done
table: `authz_role`
purpose: Canonical role definition table for application and system roles.

id: `String`, not nullable, primary key, default `uuid()`.
name: `String`, not nullable.
description: `String`, nullable.
app_id: `String`, nullable, references `application.id`.
scope_for: `Json`, not nullable, default `[]`.
scope_level: `String`, not nullable, default `assignable.byTeam`.
acquisition_type: `String`, not nullable, default `assignment`.
approval_policy: `String`, not nullable, default `none`.
pushed: `Boolean`, not nullable, default `false`.
applicable_for: `Json`, not nullable, default `[]`.
permissions: `Json`, nullable.
=======>


=======>done
table: `authz_role_permission_map`
purpose: Canonical many-to-many mapping from roles to permissions with scope metadata.

id: `String`, not nullable, primary key, default `uuid()`.
role_id: `String`, not nullable, references `authz_role.id` with cascade delete.
permission_id: `String`, not nullable, references `authz_permission.id` with cascade delete.
scope_for: `String`, not nullable.
scope_level: `String`, not nullable.
created_at: `DateTime`, not nullable, default `now()`.
=======>


=======>
table: `member`
purpose: Subject relationship table that represents an account as a member under a parent account.

id: `String`, not nullable, primary key, default `uuid()`.
member_type: `String`, not nullable.
child_account_id: `String`, nullable, references `account.id` with cascade delete.
parent_account_id: `String`, nullable, references `account.id` with cascade delete.
status: `String`, not nullable, default `active`.
is_temporary: `DateTime`, nullable.
details: `Json`, nullable.

action: rename child_account_id to targetAccountId and parentAccountId to actorAccountId, then drop the member_type field, and finally if the member_type is acc_self, set the same value for child_account_id/actorAccountId and targetAccountId/child_account_id
=======>


=======>
table: `assets`
purpose: Protected resource relationship table for account, application, and connection assets under a parent account.

id: `String`, not nullable, primary key, default `uuid()`.
type: `AssetType`, not nullable.
child_account_id: `String`, nullable, references `account.id` with cascade delete.
child_connection_id: `String`, nullable, references `connection.id` with cascade delete.
child_application_id: `String`, nullable, references `application.id` with cascade delete.
parent_account_id: `String`, nullable, references `account.id` with cascade delete.
is_temporary: `DateTime`, nullable.
status: `String`, not nullable, default `active`.
details: `Json`, nullable.
=======>


table: `access`
purpose: Materialized runtime grant table that connects a member, protected asset, and assigned authz role.

id: `String`, not nullable, primary key, default `uuid()`.
access_type: `AccessType`, not nullable.
member_id: `String`, not nullable, references `member.id` with cascade delete.
member_account_id: `String`, nullable, references `account.id` with cascade delete.
parent_account_id: `String`, nullable, references `account.id` with cascade delete.
asset_id: `String`, not nullable, references `assets.id` with cascade delete.
asset_account_id: `String`, nullable, references `account.id` with cascade delete.
asset_connection_id: `String`, nullable, references `connection.id` with cascade delete.
asset_application_id: `String`, nullable, references `application.id` with cascade delete.
access_application_id: `String`, nullable, references `application.id` with set null on delete.
is_temporary: `DateTime`, nullable.
role_id: `String`, not nullable, references `authz_role.id`.
status: `String`, not nullable, default `active`.
details: `Json`, nullable.

table: `role`
purpose: Denormalized member role assignment read model for account, connection, and asset contexts.

id: `String`, not nullable, primary key, default `uuid()`.
member_id: `String`, not nullable, references `member.id` with cascade delete.
account_id: `String`, nullable, references `account.id`.
connection_id: `String`, nullable, references `connection.id`.
asset_id: `String`, nullable, references `assets.id`.
asset_type: `String`, nullable.
asset_id_denorm: `String`, nullable.
role_id: `String`, not nullable, references `authz_role.id`.
role_name: `String`, nullable.
permissions: `Json`, nullable.
status: `String`, not nullable, default `active`.
details: `Json`, nullable.

table: `account_ownership`
purpose: Account hierarchy table that tracks parent-child ownership relationships.

id: `String`, not nullable, primary key, default `uuid()`.
parent_id: `String`, not nullable, references `account.id` with cascade delete.
children_id: `String`, not nullable, references `account.id` with cascade delete.
type: `String`, not nullable.
created_at: `DateTime`, not nullable, default `now()`.

table: `authz_assets_access_grant`
purpose: Compact app-scoped grant index for account-to-asset authorization sync and fast lookup.

id: `String`, not nullable, primary key, default `uuid()`.
asset_id: `String`, not nullable, references `assets.id`.
account_id: `String`, not nullable, references `account.id`.
role_id: `String`, not nullable, references `authz_role.id`.
app_id: `String`, not nullable.
asset_type: `String`, nullable.

table: `permit`
purpose: Legacy direct account-to-account permission grant table.

id: `String`, not nullable, primary key, default `uuid()`.
account_id: `String`, not nullable, references `account.id` with cascade delete.
target_account_id: `String`, not nullable, references `account.id` with cascade delete.
for_self: `Boolean`, not nullable, default `false`.
is_root: `Boolean`, not nullable, default `false`.
permissions: `String[]`, not nullable, default `[]`.
restrictions: `String[]`, not nullable, default `[]`.
created_at: `DateTime`, not nullable, default `now()`.
updated_at: `DateTime`, not nullable, auto-updated.

table: `application`
purpose: Application registry and owner of app-specific authz definitions, sessions, tokens, and external auth behavior.

id: `String`, not nullable, primary key.
name: `String`, not nullable.
description: `String`, nullable.
icon: `String`, nullable.
website: `String`, nullable.
app_secret: `String`, nullable.
created_at: `DateTime`, not nullable, default `now()`.
endpoints: `Json`, nullable.
status: `String`, not nullable, default `development`.
is_internal: `Boolean`, not nullable, default `false`.
response_fields: `String[]`, not nullable, default `[]`.
token_fields: `String[]`, not nullable, default `[]`.
details: `Json`, nullable.
party: `Int`, not nullable, default `1`.
provider_id: `String`, nullable, references `application_provider.id`.
def_role_id: `String`, nullable, references `authz_role.id`.

table: `application_provider`
purpose: Provider records for applications and app secret ownership.

id: `String`, not nullable, primary key, default `uuid()`.
provider_name: `String`, not nullable.
provider_site: `String`, not nullable.
secret_hash: `String`, not nullable.

table: `connection`
purpose: Account-to-application connection table.

id: `String`, not nullable, primary key, default `uuid()`.
account_id: `String`, not nullable, references `account.id` with cascade delete.
app_id: `String`, not nullable, references `application.id`.
role_id: `String`, nullable, references `authz_role.id`.
status: `String`, not nullable, default `active`.
connected_at: `DateTime`, not nullable, default `now()`.
details: `Json`, nullable.

table: `application_policies`
purpose: Application-level policy records for authz behavior, consent, scope, and assignment rules.

id: `String`, not nullable, primary key, default `uuid()`.
app_id: `String`, not nullable, references `application.id` with cascade delete.
policy_type: `String`, not nullable.
policy_value: `Json`, not nullable.
created_at: `DateTime`, not nullable, default `now()`.

table: `application_bridge`
purpose: Bridge configuration for app integrations and downstream authz sync.

id: `String`, not nullable, primary key, default `uuid()`.
app_id: `String`, not nullable, references `application.id` with cascade delete.
type: `String`, not nullable.
value: `String`, not nullable.
details: `Json`, nullable.
created_at: `DateTime`, not nullable, default `now()`.

table: `identity`
purpose: Per-application identity records keyed by guest account or tracking id.

id: `String`, not nullable, primary key, default `cuid()`.
track_id: `String`, not nullable.
app_id: `String`, not nullable, references `application.id`.
originated_on: `DateTime`, not nullable, default `now()`.
refreshes_on: `DateTime`, not nullable.
valid_till: `DateTime`, not nullable.
details: `Json`, not nullable, default `[]`.

table: `contact`
purpose: Contact and login-address records associated with accounts.

id: `String`, not nullable, primary key, default `uuid()`.
accountId: `String`, not nullable, references `account.id`.
contactType: `String`, not nullable.
value: `String`, not nullable.

table: `neupid`
purpose: Neup ID aliases for accounts.

id: `String`, not nullable, primary key.
accountId: `String`, not nullable, references `account.id`.
neupId: `String`, not nullable, unique.
isPrimary: `Boolean`, not nullable, default `false`.
dateAdded: `DateTime`, not nullable, default `now()`.

table: `family`
purpose: Family grouping table for account relationship workflows.

id: `String`, not nullable, primary key, default `uuid()`.
created_by: `String`, not nullable.
created_at: `DateTime`, not nullable, default `now()`.

table: `family_member`
purpose: Join table between family groups and account members.

id: `String`, not nullable, primary key, default `uuid()`.
family_id: `String`, not nullable, references `family.id`.
member_id: `String`, not nullable, references `account.id`.
role: `String`, not nullable, default `member`.

table: `verification`
purpose: Account verification workflow records.

id: `String`, not nullable, primary key, default `uuid()`.
account_id: `String`, not nullable, references `account.id` with cascade delete.
status: `String`, not nullable, default `pending`.
reason: `String`, nullable.
category: `String`, nullable.
done_by: `String`, nullable, references `account.id`.
done_at: `DateTime`, not nullable, default `now()`.
previously: `String`, nullable.
created_at: `DateTime`, not nullable, default `now()`.

table: `request`
purpose: Account-to-account request workflow table for invitations, access requests, and related actions.

id: `String`, not nullable, primary key, default `uuid()`.
senderId: `String`, not nullable, references `account.id`.
recipient_id: `String`, not nullable, references `account.id`.
status: `String`, not nullable, default `pending`.
action: `String`, not nullable.
type: `String`, nullable.
data: `Json`, nullable, default `{}`.
created_at: `DateTime`, not nullable, default `now()`.
updated_at: `DateTime`, not nullable, auto-updated.

## Authn Data

Authentication data answers "who is this actor and how did they prove it?"

### `account`

The `account` table is the identity root for people, brands, linked accounts, and application actors. Every authn and authz record should eventually resolve to an `account.id`.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Primary identity key used across authn, authz, access, sessions, and activity. |
| `accountType` | Classifies the account, for example individual or brand. |
| `status` | Determines whether the account can be used. Blocked or inactive accounts must fail permission checks. |
| `isVerified` | Verification marker for flows that require verified accounts. |
| `linkedAccountId` | Optional account linkage for delegated or related identity flows. |
| `details` | Extensible metadata. |

### `account_individual` and `account_brand`

These tables store type-specific account profile data. They do not make authorization decisions directly. Permission checks should use the root `account.id` and status first, then profile data only when a policy explicitly requires it.

### `authn_method`

The `authn_method` table stores login credentials or login factors. This replaces older "password table" wording with a generic method table.

Important fields:

| Field | Purpose |
| --- | --- |
| `accountId` | Account that owns the method. |
| `type` | Method type, such as password, email OTP, passkey, external login, or other future factors. |
| `value` | Stored method value, secret reference, or hashed value depending on method type. |
| `order` | Method ordering or variant key per account and type. |
| `status` | Active, disabled, pending, revoked, or equivalent lifecycle state. |
| `detail` | Method metadata, device detail, provider detail, or policy metadata. |

Only authn logic should read or validate method values. Authz logic should not inspect password or factor details.

### `authn_session`

The `authn_session` table stores active and historical login sessions.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Session id passed as `sid`. |
| `key` | Session secret passed as `skey` or stored server-side for validation. |
| `accountId` | Authenticated account. |
| `loginType` | Login channel, including internal sessions and external app sessions. |
| `validTill` | Session expiry. Expired sessions must fail before authz lookup. |
| `lastLoggedIn` | Last login timestamp. |
| `ipAddress`, `userAgent`, `geolocation`, `deviceType` | Session risk and audit metadata. |

Runtime permission checks should validate session id, session key, login type, and `validTill` before reading grants.

### `authn_request`

The `authn_request` table stores temporary auth flows such as login, verification, consent, or step-up requests.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Request id used by the auth flow. |
| `type` | Flow type. |
| `status` | Pending, completed, used, cancelled, expired, or equivalent lifecycle state. |
| `data` | Flow-specific payload. |
| `accountId` | Optional account associated with the request. |
| `createdAt`, `expiresAt` | Timeout boundaries. |

Auth requests are single-flow state. They should not become long-term grants.

## Auth Activity And Audit Data

Activity data answers "what happened, who did it, and from where?"

### `activity`

The `activity` table stores security and auth activity events.

Important fields:

| Field | Purpose |
| --- | --- |
| `memberId` | Target account or member affected by the activity. |
| `actorAccountId` | Account that performed the action. |
| `action` | Action name. |
| `status` | Result status. |
| `ip`, `geolocation`, `timestamp` | Audit metadata. |

Permission changes, login-sensitive events, role assignment changes, and grant revocations should create activity rows.

### `system_error`

The `system_error` table stores auth-related and system errors with optional account, IP, and geolocation context. It is for diagnostics and audit support, not authorization.

### `application_dev_log`

The `application_dev_log` table stores application API request logs, response statuses, request metadata, response metadata, and errors. It supports app developer debugging and should use correct HTTP status codes for auth failures:

| Case | Status |
| --- | --- |
| Missing or invalid authn credentials | `401 Unauthorized` |
| Valid authn but missing permission | `403 Forbidden` |
| Requested auth resource does not exist or should not be exposed | `404 Not Found` |
| Expired session, expired auth request, or expired grant | `401 Unauthorized` for authn expiry, `403 Forbidden` for grant expiry |

## Authz Definition Data

Authorization definition data answers "what permissions and roles exist?"

### `authz_permission`

The `authz_permission` table is the canonical permission catalog.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Permission definition id. |
| `name` | Stable permission name. Unique per app. |
| `description` | Human-readable meaning. |
| `appId` | Application that owns the permission, or null for shared/system permissions. |
| `scopeFor` | JSON list of resource types the permission can apply to. |
| `scopeLevel` | JSON list of supported scope levels. |
| `approvalPolicy` | Approval requirement for using or assigning the permission. |
| `rules` | Additional rule expression or rule reference. |
| `status` | Lifecycle state. |
| `tag` | Metadata for grouping and UI. |

Permission names should be stable API contracts. Display names, grouping, and descriptions can change without changing the permission name.

### `authz_role`

The `authz_role` table is the canonical role definition table.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Role definition id. |
| `name` | Stable role name. Unique per app. |
| `description` | Human-readable role meaning. |
| `appId` | Application that owns the role, or null for shared/system roles. |
| `scopeFor` | JSON list of resource types where the role can be assigned. |
| `scopeLevel` | Assignment scope level, such as team-assignable policy. |
| `acquisitionType` | How the role can be acquired, for example assignment or request. |
| `approvalPolicy` | Approval requirement for acquiring or assigning the role. |
| `applicableFor` | JSON list of subject/resource contexts where this role is valid. |
| `permissions` | Optional denormalized permission snapshot for fast reads. |
| `pushed` | Whether this role has been pushed/synced to downstream systems. |

The normalized source of role permissions is `authz_role_permission_map`. The `permissions` JSON is a cache or display snapshot and must not become a competing source of truth.

### `authz_role_permission_map`

The `authz_role_permission_map` table is the canonical many-to-many mapping from roles to permissions.

Important fields:

| Field | Purpose |
| --- | --- |
| `roleId` | Role definition id. |
| `permissionId` | Permission definition id. |
| `scopeFor` | Resource type this permission applies to inside the role. |
| `scopeLevel` | Scope level this permission applies to inside the role. |
| `createdAt` | Mapping creation timestamp. |

The uniqueness rule is `roleId + permissionId + scopeFor + scopeLevel`. This allows the same permission to be included with different scope semantics when needed.

## Relationship And Grant Data

Relationship and grant data answers "who has access to what?"

### `member`

The `member` table represents an account's membership under another account.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Membership id used by access and assignment rows. |
| `memberType` | Relationship type, currently account-in-account style membership. |
| `memberAccountId` | Child account receiving membership. |
| `parentAccountId` | Parent account that owns or controls the membership context. |
| `status` | Active, paused, removed, or equivalent state. |
| `isTemporary` | Optional expiry timestamp. Null means permanent. |
| `details` | Extensible relationship metadata. |

Every delegated access grant should start from a member row. If the member row is inactive or expired, related access must fail.

### `assets`

The `assets` table represents a protected resource under a parent account.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Asset id used by access rows. |
| `access_type` | Asset relationship type, such as `acc_in_acc`, `app_in_acc`, or `conn_in_acc`. |
| `member_account_id` | Child account asset. |
| `member_connection_id` | Child connection asset. |
| `access_application_id` | Child application asset. |
| `parent_account_id` | Parent account that owns or exposes the asset. |
| `status` | Active, held, removed, or equivalent state. |
| `isTemporary` | Optional expiry timestamp. |
| `details` | Extensible asset metadata. |

Assets are the resource side of permission checks. Account, application, and connection access should be represented as assets before grants are created.

### `access`

The `access` table is the materialized access grant table. It connects a `member`, an `asset`, and an `authz_role`.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Grant id. |
| `accessType` | Grant type, such as `acc_self`, `acc_self.root`, `acc_in_acc`, `app_in_acc`, or `conn_in_acc`. |
| `memberId` | Subject membership receiving access. |
| `memberAccountId` | Denormalized subject account id. |
| `parentAccountId` | Denormalized parent account id. |
| `assetId` | Protected asset id. |
| `assetAccountId` | Denormalized account asset id. |
| `assetConnectionId` | Denormalized connection asset id. |
| `assetApplicationId` | Denormalized application asset id. |
| `accessApplicationId` | Application context for app-specific checks. |
| `roleId` | Assigned `authz_role.id`. |
| `status` | Active, expired, hold, removed, or equivalent state. |
| `isTemporary` | Optional expiry timestamp. |
| `details` | Grant metadata. |

Permission checks should prefer this table for runtime grants because it has the subject, resource, role, status, expiry, and denormalized lookup fields in one place.

### `role`

The `role` table is a denormalized member role assignment table. It records which role a member has for an account, connection, or asset context.

Important fields:

| Field | Purpose |
| --- | --- |
| `memberId` | Member receiving the assignment. |
| `accountId` | Account context when assignment is account-scoped. |
| `connectionId` | Connection context when assignment is connection-scoped. |
| `assetId` | Asset context when assignment is asset-scoped. |
| `assetType`, `assetIdDenorm` | Denormalized asset lookup helpers. |
| `roleId` | Assigned `authz_role.id`. |
| `roleName` | Optional denormalized role name. |
| `permissions` | Optional denormalized permission snapshot. |
| `status` | Assignment status. |
| `details` | Assignment metadata. |

This table should be treated as assignment/read optimization data. Canonical role definitions remain in `authz_role`, and canonical role-permission mappings remain in `authz_role_permission_map`.

### `authz_assets_access_grant`

The `authz_assets_access_grant` table is a compact grant index for account-to-asset app authorization.

Important fields:

| Field | Purpose |
| --- | --- |
| `asset_id` | Protected asset id. |
| `account_id` | Account receiving access. |
| `role_id` | Assigned `authz_role.id`. |
| `app_id` | Application context. |
| `asset_type` | Denormalized asset type. |

This table can support external app authorization sync and fast app-scoped lookups, but it should not conflict with `access`.

### `permit`

The `permit` table is an older direct account-to-account permission grant table.

Important fields:

| Field | Purpose |
| --- | --- |
| `accountId` | Account granting or owning the permit. |
| `memberId` | Target account. |
| `forSelf` | Whether the permit applies to self access. |
| `isRoot` | Whether the permit is root-level. |
| `permissions` | Direct permission string list. |
| `restrictions` | Direct restriction string list. |

For the unified architecture, new flows should prefer `member + assets + access + authz_role + authz_role_permission_map`. Existing permit flows should be migrated or bridged into that model.

## Application Authz Data

### `application`

The `application` table owns app-specific authz definitions and external authorization behavior.

Important fields:

| Field | Purpose |
| --- | --- |
| `id` | Application id used by sessions, permissions, roles, connections, and logs. |
| `appSecret` | Application secret material or secret reference. |
| `status` | Development, active, disabled, or equivalent app lifecycle state. |
| `isInternal` | Internal app marker. |
| `responseFields`, `tokenFields` | Fields allowed in auth/token responses. |
| `defaultRoleId` | Default role assigned for the application. |
| `endpoints`, `details` | App configuration metadata. |

### `connection`

The `connection` table links an account to an application.

Important fields:

| Field | Purpose |
| --- | --- |
| `accountId` | Connected account. |
| `appId` | Connected application. |
| `roleId` | Optional default or current app role. |
| `status` | Connection lifecycle state. |
| `connectedAt` | Connection timestamp. |
| `details` | Connection metadata. |

Connection-scoped access should be represented as an asset with `conn_in_acc` and granted through `access` where possible.

### `application_policy`

The `application_policy` table stores app-level policies, such as consent requirements, assignment rules, visibility rules, or scope policies.

### `application_bridge`

The `application_bridge` table stores app bridge configuration for integrations and downstream authz sync.

### `identity`

The `identity` table stores per-app identity records keyed by guest account or tracking id. It supports third-party app identity continuity, not direct permission grants.

## Runtime Permission Check

Runtime checks should follow this order:

1. Validate the authn session from `authn_session`.
2. Load the authenticated `account` and reject inactive or blocked accounts.
3. Resolve the requested application, endpoint, API, or resource.
4. Resolve the member row for the actor and parent context.
5. Resolve the asset row for the protected account, application, or connection.
6. Resolve active `access` rows for `memberId + assetId + accessApplicationId` or the closest indexed denormalized fields.
7. Reject inactive or expired `member`, `assets`, `access`, and role assignment rows.
8. Load the assigned `authz_role`.
9. Load permissions from `authz_role_permission_map` joined to `authz_permission`.
10. Apply scope, approval, status, and rule checks.
11. Return allow or deny with the correct HTTP status code.

## Write Flow

When granting access:

1. Create or reuse a `member` row for the receiving account under the parent account.
2. Create or reuse an `assets` row for the protected account, application, or connection under the parent account.
3. Select an `authz_role` that is valid for the asset type and application context.
4. Create an `access` row linking the member, asset, and role.
5. Optionally create or refresh a denormalized `role` row and app-specific grant index.
6. Write an `activity` row describing the grant.

When revoking access:

1. Update `access.status` to removed, expired, or held.
2. Update related `role` assignment rows when they are used as read models.
3. Update bridge/index rows if present.
4. Write an `activity` row describing the revocation.

## Source Of Truth Rules

| Concern | Source of truth |
| --- | --- |
| Account identity | `account` |
| Login methods and credentials | `authn_method` |
| Active sessions | `authn_session` |
| Temporary auth flows | `authn_request` |
| Permission definitions | `authz_permission` |
| Role definitions | `authz_role` |
| Role-to-permission mappings | `authz_role_permission_map` |
| Subject membership | `member` |
| Protected resources | `assets` |
| Runtime grants | `access` |
| Denormalized assignments | `role` |
| App grant index | `authz_assets_access_grant` |
| Audit events | `activity` |

## Migration Direction

The target architecture should move toward these conventions:

1. Use `authn_*` tables only for authentication and login/session flows.
2. Use `authz_*` tables only for authorization definitions and role-permission relationships.
3. Use `member`, `assets`, and `access` for every runtime grant.
4. Use `role`, `authz_assets_access_grant`, and JSON permission snapshots as read models or sync artifacts only.
5. Migrate direct `permit.permissions` flows into role-based `access` grants.
6. Keep status and expiry checks consistent across member, asset, access, role, session, and account records.
7. Keep HTTP responses consistent: `401` for failed authentication, `403` for denied authorization, and `404` when a resource should not be revealed.

::private end

::end
