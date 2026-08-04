import mongoose from 'mongoose';
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

export const connectDB = async () => {
  try {
    // Optimize connection pool for high concurrency (50k-1 lakh users)
    // Calculate pool size based on available resources or use defaults
    const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 100; // Increased for high concurrency
    const minPoolSize = parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 20; // Keep connections warm
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection Pooling - Critical for scalability
      maxPoolSize: maxPoolSize,
      minPoolSize: minPoolSize,
      maxIdleTimeMS: 30000, // Close idle connections after 30 seconds
      serverSelectionTimeoutMS: 30000, // Increased timeout for MongoDB Atlas connection stability
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 30000, // Connection timeout
      // Read Preference - Support for read replicas
      readPreference: process.env.MONGODB_READ_PREFERENCE || 'primary', // 'primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'
      // Write concern for better reliability
      writeConcern: {
        w: 'majority',
        j: true, // Journal write concern for durability
      },
      // Retry settings
      retryWrites: true,
      retryReads: true,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    logger.info(`MongoDB Connection Pool: max=${maxPoolSize}, min=${minPoolSize}`);
    
    // Handle connection events with monitoring
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`, {
        stack: err.stack,
        name: err.name
      });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected - attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected successfully');
    });

    mongoose.connection.on('connecting', () => {
      logger.info('MongoDB connecting...');
    });

    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected');
    });

    // Monitor connection pool usage
    setInterval(() => {
      const poolSize = mongoose.connection.readyState === 1 
        ? mongoose.connection.db?.serverConfig?.poolSize || 0 
        : 0;
      const activeConnections = mongoose.connection.readyState === 1
        ? mongoose.connection.db?.serverConfig?.s?.pool?.totalConnectionCount || 0
        : 0;
      
      if (poolSize > 0 || activeConnections > 0) {
        logger.debug(`MongoDB Pool Status: active=${activeConnections}, max=${maxPoolSize}`);
      }
    }, 60000); // Log every minute

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;

