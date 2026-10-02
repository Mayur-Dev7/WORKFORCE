import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCqNWpfBZlZuwsdhzLvd7dPcSCV3ZfG-fw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'workforce-b553b.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'workforce-b553b',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'workforce-b553b.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '844442367846',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:844442367846:web:485e2e3f601733c4bdfaa7',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-NM4687QELT',
};

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  authInstance = getAuth(app);

  // Configure inMemoryPersistence so Firebase does not persist tokens
  // Our refresh cookie remains the single source of truth
  setPersistence(authInstance, inMemoryPersistence).catch((err) => {
    console.warn('Firebase inMemoryPersistence setup warning:', err);
  });

  return authInstance;
}
