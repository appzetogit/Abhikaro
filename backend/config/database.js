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
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection Pooling - Critical for scalability
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 50, // Increase from default 10
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 10,
      maxIdleTimeMS: 30000, // Close idle connections after 30 seconds
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if no server available
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      // Read Preference - Support for read replicas
      readPreference: process.env.MONGODB_READ_PREFERENCE || 'primary', // 'primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    logger.info(`MongoDB Connection Pool: max=${conn.connection.maxPoolSize || 50}, min=${conn.connection.minPoolSize || 10}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

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

