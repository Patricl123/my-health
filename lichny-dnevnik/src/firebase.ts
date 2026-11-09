import { initializeApp } from 'firebase/app';
import { initializeAuth, connectAuthEmulator, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
const v = import.meta.env;
export const configured = !!(v.VITE_FIREBASE_API_KEY && v.VITE_FIREBASE_PROJECT_ID && v.VITE_FIREBASE_APP_ID && v.VITE_OWNER_UID);
export const ownerUid = v.VITE_OWNER_UID || '';
export const projectId = v.VITE_FIREBASE_PROJECT_ID || 'unconfigured';
// Emulator mode is compile-time only, and is never enabled on a hosted origin.
export const emulator = v.MODE === 'emulator' && ['127.0.0.1', 'localhost'].includes(location.hostname);
const app = initializeApp({ apiKey: v.VITE_FIREBASE_API_KEY || 'not-configured', authDomain: v.VITE_FIREBASE_AUTH_DOMAIN, projectId, appId: v.VITE_FIREBASE_APP_ID });
export const auth = initializeAuth(app, { persistence: [browserLocalPersistence, inMemoryPersistence] });
if (emulator) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
export const authReady = auth.authStateReady();
