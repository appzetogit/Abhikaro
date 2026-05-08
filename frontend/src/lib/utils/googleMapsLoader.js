import { getGoogleMapsApiKey } from './googleMapsApiKey';

/**
 * Global utility to preload Google Maps API script.
 * This ensures the map is ready as soon as possible.
 */
export async function preloadGoogleMaps() {
  // If already loaded or loading, skip
  if (window.google && window.google.maps) {
    return Promise.resolve();
  }

  if (window.__googleMapsLoadingPromise) {
    return window.__googleMapsLoadingPromise;
  }

  window.__googleMapsLoadingPromise = (async () => {
    try {
      // Check if script already exists
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // Wait for it if it's already there but not finished
        return new Promise((resolve) => {
          const check = setInterval(() => {
            if (window.google && window.google.maps) {
              clearInterval(check);
              resolve();
            }
          }, 100);
          // Safety timeout
          setTimeout(() => {
            clearInterval(check);
            resolve();
          }, 10000);
        });
      }

      const apiKey = await getGoogleMapsApiKey();
      if (!apiKey) {
        throw new Error('Google Maps API key not found');
      }

      return new Promise((resolve, reject) => {
        const callbackName = '__onGoogleMapsLoaded_global';
        window[callbackName] = () => {
          window.__googleMapsLoaded = true;
          window.__googleMapsLoading = false;
          delete window[callbackName];
          resolve();
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey.trim()}&libraries=places,geometry&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          window.__googleMapsLoading = false;
          delete window[callbackName];
          reject(new Error('Failed to load Google Maps script'));
        };
        document.head.appendChild(script);
        window.__googleMapsLoading = true;
      });
    } catch (error) {
      console.error('Failed to preload Google Maps:', error);
      window.__googleMapsLoadingPromise = null;
      throw error;
    }
  })();

  return window.__googleMapsLoadingPromise;
}
