/**
 * Email Queue
 * Handles async email sending
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

const isRedisEnabled = ['true', '1', 'yes'].includes(String(process.env.REDIS_ENABLED || '').toLowerCase());

function createNoopQueue(name) {
  const noop = async () => undefined;
  const q = {
    name,
    add: noop,
    process: () => q,
    on: () => q,
    pause: noop,
    resume: noop,
    close: noop,
    isReady: async () => false,
  };
  return q;
}

if (!isRedisEnabled) {
  logger.warn('⚠️ Redis disabled - email queue is running in no-op mode');
}

const redisClient = getRedisClient();
const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

// Create email queue
export const emailQueue = !isRedisEnabled
  ? createNoopQueue('emails')
  : new Queue('emails', {
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

// Process email sending
if (isRedisEnabled) emailQueue.process('send-email', async (job) => {
  const { to, subject, html, text } = job.data;
  
  try {
    // Import nodemailer or email service
    // For now, this is a placeholder - implement based on your email service
    logger.info(`Email queued for: ${to}, subject: ${subject}`);
    
    // TODO: Implement actual email sending logic
    // const { sendEmail } = await import('../../shared/services/emailService.js');
    // await sendEmail({ to, subject, html, text });
    
    return { success: true, to, subject };
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
});

// Queue event handlers
if (isRedisEnabled) emailQueue.on('completed', (job, result) => {
  logger.info(`Email queue job ${job.id} completed:`, result);
});

if (isRedisEnabled) emailQueue.on('failed', (job, err) => {
  logger.error(`Email queue job ${job.id} failed:`, err.message);
});

if (isRedisEnabled) emailQueue.on('error', (error) => {
  logger.error(`Email queue error:`, error.message);
});

export default emailQueue;
