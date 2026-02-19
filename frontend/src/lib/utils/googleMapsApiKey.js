/**
 * Google Maps API Key Utility
 * Fetches API key from backend database instead of .env file
 */

let cachedApiKey = null;
let apiKeyPromise = null;

/**
 * Get Google Maps API Key from backend
 * Uses caching to avoid multiple requests
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey(forceRefresh = false) {
  // Force refresh if requested (clear cache)
  if (forceRefresh) {
    cachedApiKey = null;
    apiKeyPromise = null;
  }

  // Return cached key if available
  if (cachedApiKey) {
    console.log('✅ Using cached Google Maps API key');
    return cachedApiKey;
  }

  // Return existing promise if already fetching
  if (apiKeyPromise) {
    console.log('⏳ Google Maps API key fetch already in progress, waiting...');
    return apiKeyPromise;
  }

  // Fetch from backend
  apiKeyPromise = (async () => {
    try {
      console.log('📡 Fetching Google Maps API key from backend...');
      const { adminAPI } = await import('../api/index.js');
      const response = await adminAPI.getPublicEnvVariables();
      
      console.log('📡 Backend response:', {
        success: response.data?.success,
        hasData: !!response.data?.data,
        hasKey: !!response.data?.data?.VITE_GOOGLE_MAPS_API_KEY,
        keyLength: response.data?.data?.VITE_GOOGLE_MAPS_API_KEY?.length || 0
      });
      
      if (response.data.success && response.data.data?.VITE_GOOGLE_MAPS_API_KEY) {
        const apiKey = response.data.data.VITE_GOOGLE_MAPS_API_KEY.trim();
        if (apiKey && apiKey.length > 0) {
          cachedApiKey = apiKey;
          console.log('✅ Google Maps API key fetched successfully, length:', apiKey.length);
          return cachedApiKey;
        } else {
          console.warn('⚠️ Google Maps API key is empty in database');
        }
      }
      
      // No fallback - return empty if not in database
      console.error('❌ Google Maps API key not found in database. Please set it in Admin → System → Environment Variables');
      return '';
    } catch (error) {
      console.error('❌ Failed to fetch Google Maps API key from backend:', error);
      console.error('❌ Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      // No fallback - return empty on error
      return '';
    } finally {
      apiKeyPromise = null;
    }
  })();

  return apiKeyPromise;
}

/**
 * Clear cached API key (call after updating in admin panel)
 */
export function clearGoogleMapsApiKeyCache() {
  cachedApiKey = null;
  apiKeyPromise = null;
}

