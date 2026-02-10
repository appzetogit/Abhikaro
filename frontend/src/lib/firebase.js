import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase configuration - will be populated from backend
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

// Fetch config from backend
const fetchFirebaseConfig = async () => {
  try {
    const { adminAPI } = await import("./api/index.js");
    const response = await adminAPI.getPublicEnvVariables();

    if (response.data.success && response.data.data) {
      const config = response.data.data;
      // Only override if backend provides values
      if (config.FIREBASE_API_KEY)
        firebaseConfig.apiKey = config.FIREBASE_API_KEY;
      if (config.FIREBASE_AUTH_DOMAIN)
        firebaseConfig.authDomain = config.FIREBASE_AUTH_DOMAIN;
      if (config.FIREBASE_PROJECT_ID)
        firebaseConfig.projectId = config.FIREBASE_PROJECT_ID;
      if (config.FIREBASE_STORAGE_BUCKET)
        firebaseConfig.storageBucket = config.FIREBASE_STORAGE_BUCKET;
      if (config.FIREBASE_MESSAGING_SENDER_ID)
        firebaseConfig.messagingSenderId = config.FIREBASE_MESSAGING_SENDER_ID;
      if (config.FIREBASE_APP_ID) firebaseConfig.appId = config.FIREBASE_APP_ID;
      if (config.MEASUREMENT_ID)
        firebaseConfig.measurementId = config.MEASUREMENT_ID;

      console.log("✅ Firebase config loaded from database");
      return true;
    }
    return false;
  } catch (e) {
    console.warn(
      "⚠️ Failed to fetch firebase config from backend, using defaults/env",
      e,
    );
    return false;
  }
};

// Initialize Firebase app only once
let app;
let firebaseAuth;
let googleProvider;

// Function to ensure Firebase is initialized
async function ensureFirebaseInitialized() {
  await fetchFirebaseConfig(); // Try to load from backend first

  // Validate Firebase configuration
  const requiredFields = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
    "messagingSenderId",
  ];
  const missingFields = requiredFields.filter(
    (field) => !firebaseConfig[field] || firebaseConfig[field] === "undefined",
  );

  if (missingFields.length > 0) {
    console.warn(
      "⚠️ Firebase configuration is missing required fields:",
      missingFields,
    );
    console.warn(
      "💡 Authentication features may not work until configured in Admin Panel.",
    );
    return;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);
      console.log(
        "🚀 Firebase initialized successfully with config from database",
      );
    } else {
      app = existingApps[0];
    }

    // Initialize Auth
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
    }

    // Initialize Google Provider
    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      googleProvider.addScope("email");
      googleProvider.addScope("profile");
    }
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
  }
}

// Initialize immediately (async but we don't await at module level)
ensureFirebaseInitialized();

export const firebaseApp = app;
export { firebaseAuth, googleProvider, ensureFirebaseInitialized };
