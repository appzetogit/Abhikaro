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
  // Redis is OPTIONAL. Default to disabled unless explicitly enabled.
  // This prevents accidental startup crashes in environments without Redis auth/config.
  const redisEnabled = String(process.env.REDIS_ENABLED || '').toLowerCase();
  const isEnabled = redisEnabled === 'true' || redisEnabled === '1' || redisEnabled === 'yes';
  if (!isEnabled) {
    if (!connectionAttempted) {
      logger.warn('⚠️ Redis is disabled. Caching and Redis-based rate limiting will not work.');
      logger.warn('⚠️ To enable Redis, set REDIS_ENABLED=true (and REDIS_URL/REDIS_HOST/REDIS_PASSWORD) in .env');
      connectionAttempted = true;
    }
    return null;
  }

  // Prevent multiple connection attempts
  if (connectionAttempted && redisClient && redisClient.isOpen) {
    return redisClient;
  }

  connectionAttempted = true;

  try {
    const redisUrl = process.env.REDIS_URL;
    const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES) || 20; // Increased retries
    const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000;
    
    // Support both REDIS_URL and individual host/port config
    const clientOptions = {
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > maxRetries) {
            logger.error(`Redis reconnection failed after ${maxRetries} attempts`);
            return new Error('Redis reconnection limit exceeded');
          }
          // Exponential backoff with jitter: 50ms, 100ms, 200ms, 400ms, etc., max 3s
          const delay = Math.min(retries * 50, 3000);
          // Add jitter to prevent thundering herd
          const jitter = Math.random() * 100;
          return delay + jitter;
        },
        connectTimeout: connectTimeout,
        keepAlive: 30000, // Keep connection alive
        noDelay: true, // Disable Nagle's algorithm for lower latency
      },
      // Connection pool settings for better performance
      pingInterval: 30000, // Ping every 30 seconds to keep connection alive
    };

    if (redisUrl) {
      redisClient = createClient({
        url: redisUrl,
        ...clientOptions,
      });
    } else {
      redisClient = createClient({
        socket: {
          ...clientOptions.socket,
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
        },
        password: process.env.REDIS_PASSWORD || undefined,
        ...clientOptions,
      });
    }

    // Enhanced error handling
    redisClient.on('error', (err) => {
      if (!connectionErrorLogged) {
        logger.warn(`Redis connection error: ${err.message}. The app will continue without Redis.`);
        connectionErrorLogged = true;
      }
      // Reset error flag after some time to allow retry logging
      setTimeout(() => {
        connectionErrorLogged = false;
      }, 60000); // Reset after 1 minute
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis Client Connected');
      connectionErrorLogged = false; // Reset on successful connection
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis Client Ready');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis Client Reconnecting...');
    });

    redisClient.on('end', () => {
      logger.warn('⚠️ Redis connection ended');
    });

    // Set a connection timeout
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), connectTimeout);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    
    // Test connection with a ping
    await redisClient.ping();
    logger.info('✅ Redis connection verified with PING');
    
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
  // Return client only if it's connected
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }
  return null;
};

// Health check for Redis
export const isRedisConnected = () => {
  return redisClient !== null && redisClient.isOpen === true;
};

export default connectRedis;

