import { PermissionKey, RoleName, User } from '@workforce/shared';
import { PoolClient } from 'pg';

export type AuthProviderMode = 'legacy' | 'dual' | 'firebase';

export function getAuthProviderMode(): AuthProviderMode {
  const mode = (process.env.AUTH_PROVIDER || 'legacy').toLowerCase().trim();
  if (mode === 'dual' || mode === 'firebase') {
    return mode;
  }
  return 'legacy';
}

export interface ProvisionedUser {
  id: string;
  email: string;
  name: string;
  employee_code: string;
}

export interface ProvisionResult {
  passwordResetLink?: string;
  firebaseUid?: string;
}

export interface IdentityProvisioner {
  onUserCreated(user: ProvisionedUser, dbClient?: PoolClient): Promise<ProvisionResult>;
  onUserDisabled(userId: string, firebaseUid?: string | null): Promise<void>;
  onUserEnabled(userId: string, firebaseUid?: string | null): Promise<void>;
  onEmailChanged(userId: string, newEmail: string, firebaseUid?: string | null): Promise<void>;
  onUserDeleted(userId: string, firebaseUid?: string | null): Promise<void>;
}
