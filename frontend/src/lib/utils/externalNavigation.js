/**
 * External navigation helpers (Web + Android/iOS WebViews)
 *
 * Many in-app WebViews block `window.open(..., "_blank")` or open a blank tab.
 * Use these helpers for maps, social links, tel:, etc. to behave consistently.
 */

export function isLikelyWebView() {
  try {
    const ua = (navigator.userAgent || "").toLowerCase()
    // Common WebView markers (Android WebView, iOS WKWebView wrappers, Flutter inappwebview)
    return (
      ua.includes("wv") ||
      ua.includes("webview") ||
      ua.includes("flutter") ||
      // iOS WebView often lacks "safari" token
      (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) &&
        !ua.includes("safari")
    )
  } catch {
    return false
  }
}

export function openExternalUrl(url, { preferSameTabInWebView = true } = {}) {
  if (!url) return false

  try {
    const webView = isLikelyWebView()

    // In WebView, prefer same-tab navigation (more reliable)
    if (webView && preferSameTabInWebView) {
      window.location.href = url
      return true
    }

    // In normal browsers, open a new tab where possible
    const w = window.open(url, "_blank", "noopener,noreferrer")
    if (w) return true

    // Fallback: same-tab navigation
    window.location.href = url
    return true
  } catch {
    try {
      window.location.href = url
      return true
    } catch {
      return false
    }
  }
}

