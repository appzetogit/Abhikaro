import { API_BASE_URL } from "@/lib/api/config.js"

/** If DB stores a path like `/uploads/...`, make it loadable in the browser */
export function resolveDeliveryMediaUrl(url) {
  if (!url || typeof url !== "string") return url
  const t = url.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t) || t.startsWith("data:") || t.startsWith("blob:")) return t
  if (t.startsWith("//")) return `${typeof window !== "undefined" ? window.location.protocol : "https:"}${t}`
  if (t.startsWith("/")) {
    const base = (API_BASE_URL || "").trim()
    if (base.startsWith("http://") || base.startsWith("https://")) {
      const origin = base.replace(/\/api\/?$/i, "").replace(/\/$/, "")
      return origin ? `${origin}${t}` : t
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin.replace(/\/$/, "")}${t}`
    }
  }
  return t
}

/**
 * Resolve delivery partner profile photo URL from API payloads.
 * Supports legacy `profileImage` stored as a plain string and `{ url | secure_url }`.
 */
export function getDeliveryProfilePhotoUrl(profile) {
  if (!profile) return null

  const pi = profile.profileImage
  let raw = null
  if (typeof pi === "string" && pi.trim()) raw = pi.trim()
  else if (pi && typeof pi === "object") {
    const u = pi.url || pi.secure_url
    if (typeof u === "string" && u.trim()) raw = u.trim()
  }

  const pick = (v) => {
    if (!v) return null
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "object") {
      const u = v.url || v.secure_url
      if (typeof u === "string" && u.trim()) return u.trim()
    }
    return null
  }

  raw = raw || pick(profile.documents?.photo) || pick(profile.documents?.profilePhoto) || null
  return raw ? resolveDeliveryMediaUrl(raw) : null
}

export function getDeliveryUiAvatarUrl(name) {
  const n = (name && String(name).trim()) || "Delivery Partner"
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=ff8100&color=fff&size=128`
}
