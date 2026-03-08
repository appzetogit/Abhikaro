/**
 * Performance Monitoring Middleware
 * Tracks response times, slow queries, and API performance metrics
 */

import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Performance metrics storage (in-memory, can be moved to Redis for multi-instance)
const metrics = {
  requests: 0,
  slowRequests: [],
  errors: 0,
  averageResponseTime: 0,
  totalResponseTime: 0,
};

// Configuration
const SLOW_REQUEST_THRESHOLD = parseInt(process.env.SLOW_REQUEST_THRESHOLD) || 1000; // 1 second
const MAX_SLOW_REQUESTS = 100; // Keep last 100 slow requests

/**
 * Performance monitoring middleware
 */
export const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Track request start
  req.performanceStart = startTime;
  req.requestId = requestId;

  // Override res.end to capture response time
  const originalEnd = res.end.bind(res);
  res.end = function(chunk, encoding) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Update metrics
    metrics.requests++;
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.requests;

    // Track slow requests
    if (responseTime > SLOW_REQUEST_THRESHOLD) {
      const slowRequest = {
        requestId,
        method: req.method,
        path: req.path,
        url: req.originalUrl,
        responseTime,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        userAgent: req.get('user-agent'),
        ip: req.ip,
      };

      metrics.slowRequests.push(slowRequest);
      
      // Keep only last N slow requests
      if (metrics.slowRequests.length > MAX_SLOW_REQUESTS) {
        metrics.slowRequests.shift();
      }

      logger.warn('Slow request detected:', slowRequest);
    }

    // Track errors
    if (res.statusCode >= 400) {
      metrics.errors++;
    }

    // Log performance metrics for important endpoints
    if (responseTime > 500 || res.statusCode >= 400) {
      logger.info('Request performance:', {
        method: req.method,
        path: req.path,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        requestId,
      });
    }

    // Call original end
    originalEnd(chunk, encoding);
  };

  next();
};

/**
 * Get performance metrics
 */
export function getPerformanceMetrics() {
  return {
    ...metrics,
    // Calculate additional metrics
    errorRate: metrics.requests > 0 ? (metrics.errors / metrics.requests) * 100 : 0,
    p95ResponseTime: calculatePercentile(95),
    p99ResponseTime: calculatePercentile(99),
  };
}

/**
 * Calculate percentile response time
 */
function calculatePercentile(percentile) {
  if (metrics.slowRequests.length === 0) {
    return metrics.averageResponseTime;
  }

  const sorted = [...metrics.slowRequests]
    .map(r => r.responseTime)
    .sort((a, b) => a - b);
  
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics() {
  metrics.requests = 0;
  metrics.slowRequests = [];
  metrics.errors = 0;
  metrics.averageResponseTime = 0;
  metrics.totalResponseTime = 0;
}

export default performanceMonitor;
