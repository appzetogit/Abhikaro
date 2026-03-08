/**
 * Metrics Endpoint
 * Exposes application metrics for monitoring
 */

import express from 'express';
import { getPerformanceMetrics } from '../shared/middleware/performanceMonitor.js';
import { getAllMetrics } from '../shared/utils/metrics.js';
import { comprehensiveHealthCheck } from '../shared/monitoring/healthCheck.js';
import { getAllQueues } from '../shared/queues/index.js';

const router = express.Router();

/**
 * Get performance metrics
 * GET /api/metrics/performance
 */
router.get('/performance', async (req, res) => {
  try {
    const metrics = getPerformanceMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance metrics',
      error: error.message,
    });
  }
});

/**
 * Get application metrics
 * GET /api/metrics/application
 */
router.get('/application', async (req, res) => {
  try {
    const metrics = await getAllMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application metrics',
      error: error.message,
    });
  }
});

/**
 * Get queue metrics
 * GET /api/metrics/queues
 */
router.get('/queues', async (req, res) => {
  try {
    const queues = getAllQueues();
    const queueMetrics = {};

    for (const [name, queue] of Object.entries(queues)) {
      if (queue) {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        queueMetrics[name] = {
          waiting,
          active,
          completed,
          failed,
          delayed,
        };
      }
    }

    res.json({
      success: true,
      data: queueMetrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch queue metrics',
      error: error.message,
    });
  }
});

/**
 * Get comprehensive health check
 * GET /api/metrics/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await comprehensiveHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      error: error.message,
    });
  }
});

export default router;
