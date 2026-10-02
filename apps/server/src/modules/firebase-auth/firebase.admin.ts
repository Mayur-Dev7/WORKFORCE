import { initializeApp, cert, applicationDefault, getApps, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getAuthProviderMode } from './types.js';

let appInstance: App | null = null;
let mockAuthInstance: Auth | null = null;

/**
 * Set a mock Firebase Auth instance for testing.
 */
export function setMockFirebaseAuth(mock: Auth | null): void {
  mockAuthInstance = mock;
}

/**
 * Validates and returns the initialized Firebase Admin Auth instance.
 * Fails fast if AUTH_PROVIDER is not legacy and credentials are invalid or missing.
 */
export function getFirebaseAuth(): Auth {
  if (mockAuthInstance) {
    return mockAuthInstance;
  }

  if (appInstance) {
    return getAuth(appInstance);
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = existingApps[0]!;
    return getAuth(appInstance);
  }

  const mode = getAuthProviderMode();
  const b64Credentials = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

  if (!b64Credentials && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (mode !== 'legacy') {
      const msg = `FATAL: AUTH_PROVIDER is set to '${mode}', but FIREBASE_SERVICE_ACCOUNT_B64 is missing.`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  try {
    if (b64Credentials) {
      const decodedJson = Buffer.from(b64Credentials, 'base64').toString('utf8');
      const serviceAccount = JSON.parse(decodedJson);
      appInstance = initializeApp({
        credential: cert(serviceAccount),
        projectId: projectId || serviceAccount.project_id,
      });
      return getAuth(appInstance);
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      appInstance = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      return getAuth(appInstance);
    }

    // Default init if project ID provided
    appInstance = initializeApp({
      projectId: projectId || 'workforce-b553b',
    });
    return getAuth(appInstance);
  } catch (err: any) {
    if (mode !== 'legacy') {
      const msg = `FATAL: Failed to initialize Firebase Admin SDK in '${mode}' mode: ${err.message}`;
      console.error(msg);
      throw new Error(msg);
    }
    throw err;
  }
}

/**
 * Startup assertion for non-legacy modes.
 */
export function assertFirebaseAdminConfigured(): void {
  const mode = getAuthProviderMode();
  if (mode === 'legacy') return;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  if (!b64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !mockAuthInstance) {
    throw new Error(
      `FATAL: AUTH_PROVIDER is configured as '${mode}', but FIREBASE_SERVICE_ACCOUNT_B64 environment variable is not set.`
    );
  }
}
