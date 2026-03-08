/**
 * Order Processing Queue
 * Handles async order processing tasks
 */

import Queue from 'bull';
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

const redisClient = getRedisClient();
const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

// Create order queue
export const orderQueue = new Queue('order-processing', {
  redis: redisClient && redisClient.isOpen ? {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  } : redisUrl,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

// Process order notifications
orderQueue.process('send-order-notification', async (job) => {
  const { orderId, notificationType } = job.data;
  
  try {
    // Dynamic import to avoid circular dependencies
    const { notifyRestaurantNewOrder } = await import('../../modules/order/services/restaurantNotificationService.js');
    
    if (notificationType === 'restaurant') {
      await notifyRestaurantNewOrder(orderId);
    }
    
    logger.info(`Order notification sent: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    logger.error(`Error processing order notification: ${error.message}`);
    throw error;
  }
});

// Process commission calculations
orderQueue.process('calculate-commission', async (job) => {
  const { orderId } = job.data;
  
  try {
    const { calculateOrderSettlement } = await import('../../modules/order/services/orderSettlementService.js');
    await calculateOrderSettlement(orderId);
    
    logger.info(`Commission calculated for order: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    logger.error(`Error calculating commission: ${error.message}`);
    throw error;
  }
});

// Queue event handlers
orderQueue.on('completed', (job, result) => {
  logger.info(`Order queue job ${job.id} completed:`, result);
});

orderQueue.on('failed', (job, err) => {
  logger.error(`Order queue job ${job.id} failed:`, err.message);
});

orderQueue.on('error', (error) => {
  logger.error(`Order queue error:`, error.message);
});

export default orderQueue;
