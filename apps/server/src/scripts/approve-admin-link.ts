#!/usr/bin/env node
import 'dotenv/config';
import { pool } from '../lib/db.js';

async function main() {
  const emailArg = process.argv[2];
  if (!emailArg) {
    console.error('Usage: npm run auth:approve-link -- <email>');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  console.log(`Approving Firebase linking for: ${email}`);

  const userRes = await pool.query(
    `SELECT u.id, u.email, u.name, r.name as role_name, u.firebase_uid, u.approved_for_firebase_link
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE LOWER(TRIM(u.email)) = $1`,
    [email]
  );

  if (userRes.rowCount === 0) {
    console.error(`❌ User not found with email: ${email}`);
    process.exit(1);
  }

  const user = userRes.rows[0];
  if (user.firebase_uid) {
    console.log(`ℹ️ User is already linked with Firebase UID: ${user.firebase_uid}`);
    process.exit(0);
  }

  await pool.query(
    `UPDATE users
     SET approved_for_firebase_link = TRUE,
         updated_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  console.log(`✅ Approved! User ${user.name} (${user.role_name || 'No Role'}) can now link via Google Sign-In.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error approving user:', err);
  process.exit(1);
});
