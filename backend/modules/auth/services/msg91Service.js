import axios from "axios";
import dotenv from "dotenv";

// Load environment variables if not already loaded
dotenv.config();

/**
 * MSG91 SMS & OTP Service for Abhikaro
 * Sends transactional OTPs using MSG91 Flow API
 */
class MSG91Service {
  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY || "449403AyhxOv1C6a1fe01aP1";
    this.templateId = process.env.MSG91_TEMPLATE_ID || "68874806d6fc056ef1351842";
    this.flowUrl = "https://control.msg91.com/api/v5/flow";
    this.initializeCredentials();
  }

  /**
   * Load credentials dynamically from database / envService
   */
  async initializeCredentials() {
    try {
      const { getMSG91Credentials } = await import("../../../shared/utils/envService.js");
      const creds = await getMSG91Credentials();
      if (creds?.authKey) {
        this.authKey = creds.authKey.trim();
      }
      if (creds?.templateId) {
        this.templateId = creds.templateId.trim();
      }
    } catch (error) {
      // Fallback to process.env
      this.authKey = process.env.MSG91_AUTH_KEY?.trim() || this.authKey;
      this.templateId = process.env.MSG91_TEMPLATE_ID?.trim() || this.templateId;
    }
  }

  /**
   * Check if MSG91 is properly configured
   * @returns {Promise<boolean>}
   */
  async isConfigured() {
    await this.initializeCredentials();
    return !!(this.authKey && this.templateId);
  }

  /**
   * Normalize phone number to Indian format with country code
   * @param {string} phone - Phone number to normalize
   * @returns {string} - Normalized phone number with country code (91XXXXXXXXXX)
   */
  normalizePhoneNumber(phone) {
    if (!phone) return "";
    // Remove all non-digit characters
    const digits = phone.replace(/[^0-9]/g, "");

    // If it already has country code 91 and is 12 digits, return as is
    if (digits.startsWith("91") && digits.length === 12) {
      return digits;
    }

    // If it's 10 digits, add country code 91
    if (digits.length === 10) {
      return "91" + digits;
    }

    // If it's 11 digits and starts with 0, remove the 0 and add country code
    if (digits.length === 11 && digits.startsWith("0")) {
      return "91" + digits.substring(1);
    }

    // Return with country code as fallback for last 10 digits
    return "91" + digits.slice(-10);
  }

  /**
   * Send OTP via MSG91 Flow API
   * Template: ##VAR1## is your One-Time Password for login Abhikaro. Please do not share with anyone. www.abhikaro.in
   *
   * @param {string} phone - Mobile number
   * @param {string} otp - OTP code to send
   * @param {string} purpose - Purpose of OTP (login, register, etc.)
   * @returns {Promise<Object>}
   */
  async sendOTP(phone, otp, purpose = "login") {
    try {
      await this.initializeCredentials();

      const authKey = this.authKey;
      const templateId = this.templateId;

      if (!authKey || !templateId) {
        console.error("❌ MSG91 Configuration Error:");
        console.error("   MSG91_AUTH_KEY:", authKey ? "✓ Set" : "✗ Missing");
        console.error("   MSG91_TEMPLATE_ID:", templateId ? "✓ Set" : "✗ Missing");
        throw new Error("MSG91 service not configured. Please check MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.");
      }

      const normalizedPhone = this.normalizePhoneNumber(phone);

      // Validate phone number (should be 12 digits with 91 prefix)
      if (normalizedPhone.length !== 12 || !normalizedPhone.startsWith("91")) {
        throw new Error(`Invalid phone number format: ${phone}. Expected 10-digit Indian mobile number.`);
      }

      const payload = {
        template_id: templateId,
        short_url: "0",
        recipients: [
          {
            mobiles: normalizedPhone,
            VAR1: String(otp),
          },
        ],
      };

      console.log(`📱 Sending OTP via MSG91 to ${normalizedPhone} (purpose: ${purpose})...`);

      const response = await axios.post(this.flowUrl, payload, {
        headers: {
          authkey: authKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        timeout: 15000,
      });

      console.log("📱 MSG91 Response Status:", response.status);
      console.log("📱 MSG91 Response Data:", response.data);

      const responseData = response.data;

      // MSG91 returns { type: 'success', message: 'request_id' }
      if (responseData && (responseData.type === "success" || response.status === 200)) {
        console.log(`✅ OTP sent successfully via MSG91 to ${normalizedPhone}`);
        return {
          success: true,
          messageId: responseData.message || `msg91_${Date.now()}`,
          status: "sent",
          to: normalizedPhone,
          provider: "MSG91",
          response: responseData,
        };
      }

      // If response indicated failure
      if (responseData && responseData.type === "error") {
        throw new Error(`MSG91 API error: ${responseData.message || "Unknown error"}`);
      }

      return {
        success: true,
        messageId: `msg91_${Date.now()}`,
        status: "sent",
        to: normalizedPhone,
        provider: "MSG91",
        response: responseData,
      };
    } catch (error) {
      const errorMsg = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

      console.error(`❌ MSG91 OTP delivery failed to ${phone}:`, errorMsg);

      if (error.response?.status === 401) {
        throw new Error("MSG91 authentication failed. Please check MSG91_AUTH_KEY.");
      } else if (error.response?.status === 400) {
        throw new Error(`MSG91 invalid request: ${errorMsg}`);
      }

      throw new Error(`Failed to send OTP via MSG91: ${error.message}`);
    }
  }

  /**
   * Test connection and send test OTP
   * @param {string} targetPhone - Mobile number to send test SMS to
   * @returns {Promise<Object>}
   */
  async testConnection(targetPhone = "7610416911") {
    try {
      const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const result = await this.sendOTP(targetPhone, testOtp, "test_connection");
      return {
        success: true,
        message: "MSG91 connection successful and test OTP dispatched",
        testOtp,
        result,
      };
    } catch (error) {
      return {
        success: false,
        message: `MSG91 connection test failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}

// Singleton instance
const msg91Service = new MSG91Service();

export default msg91Service;
