/**
 * Payment Processing Queue
 * Handles async payment processing tasks
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

// Create payment queue
export const paymentQueue = new Queue('payments', {
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

// Process payment verification
paymentQueue.process('verify-payment', async (job) => {
  const { orderId, paymentId, signature } = job.data;
  
  try {
    const { verifyPayment } = await import('../../modules/payment/services/razorpayService.js');
    const result = await verifyPayment(orderId, paymentId, signature);
    
    logger.info(`Payment verified for order: ${orderId}`);
    return { success: true, orderId, result };
  } catch (error) {
    logger.error(`Error verifying payment: ${error.message}`);
    throw error;
  }
});

// Process refunds
paymentQueue.process('process-refund', async (job) => {
  const { orderId, amount, reason } = job.data;
  
  try {
    const { processCancellationRefund } = await import('../../modules/order/services/cancellationRefundService.js');
    await processCancellationRefund(orderId, { amount, reason });
    
    logger.info(`Refund processed for order: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    logger.error(`Error processing refund: ${error.message}`);
    throw error;
  }
});

// Queue event handlers
paymentQueue.on('completed', (job, result) => {
  logger.info(`Payment queue job ${job.id} completed:`, result);
});

paymentQueue.on('failed', (job, err) => {
  logger.error(`Payment queue job ${job.id} failed:`, err.message);
});

paymentQueue.on('error', (error) => {
  logger.error(`Payment queue error:`, error.message);
});

export default paymentQueue;
