/**
 * Single place to load Firebase Admin credentials.
 *
 * Priority:
 * 1) FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS → path to downloaded JSON (recommended: one download, gitignore the file)
 * 2) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY via getFirebaseCredentials() / .env
 *
 * You do NOT need to rotate or re-download the JSON unless that key is revoked or leaked.
 *
 * Important: In Node ESM, use `import "dotenv/config"` as the first line of server.js so PATH is set
 * before Firebase modules load. Otherwise .env inline keys may be cached first and JSON is never read.
 */
import admin from "firebase-admin";
import { createPrivateKey } from "crypto";
import fs from "fs";
import path from "path";
import { getFirebaseCredentials } from "./envService.js";

let cachedServiceAccount = null;

function readServiceAccountJsonFile(resolvedPath) {
  let raw = fs.readFileSync(resolvedPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  const json = JSON.parse(raw);
  const pk = json.private_key;
  if (!pk || typeof pk !== "string") {
    throw new Error("Service account JSON missing private_key");
  }
  try {
    createPrivateKey({ key: pk, format: "pem" });
  } catch (e) {
    throw new Error(
      `Service account private_key is not valid PEM (${e.message}). Re-download JSON from Firebase.`,
    );
  }
  return json;
}

/**
 * @returns {Promise<object>} Service account object for admin.credential.cert()
 */
async function loadServiceAccountObject() {
  if (cachedServiceAccount) {
    return cachedServiceAccount;
  }

  const explicitPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (explicitPath) {
    const resolved = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(process.cwd(), explicitPath);
    if (fs.existsSync(resolved)) {
      try {
        cachedServiceAccount = readServiceAccountJsonFile(resolved);
        console.log(
          "✅ Firebase Admin: service account from file",
          path.basename(resolved),
        );
        return cachedServiceAccount;
      } catch (e) {
        console.error("❌ Firebase Admin: invalid service account file:", e.message);
        return null;
      }
    }
    console.error(
      "❌ Firebase Admin: FIREBASE_SERVICE_ACCOUNT_PATH file not found:",
      resolved,
      "(fix path in .env — will NOT fall back to FIREBASE_PRIVATE_KEY to avoid wrong credentials)",
    );
    return null;
  }

  const creds = await getFirebaseCredentials();
  let privateKey = creds.privateKey;
  if (privateKey && String(privateKey).includes("\\n")) {
    privateKey = String(privateKey).replace(/\\n/g, "\n");
  }

  if (!creds.projectId || !privateKey || !creds.clientEmail) {
    return null;
  }

  cachedServiceAccount = {
    projectId: creds.projectId,
    privateKey,
    clientEmail: creds.clientEmail,
  };
  return cachedServiceAccount;
}

function hasDefaultApp() {
  try {
    admin.app();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the default Firebase Admin app exists (used by FCM: admin.messaging()).
 */
export async function ensureFirebaseAdminApp() {
  if (hasDefaultApp()) {
    return true;
  }

  try {
    const sa = await loadServiceAccountObject();
    if (!sa) {
      console.warn(
        "⚠️ Firebase Admin: set FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-adminsdk.json (recommended) or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env",
      );
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(sa),
    });
    console.log("✅ Firebase Admin: default app initialized");
    return true;
  } catch (err) {
    if (err?.code === "app/duplicate-app") {
      return true;
    }
    console.error("❌ Firebase Admin default app init error:", err.message);
    return false;
  }
}

/**
 * Ensures named app for Realtime Database (needs databaseURL).
 */
export async function ensureFirebaseRealtimeApp() {
  const sa = await loadServiceAccountObject();
  if (!sa) {
    return false;
  }

  await ensureFirebaseAdminApp();

  try {
    admin.app("realtimeDbApp");
    return true;
  } catch {
    const projectId =
      sa.project_id || sa.projectId || process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.warn("⚠️ Firebase Realtime: could not resolve project ID");
      return false;
    }

    const databaseURL =
      process.env.FIREBASE_DATABASE_URL ||
      `https://${projectId}-default-rtdb.firebaseio.com`;

    try {
      admin.initializeApp(
        {
          credential: admin.credential.cert(sa),
          databaseURL,
        },
        "realtimeDbApp",
      );
      console.log("✅ Firebase Admin: realtimeDbApp initialized");
      return true;
    } catch (e) {
      if (e?.code === "app/duplicate-app") {
        return true;
      }
      console.error("❌ Firebase realtime app init error:", e.message);
      return false;
    }
  }
}

export function clearFirebaseAdminCache() {
  cachedServiceAccount = null;
}
