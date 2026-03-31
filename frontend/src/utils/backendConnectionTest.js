/**
 * Backend Connection Test Utility
 * Tests backend connectivity and displays helpful error messages
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const BACKEND_URL = API_BASE_URL.startsWith('/')
  ? window.location.origin
  : API_BASE_URL.replace('/api', '');

/**
 * Test backend health endpoint
 */
export async function testBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Backend health check passed:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Backend health check failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      message: 'Backend server is not running or not accessible'
    };
  }
}

/**
 * Test restaurant API endpoint
 */
export async function testRestaurantAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/restaurant/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Restaurant API test passed:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Restaurant API test failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      message: 'Restaurant API endpoint is not accessible'
    };
  }
}

/**
 * Run all connection tests
 */
export async function runConnectionTests() {
  console.log('🚀 Starting backend connection tests...');
  console.log('🌐 Backend URL:', BACKEND_URL);
  console.log('🌐 API Base URL:', API_BASE_URL);
  
  const results = {
    health: await testBackendHealth(),
    restaurantAPI: await testRestaurantAPI(),
  };
  
  // Summary
  const allPassed = results.health.success && results.restaurantAPI.success;
  
  if (allPassed) {
    console.log('✅ All connection tests passed!');
  } else {
    console.error('❌ Some connection tests failed');
    console.error('💡 Make sure backend server is running:');
    console.error('   cd backend && npm run dev');
    console.error('💡 Backend should be running on:', BACKEND_URL);
  }
  
  return results;
}

/**
 * Display connection status in UI
 */
export function displayConnectionStatus(results) {
  if (!results.health.success) {
    return {
      type: 'error',
      title: 'Backend Connection Failed',
      message: `Cannot connect to backend server at ${BACKEND_URL}`,
      action: 'Start backend server: cd backend && npm run dev'
    };
  }
  
  if (!results.restaurantAPI.success) {
    return {
      type: 'warning',
      title: 'API Endpoint Issue',
      message: 'Backend is running but restaurant API is not accessible',
      action: 'Check backend routes and MongoDB connection'
    };
  }
  
  return {
    type: 'success',
    title: 'Connection Successful',
    message: 'Backend is connected and API is working'
  };
}

// Auto-run in development mode
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Run tests after page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      runConnectionTests().catch(console.error);
    }, 2000);
  });
}

