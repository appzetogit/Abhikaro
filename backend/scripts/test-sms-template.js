import dotenv from "dotenv";
import smsIndiaHubService from "../modules/auth/services/smsIndiaHubService.js";

dotenv.config();

async function runTest() {
  console.log("=== Testing SMSHub DLT Template Setup ===");
  
  const apiKey = process.env.SMSINDIAHUB_API_KEY;
  const senderId = process.env.SMSINDIAHUB_SENDER_ID || "BGADEC";
  const peId = process.env.SMSINDIAHUB_PE_ID || "1001164203633432409";
  const templateId = process.env.SMSINDIAHUB_TEMPLATE_ID || "1007282516644508833";
  const messageTemplate = process.env.SMSINDIAHUB_MESSAGE_TEMPLATE || "Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.BGADEC";

  console.log("Loaded Environment Variables:");
  console.log("  APIKey:", apiKey ? "✓ Present (" + apiKey + ")" : "✗ Missing");
  console.log("  SenderID (sid):", senderId);
  console.log("  PE ID (peid):", peId);
  console.log("  Template ID (templateid):", templateId);
  console.log("  Raw Template:", messageTemplate);

  const brandName = "Abhikaro";
  const testOtp = "654321";
  
  const formattedMessage = smsIndiaHubService.formatTemplateMessage(
    messageTemplate,
    brandName,
    testOtp
  );

  console.log("\nFormatted SMS Message:");
  console.log(`"${formattedMessage}"`);

  // Verify parameters
  const expectedMsg = "Welcome to the Abhikaro powered by Appzeto.Your OTP for registration is 654321.BGADEC";
  if (formattedMessage === expectedMsg) {
    console.log("✅ Message text matches DLT template EXACTLY!");
  } else {
    console.log("⚠️ Message text differs!");
    console.log("  Expected:", expectedMsg);
    console.log("  Got:", formattedMessage);
  }

  const phone = "9876543210";
  const normalizedPhone = smsIndiaHubService.normalizePhoneNumber(phone);
  console.log("Normalized Phone Number:", normalizedPhone);
  
  console.log("\n=== Test Completed Successfully ===");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
