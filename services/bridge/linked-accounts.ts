import { randomUUID } from 'node:crypto';
import prisma, { Prisma } from '@/core/database/prisma';
import { logError } from '@/logica/logger/files';

/*
::neup.documentation::bridge-linked-accounts-service
::title Bridge Linked Accounts Service

Stores third-party account-link callback payloads for later processing.

::public

Use this service to persist a linked-account callback payload together with the account that owns it and the account that initiated the connection.

::public end

::private

The service validates referenced accounts before inserting, stores the full callback payload in `tokenData`, and keeps request metadata in `moreDetails`.

::private end

::end
*/

type JsonRecord = Record<string, unknown>;

type StoreLinkedAccountInput = {
  platform: string;
  ownerId: string;
  connectedBy: string;
  tokenData: JsonRecord;
  moreDetails?: JsonRecord | null;
};

export type LinkedAccountSummary = {
  id: string;
  platform: string;
  createdOn: Date;
  ownerId: string;
  connectedBy: string;
  accountLabel: string | null;
};

type StoreLinkedAccountResult =
  | { success: true; id: string }
  | { success: false; status: number; error: string };

function toJsonb(value: unknown) {
  return Prisma.sql`CAST(${JSON.stringify(value)} AS JSONB)`;
}

function readJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonRecord)[key];
  }

  if (typeof current !== 'string') return null;
  const trimmed = current.trim();
  return trimmed || null;
}

function extractLinkedAccountLabel(tokenData: unknown): string | null {
  const sources = [
    ['login'],
    ['username'],
    ['name'],
    ['email'],
    ['user', 'login'],
    ['user', 'name'],
    ['user', 'email'],
    ['account', 'login'],
    ['account', 'name'],
    ['account', 'email'],
    ['profile', 'login'],
    ['profile', 'name'],
    ['profile', 'email'],
  ] as const;

  for (const source of sources) {
    const value = readNestedString(tokenData, [...source]);
    if (value) return value;
  }

  return null;
}

export async function storeLinkedAccount(input: StoreLinkedAccountInput): Promise<StoreLinkedAccountResult> {
  /**
   * ::neup.documentation::store-linked-account
   * ::function storeLinkedAccount(input)
   *
   * Persists one linked-account callback payload.
   *
   * ::public
   *
   * The payload is saved as-is in `tokenData`. Request and callback metadata may be saved in `moreDetails`.
   *
   * ::public end
   *
   * ::private
   *
   * Missing referenced accounts fail before insertion so the route can return a stable client error instead of a database constraint error.
   *
   * ::private end
   *
   * ::end
   */
  try {
    const [ownerAccount, connectedByAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: input.ownerId }, select: { id: true } }),
      prisma.account.findUnique({ where: { id: input.connectedBy }, select: { id: true } }),
    ]);

    if (!ownerAccount) {
      return { success: false, status: 404, error: 'ownerId does not reference an existing account.' };
    }

    if (!connectedByAccount) {
      return { success: false, status: 404, error: 'connectedBy does not reference an existing account.' };
    }

    const id = randomUUID();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "linked_accounts" (
        "id",
        "platform",
        "created_on",
        "connected_by",
        "owner_id",
        "more_details",
        "token_data"
      )
      VALUES (
        ${id},
        ${input.platform},
        NOW(),
        ${input.connectedBy},
        ${input.ownerId},
        ${input.moreDetails ? toJsonb(input.moreDetails) : Prisma.sql`NULL`},
        ${toJsonb(input.tokenData)}
      )
      RETURNING "id"
    `);

    return { success: true, id: rows[0]?.id ?? id };
  } catch (error) {
    await logError('database', error, `storeLinkedAccount:${input.platform}:${input.ownerId}:${input.connectedBy}`);
    return { success: false, status: 500, error: 'Failed to store linked account payload.' };
  }
}

export async function getLatestLinkedAccount(
  ownerId: string,
  platform: string,
): Promise<LinkedAccountSummary | null> {
  /**
   * ::neup.documentation::get-latest-linked-account
   * ::function getLatestLinkedAccount(ownerId, platform)
   *
   * Returns the most recent linked-account record for one owner and platform.
   *
   * ::public
   *
   * Use this to show current linked-account status in account-management UI.
   *
   * ::public end
   *
   * ::private
   *
   * The summary extracts a best-effort display label from the stored token payload and falls back to `null` when the callback has not yet captured profile identity data.
   *
   * ::private end
   *
   * ::end
   */
  try {
    const record = await prisma.linkedAccount.findFirst({
      where: { ownerId, platform },
      orderBy: { createdOn: 'desc' },
      select: {
        id: true,
        platform: true,
        createdOn: true,
        ownerId: true,
        connectedBy: true,
        tokenData: true,
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      platform: record.platform,
      createdOn: record.createdOn,
      ownerId: record.ownerId,
      connectedBy: record.connectedBy,
      accountLabel: extractLinkedAccountLabel(readJsonRecord(record.tokenData)),
    };
  } catch (error) {
    await logError('database', error, `getLatestLinkedAccount:${ownerId}:${platform}`);
    return null;
  }
}
