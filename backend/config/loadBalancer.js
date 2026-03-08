/**
 * Load Balancer Configuration
 * Health check and load balancer-aware utilities
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

/**
 * Enhanced health check for load balancers
 * Returns detailed health status
 */
export async function getHealthStatus() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    instance: process.env.INSTANCE_ID || 'unknown',
  };

  // Check MongoDB connection
  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState === 1) {
      health.mongodb = 'connected';
    } else {
      health.mongodb = 'disconnected';
      health.status = 'degraded';
    }
  } catch (error) {
    health.mongodb = 'error';
    health.status = 'unhealthy';
  }

  // Check Redis connection
  try {
    const { isRedisConnected } = await import('../config/redis.js');
    if (isRedisConnected()) {
      health.redis = 'connected';
    } else {
      health.redis = 'disconnected';
      // Redis is optional, so don't mark as unhealthy
    }
  } catch (error) {
    health.redis = 'error';
  }

  return health;
}

/**
 * Check if instance is ready to serve traffic
 */
export async function isReady() {
  try {
    const mongoose = (await import('mongoose')).default;
    // Instance is ready if MongoDB is connected
    return mongoose.connection.readyState === 1;
  } catch (error) {
    logger.error('Health check error:', error);
    return false;
  }
}

/**
 * Check if instance is alive (basic liveness probe)
 */
export function isAlive() {
  return process.uptime() > 0;
}

export default {
  getHealthStatus,
  isReady,
  isAlive,
};
