import admin from 'firebase-admin';
import { getDatabase } from 'firebase-admin/database';
import { getFirebaseCredentials } from '../shared/utils/envService.js';

let db = null;
let initialized = false;

/**
 * Initialize Firebase Realtime Database
 * Uses the same Firebase Admin SDK credentials as FCM
 */
export async function initializeFirebaseRealtime() {
  if (initialized && db) {
    return db;
  }

  try {
    // Check if Firebase Admin is already initialized (from FCM)
    if (admin.apps.length === 0) {
      let credentials;
      
      // Try to get credentials from process.env first (faster, no DB query)
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        console.log('📦 Using Firebase credentials from .env file');
        credentials = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY
        };
      } else {
        // Fallback to database (slower, requires DB connection)
        console.log('📦 Fetching Firebase credentials from database...');
        credentials = await getFirebaseCredentials();
      }
      
      if (!credentials.projectId || !credentials.privateKey || !credentials.clientEmail) {
        console.warn('⚠️ Firebase Realtime Database not initialized: Missing credentials');
        console.warn('💡 Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env or Admin Panel');
        return null;
      }

      // Get database URL from env or construct from project ID
      const databaseURL = process.env.FIREBASE_DATABASE_URL || 
                         `https://${credentials.projectId}-default-rtdb.firebaseio.com`;

      // Initialize Firebase Admin SDK with unique app name to avoid conflicts
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: credentials.projectId,
          privateKey: credentials.privateKey.replace(/\\n/g, '\n'),
          clientEmail: credentials.clientEmail,
        }),
        databaseURL: databaseURL
      }, 'realtimeDbApp'); // Unique app name

      console.log('✅ Firebase Admin SDK initialized for Realtime Database');
    }

    // Get Realtime Database instance
    db = getDatabase(admin.app('realtimeDbApp'));
    initialized = true;
    console.log('✅ Firebase Realtime Database initialized successfully');
    
    return db;
  } catch (error) {
    console.error('❌ Error initializing Firebase Realtime Database:', error);
    console.error('💡 Make sure Firebase credentials are correct in .env or Admin Panel');
    return null;
  }
}

/**
 * Get Firebase Realtime Database instance
 */
export function getFirebaseRealtimeDB() {
  if (!initialized || !db) {
    console.warn('⚠️ Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first.');
    return null;
  }
  return db;
}

// Don't initialize on module load - wait for server.js to call it after DB connection
// This ensures credentials from database are available
