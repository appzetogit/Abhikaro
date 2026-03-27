/**
 * Utility for normalizing IP addresses across different environments.
 * Handles IPv4, IPv6, and reverse proxy mapping.
 */

/**
 * Normalizes an IP address.
 * Converts IPv6 localhost (::1) to IPv4 localhost (127.0.0.1).
 * Splits IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 -> 127.0.0.1).
 * Removes port if present.
 */
export function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '0.0.0.0';

  let normalized = ip.trim();

  // Remove port if present (common in Some proxies)
  if (normalized.includes(':') && !normalized.includes('[')) {
    const parts = normalized.split(':');
    // If it's not a valid IPv6 (more than 1 colon) and has exactly one colon, it might be IP:PORT
    if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
      normalized = parts[0];
    }
  }

  // Handle IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.substring(7);
  }

  // Normalize localhost
  if (normalized === '::1' || normalized === 'localhost') {
    normalized = '127.0.0.1';
  }

  return normalized;
}

/**
 * Extracts client IP considering potential multiple proxies.
 * Assumes 'trust proxy' is NOT necessarily active in Express for manual extraction,
 * OR provides a consistent way to get the primary client IP.
 */
export function getClientIp(req) {
  // If Express 'trust proxy' is on, req.ip (or req.ips[0]) is already the client IP.
  // We use req.ip as the primary source, but fall back to headers for consistency.
  
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // x-forwarded-for can be a comma-separated list of IPs. The first one is the client.
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return normalizeIp(ips[0]);
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return normalizeIp(realIp);
  }

  // Fallback to Express req.ip (set by 'trust proxy' if enabled) or socket remoteAddress
  return normalizeIp(req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress);
}

export default {
  normalizeIp,
  getClientIp
};
