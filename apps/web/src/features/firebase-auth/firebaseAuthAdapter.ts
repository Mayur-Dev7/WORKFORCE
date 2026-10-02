import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { api } from '../../services/api.js';
import { getFirebaseAuth } from './firebaseClient.js';
import { ApiResponse, User } from '@workforce/shared';

export function mapFirebaseAuthError(err: any): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Invalid credentials';
    case 'auth/too-many-requests':
      return 'Too many attempts, try later';
    case 'auth/user-disabled':
      return 'Account has been deactivated. Contact HR or administrator.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet and try again.';
    default:
      return err?.response?.data?.error?.message || err?.message || 'Login failed';
  }
}

export async function resolveIdentifierToEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  try {
    const res = await api.post<ApiResponse<{ email: string }>>('/auth/firebase/resolve-identifier', {
      identifier: trimmed,
    });
    return res.data.data.email;
  } catch (err: any) {
    try {
      const fallbackRes = await api.post<ApiResponse<{ email: string }>>('/auth/resolve-identifier', {
        identifier: trimmed,
      });
      return fallbackRes.data.data.email;
    } catch {
      throw new Error('No account found with this employee code or identifier');
    }
  }
}

export async function firebaseLogin(
  identifier: string,
  password: string,
  _coords?: { lat: number; lon: number }
): Promise<{ accessToken: string; user: User }> {
  const auth = getFirebaseAuth();

  // 1. If identifier has no '@', resolve employee code to email
  const email = await resolveIdentifierToEmail(identifier);

  // 2. Sign in with Firebase using email and password
  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    const friendlyMessage = mapFirebaseAuthError(err);
    const friendlyErr = new Error(friendlyMessage);
    (friendlyErr as any).code = err.code;
    throw friendlyErr;
  }

  try {
    // 3. Obtain Firebase ID token
    const idToken = await userCredential.user.getIdToken(true);

    // 4. Exchange Firebase ID token with our backend session endpoint
    const res = await api.post<ApiResponse<{ accessToken: string; user: User }>>(
      '/auth/firebase/session',
      { idToken }
    );

    return res.data.data;
  } finally {
    // 5. Sign out of Firebase client immediately so refresh cookie remains the single source of truth
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }
}
