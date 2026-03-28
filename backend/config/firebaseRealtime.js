import admin from 'firebase-admin';
import { getDatabase } from 'firebase-admin/database';
import { ensureFirebaseRealtimeApp } from '../shared/utils/firebaseAdminInit.js';

let db = null;
let initialized = false;

/**
 * Initialize Firebase Realtime Database (same credentials as FCM — JSON file or .env)
 */
export async function initializeFirebaseRealtime() {
  if (initialized && db) {
    return db;
  }

  try {
    const ok = await ensureFirebaseRealtimeApp();
    if (!ok) {
      console.warn('⚠️ Firebase Realtime Database not initialized: missing credentials');
      console.warn(
        '💡 Set FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-adminsdk.json or FIREBASE_* in .env',
      );
      return null;
    }

    db = getDatabase(admin.app('realtimeDbApp'));
    initialized = true;
    console.log('✅ Firebase Realtime Database initialized successfully');

    return db;
  } catch (error) {
    console.error('❌ Error initializing Firebase Realtime Database:', error);
    return null;
  }
}

/**
 * Get Firebase Realtime Database instance
 */
export function getFirebaseRealtimeDB() {
  if (!initialized || !db) {
    console.warn(
      '⚠️ Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first.',
    );
    return null;
  }
  return db;
}
