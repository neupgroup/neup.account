// Shared types and constants for unified requests.
// This file has no "use server" directive so it can export plain values.

// ---------------------------------------------------------------------------
// Canonical type map — ?type= param → action value in DB (or special key)
// ---------------------------------------------------------------------------

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  neupid_request:       'NeupID',
  display_name_request: 'Display Name',
  kyc_request:          'KYC',
  kycVerification:      'KYC Verification',
  applicationChange:    'Application Change',
  applicationRoleRequest: 'Application Role',
  accountDeletion:      'Account Deletion',
  payment_request:      'Payment',
  report:               'Report',
};

// ---------------------------------------------------------------------------
// Normalised request row
// ---------------------------------------------------------------------------

export type UnifiedRequest = {
  id: string;
  type: string;           // action value or special key
  typeLabel: string;
  summary: string;        // one-line human description
  submittedBy: string;    // display name of sender
  submittedAt: string;
  status: string;
  /** Extra payload fields for the detail view */
  data: Record<string, unknown>;
  /** The account the request is about (may differ from submittedBy for admin-initiated) */
  memberId?: string;
};

export type GetRequestsOptions = {
  /** Filter by type key (matches REQUEST_TYPE_LABELS keys). Omit for all. */
  type?: string;
  /** Filter by appId — only relevant for applicationChange type */
  application?: string;
};
