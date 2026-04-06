// Lightweight preloader for Google Maps JS to make the tracking map render faster
// Called as soon as the order success screen appears so script is cached before navigation

const GOOGLE_HOSTS = [
  'https://maps.googleapis.com',
  'https://maps.gstatic.com',
];

function ensureLink(rel, href, extraAttrs = {}) {
  const selector = `link[rel="${rel}"][href="${href}"]`;
  if (document.querySelector(selector)) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(extraAttrs).forEach(([k, v]) => {
    link.setAttribute(k, v);
  });
  document.head.appendChild(link);
}

function warmConnections() {
  // dns-prefetch + preconnect to reduce handshake latency
  GOOGLE_HOSTS.forEach((host) => {
    ensureLink('dns-prefetch', host);
    ensureLink('preconnect', host, { crossOrigin: '' });
  });
}

export function preloadGoogleMaps(apiKey) {
  try {
    if (!apiKey || typeof apiKey !== 'string') {
      // Avoid throwing; silently no-op if key is missing to not block UX
      return Promise.resolve();
    }

    // If already loaded by @react-google-maps/api or previous preload
    if (window.google && window.google.maps) {
      return Promise.resolve();
    }
    if (window._googleMapsPreloadPromise) {
      return window._googleMapsPreloadPromise;
    }

    warmConnections();

    const existing = document.querySelector('script[data-preload="google-maps-js"]');
    if (existing) {
      // If the tag exists, return a promise that resolves on load if not already ready
      if (window.google && window.google.maps) {
        return Promise.resolve();
      }
      window._googleMapsPreloadPromise = new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Google Maps preload failed')));
      });
      return window._googleMapsPreloadPromise;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-preload', 'google-maps-js');

    window._googleMapsPreloadPromise = new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google Maps preload failed'));
    });

    document.head.appendChild(script);
    return window._googleMapsPreloadPromise;
  } catch {
    // Never block the flow if anything unexpected happens
    return Promise.resolve();
  }
}

export default preloadGoogleMaps;

