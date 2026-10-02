/**
 * One-off User Migration Script: Legacy DB -> Firebase Auth
 *
 * Usage:
 *   node apps/server/dist/scripts/firebase-migrate-users.js [flags]
 *
 * Flags:
 *   --dry-run      Simulate migration without modifying Firebase or Postgres (DEFAULT)
 *   --apply        Execute migration: import users to Firebase and link in Postgres
 *   --limit N      Process at most N users
 *   --activate     Switch linked users' auth_provider to 'firebase'
 *   --rollback     Switch auth_provider back to 'legacy' (keeps Firebase users intact)
 */

import { getFirebaseAuth } from '../modules/firebase-auth/firebase.admin.js';
import { pool } from '../lib/db.js';
import { UserImportRecord } from 'firebase-admin/auth';

export const SEEDED_DEMO_EMPLOYEE_CODES = [
  'EMP-001',
  'EMP-002',
  'EMP-003',
  'EMP-101',
  'EMP-102',
  'EMP-103',
];

export const SEEDED_DEMO_EMAILS = [
  'superadmin@workforce.com',
  'hr@workforce.com',
  'manager@workforce.com',
  'alex@workforce.com',
  'jessica@workforce.com',
  'david@workforce.com',
];

interface CliOptions {
  dryRun: boolean;
  apply: boolean;
  limit?: number;
  activate: boolean;
  rollback: boolean;
}

function parseArgs(args: string[]): CliOptions {
  let isDryRun = true;
  let isApply = false;
  let isActivate = false;
  let isRollback = false;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      isApply = true;
      isDryRun = false;
    } else if (arg === '--dry-run') {
      isDryRun = true;
      isApply = false;
    } else if (arg === '--activate') {
      isActivate = true;
    } else if (arg === '--rollback') {
      isRollback = true;
    } else if (arg === '--limit' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
      i++;
    }
  }

  return {
    dryRun: !isApply && !isActivate && !isRollback ? true : isDryRun,
    apply: isApply,
    limit,
    activate: isActivate,
    rollback: isRollback,
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  console.log('='.repeat(60));
  console.log(' Workforce Access — Firebase User Migration Script');
  console.log('='.repeat(60));
  console.log(` Mode: ${options.dryRun ? 'DRY-RUN (no changes will be written)' : 'LIVE EXECUTION'}`);
  if (options.limit) console.log(` Limit: ${options.limit} users`);
  if (options.activate) console.log(' Action: ACTIVATE (auth_provider -> firebase)');
  if (options.rollback) console.log(' Action: ROLLBACK (auth_provider -> legacy)');
  console.log('-'.repeat(60));

  try {
    // ── 1. Rollback Action ───────────────────────────────────────────────────
    if (options.rollback) {
      const countRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM users WHERE auth_provider = 'firebase'`
      );
      const count = parseInt(countRes.rows[0].count, 10);

      console.log(`Found ${count} user(s) currently set to auth_provider = 'firebase'.`);
      if (options.dryRun) {
        console.log(`[DRY-RUN] Would update ${count} user(s) to auth_provider = 'legacy'.`);
      } else {
        const updateRes = await pool.query(
          `UPDATE users SET auth_provider = 'legacy' WHERE auth_provider = 'firebase'`
        );
        console.log(`Successfully reverted ${updateRes.rowCount} user(s) to auth_provider = 'legacy'.`);
      }
      return;
    }

    // ── 2. Activate Action ───────────────────────────────────────────────────
    if (options.activate) {
      const countRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM users WHERE firebase_uid IS NOT NULL AND auth_provider = 'legacy'`
      );
      const count = parseInt(countRes.rows[0].count, 10);

      console.log(`Found ${count} linked user(s) ready to activate.`);
      if (options.dryRun) {
        console.log(`[DRY-RUN] Would activate ${count} user(s) to auth_provider = 'firebase'.`);
      } else {
        const updateRes = await pool.query(
          `UPDATE users SET auth_provider = 'firebase' WHERE firebase_uid IS NOT NULL AND auth_provider = 'legacy'`
        );
        console.log(`Successfully activated ${updateRes.rowCount} user(s) to auth_provider = 'firebase'.`);
      }
      return;
    }

    // ── 3. User Migration ────────────────────────────────────────────────────
    console.log('Scanning database for unmigrated users (excluding seeded demo accounts)...');
    console.log(`Excluded demo accounts: ${SEEDED_DEMO_EMPLOYEE_CODES.join(', ')}`);

    let query = `
      SELECT id, email, name, employee_code, password_hash, is_active
      FROM users
      WHERE firebase_uid IS NULL
        AND password_hash IS NOT NULL
        AND employee_code != ALL($1::text[])
        AND email != ALL($2::text[])
      ORDER BY created_at ASC
    `;
    const params: unknown[] = [SEEDED_DEMO_EMPLOYEE_CODES, SEEDED_DEMO_EMAILS];

    if (options.limit) {
      query += ` LIMIT $3`;
      params.push(options.limit);
    }

    const { rows } = await pool.query(query, params);
    console.log(`Found ${rows.length} unmigrated user record(s).`);

    if (rows.length === 0) {
      console.log('No users require migration.');
      return;
    }

    if (options.dryRun) {
      console.log('\n--- DRY-RUN SUMMARY ---');
      console.log(`Total users that would be imported to Firebase: ${rows.length}`);
      console.log(`Total users that would be linked in PostgreSQL: ${rows.length}`);
      console.log('To apply these changes, rerun with --apply');
      return;
    }

    // Live migration with Firebase Admin SDK
    const auth = getFirebaseAuth();
    const batchSize = 1000;
    let totalImported = 0;
    let totalFailed = 0;
    let totalDbUpdated = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const userRecords: UserImportRecord[] = slice.map((u) => ({
        uid: u.id,
        email: u.email.trim().toLowerCase(),
        displayName: u.name,
        passwordHash: Buffer.from(u.password_hash),
        disabled: !u.is_active,
        emailVerified: true,
      }));


      console.log(`Importing batch ${Math.floor(i / batchSize) + 1} (${userRecords.length} users)...`);

      const result = await auth.importUsers(userRecords, {
        hash: {
          algorithm: 'BCRYPT',
        },
      });

      const failedIndices = new Set<number>();
      if (result.errors && result.errors.length > 0) {
        for (const err of result.errors) {
          failedIndices.add(err.index);
          console.error(`  - Failed to import user at index ${err.index}: ${err.error.message}`);
          totalFailed++;
        }
      }

      // Link successfully imported records in DB
      for (let j = 0; j < slice.length; j++) {
        if (!failedIndices.has(j)) {
          const user = slice[j];
          await pool.query(
            `UPDATE users
             SET firebase_uid = $1,
                 firebase_linked_at = NOW()
             WHERE id = $1`,
            [user.id]
          );
          totalDbUpdated++;
          totalImported++;
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(' Migration Execution Completed');
    console.log('='.repeat(60));
    console.log(` Total processed:               ${rows.length}`);
    console.log(` Successfully imported:         ${totalImported}`);
    console.log(` Failed imports:                ${totalFailed}`);
    console.log(` PostgreSQL records linked:     ${totalDbUpdated}`);
    console.log('='.repeat(60));
  } catch (err: any) {
    console.error('Migration failed with error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// Execute when invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error('Unhandled script error:', err);
    process.exit(1);
  });
}
