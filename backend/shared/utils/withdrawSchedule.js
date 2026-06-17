import BusinessSettings from "../../modules/admin/models/BusinessSettings.js";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Determine whether withdrawals are currently allowed based on global schedule.
 *
 * Reads BusinessSettings.withdrawSchedule, which has:
 * - enabled: Boolean
 * - dayOfWeek: 0 (Sunday) - 6 (Saturday)
 * - startTime: "HH:MM" (24-hour)
 * - timeZone: optional IANA timezone string (defaults to Asia/Kolkata)
 *
 * Returns:
 * - { allowed: true } when withdrawals are currently open
 * - { allowed: false, nextWindowText: string, message: string } when locked
 */
export const isWithdrawAllowedNow = async () => {
  // Load latest settings (prefer static getSettings to enforce singleton)
  let settings =
    (BusinessSettings.getSettings &&
      (await BusinessSettings.getSettings())) ||
    (await BusinessSettings.findOne().sort({ createdAt: -1 }));

  const cfg = settings?.withdrawSchedule;

  if (!cfg || !cfg.enabled) {
    const message = "Withdrawals are currently disabled by admin.";
    return {
      allowed: false,
      nextWindowText: message,
      message,
    };
  }

  const { dayOfWeek, startTime, timeZone } = cfg;

  const dowNumber =
    typeof dayOfWeek === "string" ? Number(dayOfWeek) : dayOfWeek;

  if (
    typeof dowNumber !== "number" ||
    Number.isNaN(dowNumber) ||
    dowNumber < 0 ||
    dowNumber > 6 ||
    !startTime
  ) {
    const message = "Withdraw day/time is not configured correctly.";
    return {
      allowed: false,
      nextWindowText: message,
      message,
    };
  }

  // Parse time in "HH:MM" format; be lenient on leading zeros
  const match = String(startTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    const message = "Withdraw start time must be in HH:MM (24-hour) format.";
    return {
      allowed: false,
      nextWindowText: message,
      message,
    };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    const message = "Withdraw start time is invalid.";
    return {
      allowed: false,
      nextWindowText: message,
      message,
    };
  }

  // Use configured timezone; default to IST
  const tz = timeZone || "Asia/Kolkata";

  const now = new Date();
  const tzNow = new Date(
    now.toLocaleString("en-US", {
      timeZone: tz,
    }),
  );

  const currentDow = tzNow.getDay();

  if (currentDow !== dowNumber) {
    const dayName = DAY_NAMES[dowNumber] || "selected day";
    const msg = `Withdrawals open on ${dayName} after ${startTime}`;
    return {
      allowed: false,
      nextWindowText: msg,
      message: msg,
    };
  }

  // Same day. Check if the current time is after the start time.
  const target = new Date(tzNow);
  target.setHours(hours, minutes, 0, 0);

  if (tzNow >= target) {
    return {
      allowed: true,
      nextWindowText: "",
      message: "",
    };
  }

  const dayName = DAY_NAMES[dowNumber] || "selected day";
  const msg = `Withdrawals open on ${dayName} after ${startTime}`;

  return {
    allowed: false,
    nextWindowText: msg,
    message: msg,
  };
};

export default {
  isWithdrawAllowedNow,
};

