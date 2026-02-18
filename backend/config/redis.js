import { createClient } from 'redis';
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

let redisClient = null;
let connectionAttempted = false;
let connectionErrorLogged = false;

export const connectRedis = async () => {
  // In production, Redis should be enabled for caching and rate limiting
  // Only skip if explicitly disabled
  if (process.env.REDIS_ENABLED === 'false' || process.env.REDIS_ENABLED === '0') {
    if (!connectionAttempted) {
      logger.warn('⚠️ Redis is disabled. Caching and Redis-based rate limiting will not work.');
      logger.warn('⚠️ For production, set REDIS_ENABLED=true in .env to enable.');
      connectionAttempted = true;
    }
    return null;
  }

  // Prevent multiple connection attempts
  if (connectionAttempted && redisClient) {
    return redisClient;
  }

  connectionAttempted = true;

  try {
    const redisUrl = process.env.REDIS_URL;
    
    // Support both REDIS_URL and individual host/port config
    if (redisUrl) {
      redisClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection limit exceeded');
            }
            // Exponential backoff: 50ms, 100ms, 200ms, 400ms, etc.
            return Math.min(retries * 50, 3000);
          },
          connectTimeout: 10000, // 10 seconds
        },
      });
    } else {
      redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection limit exceeded');
            }
            return Math.min(retries * 50, 3000);
          },
          connectTimeout: 10000,
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });
    }

    // Only log errors once to prevent spam
    redisClient.on('error', (err) => {
      if (!connectionErrorLogged) {
        logger.warn(`Redis connection failed: ${err.message}. The app will continue without Redis.`);
        connectionErrorLogged = true;
      }
    });

    redisClient.on('connect', () => {
      logger.info('Redis Client Connected');
      connectionErrorLogged = false; // Reset on successful connection
    });

    // Set a connection timeout
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    return redisClient;
  } catch (error) {
    if (!connectionErrorLogged) {
      logger.warn(`Redis connection failed: ${error.message}. The app will continue without Redis.`);
      connectionErrorLogged = true;
    }
    redisClient = null;
    // Don't exit process, app can work without Redis
    return null;
  }
};

export const getRedisClient = () => {
  return redisClient;
};

export default connectRedis;

