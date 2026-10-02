import {
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithCredential,
} from 'firebase/auth';
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
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Console. Please add it to Firebase Console > Authentication > Settings > Authorized domains.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign in was cancelled';
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

/**
 * Signs in using Google OAuth via Firebase popup, optionally linking to an existing
 * email/password account if one exists, then exchanges the token with our backend.
 */
export async function firebaseGoogleLogin(
  onLinkPasswordRequired?: (email: string) => Promise<string>
): Promise<{ accessToken: string; user: User }> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let userCredential;
  try {
    userCredential = await signInWithPopup(auth, provider);
  } catch (err: any) {
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
      const cancelErr = new Error('Google sign-in was cancelled');
      (cancelErr as any).code = 'auth/popup-closed-by-user';
      throw cancelErr;
    }

    // Account linking support when email already exists with password
    if (err?.code === 'auth/account-exists-with-different-credential') {
      const pendingCredential = GoogleAuthProvider.credentialFromError(err);
      const email = err.customData?.email;

      if (onLinkPasswordRequired && email && pendingCredential) {
        const password = await onLinkPasswordRequired(email);
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        await linkWithCredential(userCredential.user, pendingCredential);
      } else {
        const linkErr = new Error(
          `An account with email ${email || ''} already exists. Please log in with your password to link your Google account.`
        );
        (linkErr as any).code = err.code;
        throw linkErr;
      }
    } else {
      const friendlyMessage = mapFirebaseAuthError(err);
      const friendlyErr = new Error(friendlyMessage);
      (friendlyErr as any).code = err.code;
      throw friendlyErr;
    }
  }

  try {
    const idToken = await userCredential.user.getIdToken(true);
    const res = await api.post<ApiResponse<{ accessToken: string; user: User }>>(
      '/auth/firebase/session',
      { idToken }
    );
    return res.data.data;
  } finally {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }
}
