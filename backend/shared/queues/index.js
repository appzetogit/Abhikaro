/**
 * Queue System Initialization
 * Centralized queue management for async processing
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

let queues = {};

/**
 * Initialize all queues
 */
export async function initializeQueues() {
  const redisClient = getRedisClient();
  
  if (!redisClient || !redisClient.isOpen) {
    logger.warn('⚠️ Redis not available - Queue system disabled');
    return null;
  }

  try {
    // Import queue modules
    const { orderQueue } = await import('./orderQueue.js');
    const { notificationQueue } = await import('./notificationQueue.js');
    const { emailQueue } = await import('./emailQueue.js');
    const { paymentQueue } = await import('./paymentQueue.js');

    queues = {
      order: orderQueue,
      notification: notificationQueue,
      email: emailQueue,
      payment: paymentQueue,
    };

    logger.info('✅ All queues initialized successfully');
    return queues;
  } catch (error) {
    logger.error(`❌ Error initializing queues: ${error.message}`);
    return null;
  }
}

/**
 * Get a specific queue
 */
export function getQueue(name) {
  return queues[name] || null;
}

/**
 * Get all queues
 */
export function getAllQueues() {
  return queues;
}

export default { initializeQueues, getQueue, getAllQueues };
