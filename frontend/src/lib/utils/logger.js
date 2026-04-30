/**
 * Minimal client logger with env-controlled verbosity.
 *
 * Default: only errors are printed (even in dev) to keep the browser console clean.
 * Enable more logs by setting `VITE_LOG_LEVEL` in `frontend/.env`:
 * - none | error | warn | info | debug
 */

const LEVELS = /** @type {const} */ ({
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

function normalizeLevel(value) {
  const v = String(value || "").trim().toLowerCase();
  return v in LEVELS ? v : "error";
}

const currentLevelName = normalizeLevel(import.meta.env.VITE_LOG_LEVEL);
const currentLevel = LEVELS[currentLevelName] ?? LEVELS.error;

function shouldLog(levelName) {
  return (LEVELS[levelName] ?? 0) <= currentLevel && currentLevel !== LEVELS.none;
}

function safeArgs(args) {
  // Avoid throwing if something is non-serializable; just pass through.
  return args;
}

export const log = {
  level: currentLevelName,

  debug(...args) {
    if (!shouldLog("debug")) return;
    // eslint-disable-next-line no-console
    console.log(...safeArgs(args));
  },

  info(...args) {
    if (!shouldLog("info")) return;
    // eslint-disable-next-line no-console
    console.log(...safeArgs(args));
  },

  warn(...args) {
    if (!shouldLog("warn")) return;
    // eslint-disable-next-line no-console
    console.warn(...safeArgs(args));
  },

  error(...args) {
    if (!shouldLog("error")) return;
    // eslint-disable-next-line no-console
    console.error(...safeArgs(args));
  },
};

