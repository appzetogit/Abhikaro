import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import otpService from "../../auth/services/otpService.js";
import Admin from "../models/Admin.js";

const PURPOSE = "admin-wallet-adjust";

function maskPhone(phone) {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return `******${last4}`;
}

/**
 * Send OTP to current admin phone for wallet adjustment lock.
 * POST /api/admin/security/wallet-adjust/otp/send
 */
export const sendWalletAdjustOTP = asyncHandler(async (req, res) => {
  const adminId = req.user?._id || req.user?.userId;
  if (!adminId) {
    return errorResponse(res, 401, "Unauthorized");
  }

  const admin = await Admin.findById(adminId).select("phone isActive").lean();
  if (!admin || admin.isActive === false) {
    return errorResponse(res, 401, "Admin not found or inactive");
  }
  if (!admin.phone) {
    return errorResponse(res, 400, "Admin phone number is not set");
  }

  const result = await otpService.generateAndSendOTP(admin.phone, PURPOSE, null);

  return successResponse(res, 200, "OTP sent", {
    ...result,
    destination: maskPhone(admin.phone),
  });
});

/**
 * Verify OTP for current admin phone for wallet adjustment lock.
 * POST /api/admin/security/wallet-adjust/otp/verify
 * Body: { otp: string }
 */
export const verifyWalletAdjustOTP = asyncHandler(async (req, res) => {
  const adminId = req.user?._id || req.user?.userId;
  if (!adminId) {
    return errorResponse(res, 401, "Unauthorized");
  }

  const { otp } = req.body || {};
  const safeOtp = typeof otp === "string" ? otp.trim() : String(otp || "").trim();
  if (!safeOtp || safeOtp.length !== 6) {
    return errorResponse(res, 400, "OTP must be 6 digits");
  }

  const admin = await Admin.findById(adminId).select("phone isActive").lean();
  if (!admin || admin.isActive === false) {
    return errorResponse(res, 401, "Admin not found or inactive");
  }
  if (!admin.phone) {
    return errorResponse(res, 400, "Admin phone number is not set");
  }

  const result = await otpService.verifyOTP(admin.phone, safeOtp, PURPOSE, null);
  if (!result?.success) {
    return errorResponse(res, 400, result?.message || "Invalid or expired OTP");
  }

  return successResponse(res, 200, "OTP verified", { success: true });
});

