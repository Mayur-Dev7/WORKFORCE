import crypto from 'crypto';
import { PoolClient } from 'pg';
import { getFirebaseAuth } from './firebase.admin.js';
import {
  IdentityProvisioner,
  ProvisionedUser,
  ProvisionResult,
  getAuthProviderMode,
} from './types.js';
import { usersRepository } from '../../repositories/users.repository.js';

export class NoopIdentityProvisioner implements IdentityProvisioner {
  async onUserCreated(): Promise<ProvisionResult> {
    return {};
  }
  async onUserDisabled(): Promise<void> {}
  async onUserEnabled(): Promise<void> {}
  async onEmailChanged(): Promise<void> {}
  async onUserDeleted(): Promise<void> {}
}

export class FirebaseIdentityProvisioner implements IdentityProvisioner {
  async onUserCreated(user: ProvisionedUser, dbClient?: PoolClient): Promise<ProvisionResult> {
    const auth = getFirebaseAuth();
    const clientUrl = process.env.CLIENT_URL || 'https://workforce.duckdns.org';
    const emailLower = user.email.trim().toLowerCase();
    const tempPassword = crypto.randomBytes(32).toString('hex');

    // 1. Create user in Firebase Auth with UID identical to our PostgreSQL UUID
    await auth.createUser({
      uid: user.id,
      email: emailLower,
      displayName: user.name,
      password: tempPassword,
    });

    try {
      // 2. Link user in database (under transaction if dbClient provided)
      await usersRepository.update(
        user.id,
        {
          firebase_uid: user.id,
          auth_provider: 'firebase',
          firebase_linked_at: new Date(),
        },
        dbClient
      );

      // 3. Generate initial set-password / password reset link
      let passwordResetLink: string | undefined;
      try {
        passwordResetLink = await auth.generatePasswordResetLink(emailLower, {
          url: clientUrl,
        });
      } catch (linkErr) {
        console.warn(`[Firebase] Could not generate password reset link for ${emailLower}:`, linkErr);
      }

      return {
        firebaseUid: user.id,
        passwordResetLink,
      };
    } catch (dbErr) {
      // Rollback Firebase user creation if database update fails
      try {
        await auth.deleteUser(user.id);
      } catch (cleanupErr) {
        console.error(`[Firebase] Failed to clean up user ${user.id} after DB error:`, cleanupErr);
      }
      throw dbErr;
    }
  }

  async onUserDisabled(userId: string, firebaseUid?: string | null): Promise<void> {
    const uid = firebaseUid || userId;
    const auth = getFirebaseAuth();
    try {
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') return;
      console.error(`[Firebase] Failed to disable user ${uid}:`, err);
      throw err;
    }
  }

  async onUserEnabled(userId: string, firebaseUid?: string | null): Promise<void> {
    const uid = firebaseUid || userId;
    const auth = getFirebaseAuth();
    try {
      await auth.updateUser(uid, { disabled: false });
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') return;
      console.error(`[Firebase] Failed to enable user ${uid}:`, err);
      throw err;
    }
  }

  async onEmailChanged(userId: string, newEmail: string, firebaseUid?: string | null): Promise<void> {
    const uid = firebaseUid || userId;
    const auth = getFirebaseAuth();
    try {
      await auth.updateUser(uid, { email: newEmail.trim().toLowerCase() });
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') return;
      console.error(`[Firebase] Failed to update email for user ${uid}:`, err);
      throw err;
    }
  }

  async onUserDeleted(userId: string, firebaseUid?: string | null): Promise<void> {
    const uid = firebaseUid || userId;
    const auth = getFirebaseAuth();
    try {
      await auth.deleteUser(uid);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') return;
      console.error(`[Firebase] Failed to delete user ${uid}:`, err);
      throw err;
    }
  }
}

let activeProvisioner: IdentityProvisioner | null = null;

export function getIdentityProvisioner(): IdentityProvisioner {
  if (activeProvisioner) {
    return activeProvisioner;
  }

  const mode = getAuthProviderMode();
  if (mode === 'legacy') {
    activeProvisioner = new NoopIdentityProvisioner();
  } else {
    activeProvisioner = new FirebaseIdentityProvisioner();
  }
  return activeProvisioner;
}

export function setCustomIdentityProvisioner(provisioner: IdentityProvisioner | null): void {
  activeProvisioner = provisioner;
}
