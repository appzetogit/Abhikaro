/**
 * Normalize delivery profile photos for API responses so clients always get
 * a single canonical URL from DB (profileImage, documents.photo, documents.profilePhoto, legacy shapes).
 */

function extractMediaUrl(val) {
  if (val == null) return null;
  if (typeof val === 'string') {
    const s = val.trim();
    return s || null;
  }
  if (typeof val === 'object') {
    const u = val.secure_url || val.secureUrl || val.url;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

function mediaBaseFromReq(req) {
  const env = process.env.PUBLIC_API_BASE_URL || process.env.BACKEND_URL || process.env.API_BASE_URL;
  if (env && typeof env === 'string') {
    return env.replace(/\/$/, '').replace(/\/api\/?$/, '');
  }
  if (!req || typeof req.get !== 'function') return null;
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return host ? `${proto}://${host}`.replace(/\/$/, '') : null;
}

function ensureAbsoluteMediaUrl(url, req) {
  if (!url || typeof url !== 'string') return url;
  const t = url.trim();
  if (!t) return url;
  if (/^https?:\/\//i.test(t) || t.startsWith('data:')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  if (t.startsWith('/')) {
    const base = mediaBaseFromReq(req);
    return base ? `${base}${t}` : t;
  }
  return t;
}

/**
 * Mutates `profile` (plain object) so profileImage + documents.photo carry the same canonical absolute URL when possible.
 * @param {Record<string, any>} profile
 * @param {import('express').Request} [req]
 */
export function normalizeDeliveryProfileImages(profile, req) {
  if (!profile || typeof profile !== 'object') return profile;

  const fromProfileImage = extractMediaUrl(profile.profileImage);
  const fromDocPhoto = extractMediaUrl(profile.documents?.photo);
  const fromDocProfilePhoto = extractMediaUrl(profile.documents?.profilePhoto);

  let canonical =
    fromProfileImage || fromDocPhoto || fromDocProfilePhoto || null;

  if (canonical) {
    canonical = ensureAbsoluteMediaUrl(canonical, req);
  }

  if (!canonical) return profile;

  const publicId =
    (typeof profile.profileImage === 'object' && profile.profileImage?.publicId) || null;

  profile.profileImage = { url: canonical, ...(publicId ? { publicId } : {}) };

  profile.documents = profile.documents || {};
  profile.documents.photo = canonical;

  return profile;
}
