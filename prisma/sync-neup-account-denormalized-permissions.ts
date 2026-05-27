import 'dotenv/config';
import { Pool } from 'pg';

const APP_ID = 'neup.account';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('BEGIN');

    // 1) Rebuild authz_role.permissions from legacy role-capability mapping if it still exists.
    await pool.query(
      `
      DO $$
      BEGIN
        IF to_regclass('public.authz_role_capability') IS NOT NULL THEN
          WITH role_permissions AS (
            SELECT
              arc.role_id,
              jsonb_agg(DISTINCT cap.name ORDER BY cap.name) AS permissions
            FROM authz_role_capability arc
            JOIN authz_capability cap ON cap.id = arc.capability_id
            WHERE COALESCE(arc.app_id, cap.app_id) = 'neup.account'
            GROUP BY arc.role_id
          )
          UPDATE authz_role r
          SET permissions = rp.permissions
          FROM role_permissions rp
          WHERE r.id = rp.role_id
            AND r.app_id = 'neup.account';
        END IF;
      END
      $$;
      `
    );

    // 2) Ensure every role in neup.account has permissions set (at least empty array).
    await pool.query(
      `
      UPDATE authz_role
      SET permissions = '[]'::jsonb
      WHERE app_id = $1
        AND permissions IS NULL;
      `,
      [APP_ID],
    );

    // 3) Normalize existing permissions arrays (string-only, distinct, sorted).
    await pool.query(
      `
      UPDATE authz_role r
      SET permissions = COALESCE(
        (
          SELECT jsonb_agg(value ORDER BY value)
          FROM (
            SELECT DISTINCT elem AS value
            FROM jsonb_array_elements_text(COALESCE(r.permissions, '[]'::jsonb)) AS elem
          ) dedup
        ),
        '[]'::jsonb
      )
      WHERE r.app_id = $1;
      `,
      [APP_ID],
    );

    // 4) If legacy denormalized column still exists, sync it from authz_role.permissions.
    await pool.query(
      `
      DO $$
      BEGIN
        IF to_regclass('public.authz_role_capability') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'authz_role_capability'
              AND column_name = 'denormalized_capability'
          ) THEN
            UPDATE authz_role_capability arc
            SET denormalized_capability = COALESCE(r.permissions, '[]'::jsonb)
            FROM authz_role r
            WHERE r.id = arc.role_id
              AND r.app_id = 'neup.account'
              AND arc.app_id = 'neup.account';
          END IF;
        END IF;
      END
      $$;
      `
    );

    const roleStats = await pool.query(
      `
      SELECT id, name, jsonb_array_length(COALESCE(permissions, '[]'::jsonb)) AS permission_count
      FROM authz_role
      WHERE app_id = $1
      ORDER BY name ASC;
      `,
      [APP_ID],
    );

    await pool.query('COMMIT');

    console.log(`Synced denormalized permissions for app: ${APP_ID}`);
    console.table(roleStats.rows);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('sync-neup-account-denormalized-permissions failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
