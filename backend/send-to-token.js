/**
 * One-off FCM test: node send-to-token.js "<FCM_REGISTRATION_TOKEN>"
 * Uses FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_* in .env
 */
import "dotenv/config";

import { sendNotification } from "./modules/fcm/services/fcmService.js";

const token = (process.argv[2] || "").trim();
if (!token) {
  console.error("Usage: node send-to-token.js \"<FCM_REGISTRATION_TOKEN>\"");
  process.exit(1);
}

async function main() {
  console.log("🚀 Sending test push to token:", token.slice(0, 24) + "…");
  const result = await sendNotification(
    token,
    {
      title: "Abhikaro — test push",
      body: "Agar yeh dikh raha hai, FCM delivery theek hai.",
    },
    { type: "script_test", tag: `test_${Date.now()}` },
  );
  console.log("📊 Result:", JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
