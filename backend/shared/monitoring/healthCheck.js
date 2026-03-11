/**
 * Comprehensive Health Check System
 * Monitors all critical system components
 */

import mongoose from 'mongoose';
import { isRedisConnected } from '../../config/redis.js';
import { getPerformanceMetrics } from '../middleware/performanceMonitor.js';
import { getAllMetrics } from '../utils/metrics.js';
import { getAllQueues } from '../../shared/queues/index.js';

/**
 * Comprehensive health check
 */
export async function comprehensiveHealthCheck() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    instance: process.env.INSTANCE_ID || 'unknown',
    checks: {},
  };

  // MongoDB check
  try {
    const mongoStatus = mongoose.connection.readyState;
    checks.checks.mongodb = {
      status: mongoStatus === 1 ? 'healthy' : 'unhealthy',
      readyState: mongoStatus,
      host: mongoose.connection.host || 'unknown',
    };
    if (mongoStatus !== 1) {
      checks.status = 'unhealthy';
    }
  } catch (error) {
    checks.checks.mongodb = {
      status: 'error',
      error: error.message,
    };
    checks.status = 'unhealthy';
  }

  // Redis check
  try {
    const redisConnected = isRedisConnected();
    checks.checks.redis = {
      status: redisConnected ? 'healthy' : 'degraded',
      connected: redisConnected,
    };
    // Redis is optional, so don't mark as unhealthy if disconnected
  } catch (error) {
    checks.checks.redis = {
      status: 'error',
      error: error.message,
    };
  }

  // Queue system check
  try {
    const queues = getAllQueues();
    const queueStatus = {};
    let allQueuesHealthy = true;

    for (const [name, queue] of Object.entries(queues)) {
      if (queue) {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        queueStatus[name] = {
          status: 'healthy',
          waiting,
          active,
          completed,
          failed,
          delayed,
        };

        // Mark as degraded if too many failed jobs
        if (failed > 100) {
          queueStatus[name].status = 'degraded';
          allQueuesHealthy = false;
        }
      }
    }

    checks.checks.queues = {
      status: allQueuesHealthy ? 'healthy' : 'degraded',
      queues: queueStatus,
    };
  } catch (error) {
    checks.checks.queues = {
      status: 'error',
      error: error.message,
    };
  }

  // Performance metrics
  try {
    const perfMetrics = getPerformanceMetrics();
    checks.checks.performance = {
      status: 'healthy',
      ...perfMetrics,
    };
  } catch (error) {
    checks.checks.performance = {
      status: 'error',
      error: error.message,
    };
  }

  // Application metrics
  try {
    const appMetrics = await getAllMetrics();
    checks.checks.metrics = {
      status: 'healthy',
      ...appMetrics,
    };
  } catch (error) {
    checks.checks.metrics = {
      status: 'error',
      error: error.message,
    };
  }

  // Cloudinary check
  try {
    const { cloudinary } = await import('../../config/cloudinary.js');
    // Test Cloudinary connectivity by attempting to get account info
    // This is a lightweight operation that verifies credentials and connectivity
    const testResult = await cloudinary.api.ping();
    checks.checks.cloudinary = {
      status: testResult && testResult.status === 'ok' ? 'healthy' : 'degraded',
      configured: true,
      cloudName: cloudinary.config().cloud_name || 'unknown',
    };
    // Cloudinary is critical for uploads, so mark as unhealthy if ping fails
    if (!testResult || testResult.status !== 'ok') {
      checks.status = 'unhealthy';
    }
  } catch (error) {
    checks.checks.cloudinary = {
      status: 'error',
      configured: false,
      error: error.message,
    };
    // Cloudinary errors are critical - mark as unhealthy
    checks.status = 'unhealthy';
  }

  return checks;
}

export default { comprehensiveHealthCheck };
