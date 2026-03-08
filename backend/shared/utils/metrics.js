/**
 * Metrics Collection Utility
 * Collects and aggregates application metrics for monitoring
 */

import { getRedisClient } from '../../config/redis.js';
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

// In-memory metrics (fallback if Redis not available)
const inMemoryMetrics = {
  apiCalls: 0,
  databaseQueries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  queueJobs: 0,
  queueFailures: 0,
};

/**
 * Increment a metric counter
 */
export async function incrementMetric(metricName, value = 1) {
  try {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isOpen) {
      await redisClient.incrBy(`metrics:${metricName}`, value);
    } else {
      // Fallback to in-memory
      inMemoryMetrics[metricName] = (inMemoryMetrics[metricName] || 0) + value;
    }
  } catch (error) {
    logger.error(`Error incrementing metric ${metricName}:`, error.message);
  }
}

/**
 * Set a metric value
 */
export async function setMetric(metricName, value) {
  try {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isOpen) {
      await redisClient.set(`metrics:${metricName}`, value.toString());
    } else {
      // Fallback to in-memory
      inMemoryMetrics[metricName] = value;
    }
  } catch (error) {
    logger.error(`Error setting metric ${metricName}:`, error.message);
  }
}

/**
 * Get a metric value
 */
export async function getMetric(metricName) {
  try {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isOpen) {
      const value = await redisClient.get(`metrics:${metricName}`);
      return value ? parseInt(value) : 0;
    } else {
      // Fallback to in-memory
      return inMemoryMetrics[metricName] || 0;
    }
  } catch (error) {
    logger.error(`Error getting metric ${metricName}:`, error.message);
    return 0;
  }
}

/**
 * Get all metrics
 */
export async function getAllMetrics() {
  try {
    const redisClient = getRedisClient();
    if (redisClient && redisClient.isOpen) {
      const keys = await redisClient.keys('metrics:*');
      const metrics = {};
      
      for (const key of keys) {
        const value = await redisClient.get(key);
        const metricName = key.replace('metrics:', '');
        metrics[metricName] = parseInt(value) || 0;
      }
      
      return metrics;
    } else {
      // Fallback to in-memory
      return { ...inMemoryMetrics };
    }
  } catch (error) {
    logger.error('Error getting all metrics:', error.message);
    return { ...inMemoryMetrics };
  }
}

/**
 * Track database query performance
 */
export async function trackDatabaseQuery(queryName, duration) {
  await incrementMetric('databaseQueries');
  
  if (duration > 100) { // Log slow queries (>100ms)
    logger.warn(`Slow database query: ${queryName} took ${duration}ms`);
  }
}

/**
 * Track cache hit/miss
 */
export async function trackCacheHit() {
  await incrementMetric('cacheHits');
}

export async function trackCacheMiss() {
  await incrementMetric('cacheMisses');
}

/**
 * Track queue job
 */
export async function trackQueueJob(queueName, success = true) {
  await incrementMetric('queueJobs');
  if (!success) {
    await incrementMetric('queueFailures');
  }
}

export default {
  incrementMetric,
  setMetric,
  getMetric,
  getAllMetrics,
  trackDatabaseQuery,
  trackCacheHit,
  trackCacheMiss,
  trackQueueJob,
};
