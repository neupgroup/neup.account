// All shared types and constants for the application domain.

export const applicationAccessFields = [
  'connectionId',
  'accountId',
  'displayName',
  'displayImage',
  'accountType',
  'role',
  'lastActive',
  'neupid',
  'firstName',
  'lastName',
  'middleName',
  'dateBirth',
  'age',
  'isMinor',
  'gender',
] as const;

export type ApplicationAccessField = (typeof applicationAccessFields)[number];

// ---------------------------------------------------------------------------
// Config UI groupings
// ---------------------------------------------------------------------------

// Fields the application owner can toggle for API "response" payloads.
export const applicationResponseFields = [
  'displayName',
  'displayImage',
  'role',
  'lastActive',
  'dateBirth',
  'age',
  'gender',
  'isMinor',
] as const satisfies readonly ApplicationAccessField[];

export type ApplicationResponseField = (typeof applicationResponseFields)[number];

// JWT fields an application can request to be included in issued tokens.
// Note: issuedOn/expiresOn are always included and are not configurable.
export const applicationTokenFields = [
  'connectionId',
  'accountId',
  'accountType',
  'neupid',
] as const satisfies readonly ApplicationAccessField[];

export type ApplicationTokenField = (typeof applicationTokenFields)[number];

export type Application = {
  id: string;
  name: string;
  description: string;
  appSecret?: string;
  party?: 'first' | 'third';
  slug?: string;
  dataAccessed?: string[];
  icon?: 'app-window' | 'building' | 'bar-chart' | 'share-2';
  access?: ApplicationAccessField[];
  policies?: Array<{ name: string; policy: string }>;
  endpoints?: ApplicationEndpointConfig;
  accessTo?: string;
};

export type ApplicationPolicyEntry = {
  name: string;
  policy: string;
};

export type ApplicationEndpointConfig = {
  dataDeletionApi?: string;
  dataDeletionPage?: string;
  accountBlock?: string;
  accountBlockApi?: string;
  logoutPage?: string;
  logoutApi?: string;
};

export type ManagedApplication = {
  id: string;
  name: string;
  createdAt: Date;
  hasSecretKey: boolean;
  access: ApplicationAccessField[];
  policies: ApplicationPolicyEntry[];
  endpoints: ApplicationEndpointConfig;
  authzWebhookUrl: string | null;
};

// FlatAppItem — one entry in a section of the applications list page.
export type FlatAppItem = {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
  source: 'managed' | 'connected' | 'root';
  status?: string;      // populated for Root section entries
  connectedAt?: string; // ISO string, populated for Using section entries
};

// ApplicationSection — one named group on the list page.
export type ApplicationSection = {
  label: 'Using' | 'Development' | 'Root';
  apps: FlatAppItem[];
  error?: boolean; // true when this section failed to load
};

// ApplicationDetailsV2 — full detail payload for the detail page.
// appSecret is intentionally excluded.
export type ApplicationDetailsV2 = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  website?: string;
  status?: string;
  isInternal: boolean;
  connectedAt?: string;       // ISO string — present when user has an ApplicationConnection
  configuredAccess: ApplicationAccessField[];
  accessedData: string[];
  hasUsedApp: boolean;
  policies: ApplicationPolicyEntry[];
  endpoints: ApplicationEndpointConfig;
  canEdit: boolean;           // true for app owner/developer
  isRootViewer: boolean;      // true when root.application.view permission held
  canDelete: boolean;         // true for app owner
};
