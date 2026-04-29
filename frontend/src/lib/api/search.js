import apiClient from './axios.js';

/**
 * Unified typeahead suggestions across foods, restaurants, categories.
 * GET /menu/search/suggest?q=<term>&limit=<n>
 */
export const searchAPI = {
  suggest: (q, limit = 5, zoneId = null) => {
    return apiClient.get('/menu/search/suggest', {
      params: { q, limit, ...(zoneId ? { zoneId } : {}) }
    });
  }
};

export default searchAPI;

