/**
 * Notification Queue
 * Handles async FCM push notifications, SMS, etc.
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

// Create notification queue
export const notificationQueue = new Queue('notifications', {
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
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

// Process FCM notifications
notificationQueue.process('fcm-push', async (job) => {
  const { token, title, body, data } = job.data;
  
  try {
    const { sendFCMPushNotification } = await import('../../modules/fcm/services/fcmService.js');
    await sendFCMPushNotification(token, { title, body, data });
    
    logger.info(`FCM notification sent to token: ${token?.substring(0, 20)}...`);
    return { success: true };
  } catch (error) {
    logger.error(`Error sending FCM notification: ${error.message}`);
    throw error;
  }
});

// Process batch notifications
notificationQueue.process('batch-notifications', async (job) => {
  const { tokens, title, body, data } = job.data;
  
  try {
    const { sendBatchFCMPushNotifications } = await import('../../modules/fcm/services/fcmService.js');
    await sendBatchFCMPushNotifications(tokens, { title, body, data });
    
    logger.info(`Batch FCM notifications sent to ${tokens.length} tokens`);
    return { success: true, count: tokens.length };
  } catch (error) {
    logger.error(`Error sending batch notifications: ${error.message}`);
    throw error;
  }
});

// Queue event handlers
notificationQueue.on('completed', (job, result) => {
  logger.info(`Notification queue job ${job.id} completed:`, result);
});

notificationQueue.on('failed', (job, err) => {
  logger.error(`Notification queue job ${job.id} failed:`, err.message);
});

notificationQueue.on('error', (error) => {
  logger.error(`Notification queue error:`, error.message);
});

export default notificationQueue;
