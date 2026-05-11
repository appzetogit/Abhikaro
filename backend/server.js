// Load .env before any other local imports (ESM hoists imports; dotenv must run first)
import "dotenv/config";

// Redis is currently unstable/misconfigured in deployment and is not required for core functionality.
// Force-disable Redis so Bull/Redis adapter/rate-limit Redis client never connect.
process.env.REDIS_ENABLED = 'false';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import mongoose from 'mongoose';

// Import configurations
import { connectDB } from './config/database.js';
import { connectRedis, getRedisClient } from './config/redis.js';
// Import Redis rate limiting
import { userRateLimit, ipRateLimit, strictRateLimit } from './shared/middleware/redisRateLimit.js';

// Import middleware
import { errorHandler } from './shared/middleware/errorHandler.js';
import { performanceMonitor } from './shared/middleware/performanceMonitor.js';

// Import routes
import authRoutes from './modules/auth/index.js';
import userRoutes from './modules/user/index.js';
import restaurantRoutes from './modules/restaurant/index.js';
import hotelRoutes from './modules/hotel/index.js';
import deliveryRoutes from './modules/delivery/index.js';
import orderRoutes from './modules/order/index.js';
import paymentRoutes from './modules/payment/index.js';
import menuRoutes from './modules/menu/index.js';
import campaignRoutes from './modules/campaign/index.js';
import notificationRoutes from './modules/notification/index.js';
import fcmRoutes from './modules/fcm/index.js';
import analyticsRoutes from './modules/analytics/index.js';
import adminRoutes from './modules/admin/index.js';
import categoryPublicRoutes from './modules/admin/routes/categoryPublicRoutes.js';
import feeSettingsPublicRoutes from './modules/admin/routes/feeSettingsPublicRoutes.js';
import envPublicRoutes from './modules/admin/routes/envPublicRoutes.js';
import aboutPublicRoutes from './modules/admin/routes/aboutPublicRoutes.js';
import businessSettingsPublicRoutes from './modules/admin/routes/businessSettingsPublicRoutes.js';
import termsPublicRoutes from './modules/admin/routes/termsPublicRoutes.js';
import deliveryTermsPublicRoutes from './modules/admin/routes/deliveryTermsPublicRoutes.js';
import hotelTermsPublicRoutes from './modules/admin/routes/hotelTermsPublicRoutes.js';
import hotelPrivacyPublicRoutes from './modules/admin/routes/hotelPrivacyPublicRoutes.js';
import deliveryPrivacyPublicRoutes from './modules/admin/routes/deliveryPrivacyPublicRoutes.js';
import privacyPublicRoutes from './modules/admin/routes/privacyPublicRoutes.js';
import refundPublicRoutes from './modules/admin/routes/refundPublicRoutes.js';
import shippingPublicRoutes from './modules/admin/routes/shippingPublicRoutes.js';
import cancellationPublicRoutes from './modules/admin/routes/cancellationPublicRoutes.js';
import feedbackPublicRoutes from './modules/admin/routes/feedbackPublicRoutes.js';
import feedbackExperiencePublicRoutes from './modules/admin/routes/feedbackExperiencePublicRoutes.js';
import customerContactPublicRoutes from './modules/admin/routes/customerContactPublicRoutes.js';
import safetyEmergencyPublicRoutes from './modules/admin/routes/safetyEmergencyPublicRoutes.js';
import zonePublicRoutes from './modules/admin/routes/zonePublicRoutes.js';
import subscriptionRoutes from './modules/subscription/index.js';
import uploadModuleRoutes from './modules/upload/index.js';
import locationRoutes from './modules/location/index.js';
import heroBannerRoutes from './modules/heroBanner/index.js';
import diningRoutes from './modules/dining/index.js';
import diningAdminRoutes from './modules/dining/routes/diningAdminRoutes.js';
import chatRoutes from './modules/chat/routes/chatRoutes.js';
import firebaseSwRoute from './routes/firebaseSwRoute.js';
import metricsRoutes from './routes/metrics.js';
import advertiseBannerPublicRoutes from './modules/admin/routes/advertiseBannerPublicRoutes.js';


// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = [];

requiredEnvVars.forEach(varName => {
  let value = process.env[varName];

  // Remove quotes if present (dotenv sometimes includes them)
  if (value && typeof value === 'string') {
    value = value.trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    }
  }

  // Update the env var with cleaned value
  if (value) {
    process.env[varName] = value;
  }

  // Check if valid
  if (!value || value === '' || (varName === 'JWT_SECRET' && value.includes('your-super-secret'))) {
    missingEnvVars.push(varName);
  }
});

if (missingEnvVars.length > 0) {
  console.error('❌ Missing or invalid required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}${varName === 'JWT_SECRET' ? ' (must be set to a secure value, not the placeholder)' : ''}`);
  });
  console.error('\nPlease update your .env file with valid values.');
  console.error('You can copy .env.example to .env and update the values.\n');
  process.exit(1);
}

// Initialize Express app
const app = express();

// Trust proxy - CRITICAL for rate limiting when behind Nginx/Heroku/Load Balancer
// This ensures req.ip correctly identifies the client instead of the proxy
app.set('trust proxy', 1);

const httpServer = createServer(app);

// Simple env flag to avoid heavy logging in production hot paths
const isDev = (process.env.NODE_ENV || 'development') !== 'production';

// Initialize Socket.IO with proper CORS configuration
const allowedSocketOrigins = [
  process.env.CORS_ORIGIN,
  'https://foods.abhikaro.in',
  'https://www.foods.abhikaro.in',
  'https://api.foods.abhikaro.in',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
].filter(Boolean); // Remove undefined values

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        console.log('✅ Socket.IO: Allowing connection with no origin');
        return callback(null, true);
      }

      // Check if origin is in allowed list
      const isTrustedAkhOrigin =
        typeof origin === "string" &&
        (origin.endsWith(".abhikaro.in") || origin.includes("localhost") || origin.includes("127.0.0.1"))

      if (allowedSocketOrigins.includes(origin) || isTrustedAkhOrigin) {
        console.log(`✅ Socket.IO: Allowing connection from: ${origin}`);
        callback(null, true);
      } else {
        // In development, allow all localhost origins
        if (process.env.NODE_ENV !== 'production') {
          if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            console.log(`✅ Socket.IO: Allowing localhost connection from: ${origin}`);
            return callback(null, true);
          }
          // Allow all origins in development for easier debugging
          console.log(`⚠️ Socket.IO: Allowing connection from: ${origin} (development mode)`);
          return callback(null, true);
        } else {
          console.error(`❌ Socket.IO: Blocking connection from: ${origin} (not in allowed list)`);
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-refresh-token',
    ]
  },
  transports: ['polling', 'websocket'], // Polling first, then upgrade to websocket
  allowEIO3: true, // Allow Engine.IO v3 clients for compatibility
  path: '/socket.io/', // Explicitly set Socket.IO path
  connectTimeout: 45000, // Increase connection timeout
  pingTimeout: 20000,
  pingInterval: 25000
});

// Export getIO function for use in other modules
export function getIO() {
  return io;
}

// Restaurant namespace for order notifications
const restaurantNamespace = io.of('/restaurant');

// Add connection error handling before connection event
restaurantNamespace.use((socket, next) => {
  try {
    // Log connection attempt
    console.log('🍽️ Restaurant connection attempt:', {
      socketId: socket.id,
      auth: socket.handshake.auth,
      query: socket.handshake.query,
      origin: socket.handshake.headers.origin,
      userAgent: socket.handshake.headers['user-agent']
    });

    // Allow all connections - authentication can be handled later if needed
    // The token is passed in auth.token but we don't validate it here
    // to avoid blocking connections unnecessarily
    next();
  } catch (error) {
    console.error('❌ Error in restaurant namespace middleware:', error);
    next(error);
  }
});

restaurantNamespace.on('connection', (socket) => {
  console.log('🍽️ Restaurant client connected:', socket.id);
  console.log('🍽️ Socket auth:', socket.handshake.auth);
  console.log('🍽️ Socket query:', socket.handshake.query);
  console.log('🍽️ Socket headers:', socket.handshake.headers);

  // Restaurant joins their room
      socket.on('join-restaurant', (restaurantId) => {
    if (restaurantId) {
      // Normalize restaurantId to string (handle both ObjectId and string)
      const normalizedRestaurantId = restaurantId?.toString() || restaurantId;
      const room = `restaurant:${normalizedRestaurantId}`;

      // Log room join attempt with detailed info
      console.log(`🍽️ Restaurant attempting to join room:`, {
        restaurantId: restaurantId,
        normalizedRestaurantId: normalizedRestaurantId,
        room: room,
        socketId: socket.id,
        socketAuth: socket.handshake.auth
      });

      socket.join(room);
      const roomSize = restaurantNamespace.adapter.rooms.get(room)?.size || 0;
      console.log(`✅ Restaurant ${normalizedRestaurantId} joined room: ${room}`);
      console.log(`📊 Total sockets in room ${room}: ${roomSize}`);

      // Also join with ObjectId format if it's a valid ObjectId (for compatibility)
      if (mongoose.Types.ObjectId.isValid(normalizedRestaurantId)) {
        const objectIdRoom = `restaurant:${new mongoose.Types.ObjectId(normalizedRestaurantId).toString()}`;
        if (objectIdRoom !== room) {
          socket.join(objectIdRoom);
          const objectIdRoomSize = restaurantNamespace.adapter.rooms.get(objectIdRoom)?.size || 0;
          console.log(`✅ Restaurant also joined ObjectId room: ${objectIdRoom} (${objectIdRoomSize} sockets)`);
        }
      }

      // Send confirmation back to client
      socket.emit('restaurant-room-joined', {
        restaurantId: normalizedRestaurantId,
        room: room,
        socketId: socket.id
      });
      
      // Log all rooms this socket is now in
      const socketRooms = Array.from(socket.rooms).filter(r => r.startsWith('restaurant:'));
      console.log(`📋 Socket ${socket.id} is now in restaurant rooms:`, socketRooms);
    } else {
      console.warn('⚠️ Restaurant tried to join without restaurantId');
      console.warn('⚠️ Socket ID:', socket.id);
      console.warn('⚠️ Socket auth:', socket.handshake.auth);
    }
  });

  socket.on('disconnect', () => {
    console.log('🍽️ Restaurant client disconnected:', socket.id);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('🍽️ Restaurant socket error:', error);
  });
});

// Delivery namespace for order assignments
const deliveryNamespace = io.of('/delivery');

deliveryNamespace.on('connection', (socket) => {
  console.log('🚴 Delivery client connected:', socket.id);
  console.log('🚴 Socket auth:', socket.handshake.auth);

  // Delivery boy joins their room
  socket.on('join-delivery', (deliveryId) => {
    if (deliveryId) {
      // Normalize deliveryId to string (handle both ObjectId and string)
      const normalizedDeliveryId = deliveryId?.toString() || deliveryId;
      const room = `delivery:${normalizedDeliveryId}`;

      socket.join(room);
      console.log(`🚴 Delivery partner ${normalizedDeliveryId} joined room: ${room}`);
      console.log(`🚴 Total sockets in room ${room}:`, deliveryNamespace.adapter.rooms.get(room)?.size || 0);

      // Also join with ObjectId format if it's a valid ObjectId (for compatibility)
      if (mongoose.Types.ObjectId.isValid(normalizedDeliveryId)) {
        const objectIdRoom = `delivery:${new mongoose.Types.ObjectId(normalizedDeliveryId).toString()}`;
        if (objectIdRoom !== room) {
          socket.join(objectIdRoom);
          console.log(`🚴 Delivery partner also joined ObjectId room: ${objectIdRoom}`);
        }
      }

      // Send confirmation back to client
      socket.emit('delivery-room-joined', {
        deliveryId: normalizedDeliveryId,
        room: room,
        socketId: socket.id
      });
    } else {
      console.warn('⚠️ Delivery partner tried to join without deliveryId');
    }
  });

  socket.on('disconnect', () => {
    console.log('🚴 Delivery client disconnected:', socket.id);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('🚴 Delivery socket error:', error);
  });
});

// Make io available to routes
app.set('io', io);

// Connect to databases
import { initializeCloudinary } from './config/cloudinary.js';
import { initializeFirebaseRealtime } from './config/firebaseRealtime.js';

// Connect to databases
connectDB().then(async () => {
  // Initialize Firebase Realtime Database after DB connection (credentials are in DB)
  try {
    console.log('🔥 Initializing Firebase Realtime Database...');
    const db = await initializeFirebaseRealtime();
    if (db) {
      console.log('✅ Firebase Realtime Database initialized successfully');
    } else {
      console.warn('⚠️ Firebase Realtime Database initialization returned null - check credentials in Admin Panel');
    }
  } catch (error) {
    console.error('❌ CRITICAL: Firebase Realtime Database initialization failed:', error);
    console.error('⚠️ Server will continue but Firebase features may not work');
    console.error('💡 Make sure Firebase credentials are set in Admin Panel → System → Environment Variables');
  }
  
  // Initialize Cloudinary after DB connection
  initializeCloudinary().catch(err => console.error('Failed to initialize Cloudinary:', err));
});

// Redis connection is optional - only connects if REDIS_ENABLED=true
connectRedis().then(async (redisClient) => {
  const redisEnabled = ['true', '1', 'yes'].includes(String(process.env.REDIS_ENABLED || '').toLowerCase());
  if (!redisEnabled) return;

  if (redisClient && redisClient.isOpen) {
    // Enable Socket.IO Redis adapter for multi-server scaling
    try {
      const pubClient = redisClient;
      const subClient = redisClient.duplicate();
      await subClient.connect();

      const { createAdapter } = await import('@socket.io/redis-adapter');
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.IO Redis adapter enabled - Multi-server scaling ready');
    } catch (error) {
      console.warn('⚠️ Socket.IO Redis adapter failed:', error.message);
      console.warn('⚠️ Socket.IO will work in single-server mode only');
    }

    // Initialize queue system
    try {
      const { initializeQueues } = await import('./shared/queues/index.js');
      const queues = await initializeQueues();
      if (queues) {
        console.log('✅ Queue system initialized successfully');
      }
    } catch (error) {
      console.warn('⚠️ Queue system initialization failed:', error.message);
      console.warn('⚠️ Async processing will be disabled');
    }
  }
}).catch(() => {
  // Silently handle Redis connection failures
  // The app works without Redis
  console.log('⚠️ Redis not available - Socket.IO will work in single-server mode');
});

// Serve static files from 'public' directory (e.g., audio, images)
app.use(express.static('public'));

// Secure headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'", // Required for Firebase and some React features
        "https://www.gstatic.com", // Firebase SDK
        "https://www.google.com", // Google services
        "https://apis.google.com", // Google API for sign-in
        "https://maps.googleapis.com", // Google Maps
        "https://checkout.razorpay.com", // Razorpay checkout
        "https://cdn.razorpay.com", // Razorpay risk detection bundle
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:",
        "http:",
      ],
      connectSrc: [
        "'self'",
        "https://apis.google.com",
        "https://api.foods.abhikaro.in",
        "https://api.razorpay.com",
        "https://lumberjack.razorpay.com",
        "https://www.googleapis.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://firebase.googleapis.com",
        "https://fcm.googleapis.com",
        "https://*.googleapis.com",
        "https://api.bigdatacloud.net", // For reverse geocoding
        "ws://localhost:*",
        "ws://api.foods.abhikaro.in",
        "wss://api.foods.abhikaro.in",
        "http://localhost:*",
      ],
      frameSrc: [
        "'self'",
        "https://www.google.com",
        "https://accounts.google.com", // Google sign-in iframe
      ],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Firebase to work
}));
// CORS configuration - allow multiple origins
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'https://foods.abhikaro.in',
  'https://www.foods.abhikaro.in',
  'https://api.foods.abhikaro.in',
  'http://foods.abhikaro.in',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow localhost origins and all origins for easier debugging
    if (process.env.NODE_ENV === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      // Allow all origins in development for easier debugging
      return callback(null, true);
    }

    // In production, strictly enforce allowed origins
    const isTrustedAkhOrigin =
      typeof origin === "string" &&
      (origin.endsWith(".abhikaro.in") || origin.includes("localhost") || origin.includes("127.0.0.1"))

    if (allowedOrigins.indexOf(origin) !== -1 || isTrustedAkhOrigin) {
      callback(null, true);
    } else {
      console.error(`❌ CORS blocked origin in production: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-refresh-token',
  ]
}));

// Response compression - Reduces bandwidth by 50%
app.use(compression({
  level: 6, // Compression level (1-9, 6 is good balance)
  filter: (req, res) => {
    // Compress all responses except if explicitly disabled
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Performance monitoring middleware (should be early in the chain)
app.use(performanceMonitor);

// Request timeout middleware (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout'
      });
    }
  });
  next();
});

// Body parsing middleware
// IMPORTANT: Razorpay webhook requires the raw request body for signature verification.
// It MUST be registered BEFORE express.json()/urlencoded(), otherwise the body is consumed
// and signature verification will fail intermittently (leading to "payment success but order missing").
app.use('/api/payment/razorpay/webhook', express.raw({ type: '*/*' }));
// Preserve the exact raw bytes for downstream handlers (some middleware may touch req.body).
app.use('/api/payment/razorpay/webhook', (req, _res, next) => {
  req.razorpayRawBody = req.body;
  next();
});
// Also, we MUST SKIP the JSON/urlencoded parsers for this webhook route, otherwise they will
// re-parse the raw Buffer and overwrite `req.body`, breaking signature verification.
const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '10mb' });
app.use((req, res, next) => {
  if (req.originalUrl?.startsWith('/api/payment/razorpay/webhook')) return next();
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl?.startsWith('/api/payment/razorpay/webhook')) return next();
  return urlencodedParser(req, res, next);
});
app.use(cookieParser());

// Data sanitization
// Skip sanitization for Razorpay webhook because it mutates `req.body` and breaks signature verification.
const mongoSanitizeMiddleware = mongoSanitize();
app.use((req, res, next) => {
  if (req.originalUrl?.startsWith('/api/payment/razorpay/webhook')) return next();
  return mongoSanitizeMiddleware(req, res, next);
});

// Rate limiting - Hardened Redis-based rolling window (supports 5000+ users)
// Role-based tiered limits with automatic fail-open if Redis is unavailable
const { tieredUserRateLimit } = await import('./shared/middleware/redisRateLimit.js');
app.use('/api/', tieredUserRateLimit);
console.log('✅ Hardened Redis-based tiered rate limiting enabled (role-based)');

// Strict rate limiting for sensitive endpoints (OTP, login, etc.)
app.use('/api/auth/send-otp', strictRateLimit);
app.use('/api/auth/verify-otp', strictRateLimit);
app.use('/api/auth/login', strictRateLimit);
app.use('/api/auth/register', strictRateLimit);

// Request deduplication middleware for GET endpoints (reduces duplicate polling requests)
// Enabled in all environments so behaviour is consistent between dev and production
{
  const { requestDeduplication } = await import('./shared/middleware/requestDeduplication.js');
  app.use('/api/', requestDeduplication({
    windowMs: 3000, // 3 second deduplication window for better coverage
    excludePaths: [
      '/auth/',
      '/admin/',
      '/restaurant/orders',
      '/order/',
      '/delivery/',
      '/hotel/orders'
    ]
  }));
  console.log('✅ Request deduplication middleware enabled');
}

// Health check routes for load balancer
app.get('/health', async (req, res) => {
  try {
    const { getHealthStatus } = await import('./config/loadBalancer.js');
    const health = await getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API health check (used by frontend reverse-proxy setups where only /api is routed to backend)
app.get('/api/health', async (req, res) => {
  try {
    const { getHealthStatus } = await import('./config/loadBalancer.js');
    const health = await getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness probe (for Kubernetes/Docker)
app.get('/ready', async (req, res) => {
  try {
    const { isReady } = await import('./config/loadBalancer.js');
    const ready = await isReady();
    res.status(ready ? 200 : 503).json({
      ready,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness probe
app.get('/live', async (req, res) => {
  try {
    const { isAlive } = await import('./config/loadBalancer.js');
    const alive = isAlive();
    res.status(alive ? 200 : 503).json({
      alive,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      alive: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// FCM service worker - must be at root path for Firebase SDK
app.use(firebaseSwRoute);

// API routes
app.use('/api', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/hotel', hotelRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/campaign', campaignRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/fcm', fcmRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', categoryPublicRoutes);
app.use('/api', feeSettingsPublicRoutes);
app.use('/api/env', envPublicRoutes);
app.use('/api', aboutPublicRoutes);
app.use('/api', businessSettingsPublicRoutes);
app.use('/api', termsPublicRoutes);
app.use('/api', deliveryTermsPublicRoutes);
app.use('/api', hotelTermsPublicRoutes);
app.use('/api', hotelPrivacyPublicRoutes);
app.use('/api', deliveryPrivacyPublicRoutes);
app.use('/api', privacyPublicRoutes);
app.use('/api', refundPublicRoutes);
app.use('/api', shippingPublicRoutes);
app.use('/api', cancellationPublicRoutes);
app.use('/api', feedbackPublicRoutes);
app.use('/api', feedbackExperiencePublicRoutes);
app.use('/api', customerContactPublicRoutes);
app.use('/api', safetyEmergencyPublicRoutes);
app.use('/api', zonePublicRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api', uploadModuleRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/location', locationRoutes);
app.use('/api', heroBannerRoutes);
app.use('/api/dining', diningRoutes);
app.use('/api/admin/dining', diningAdminRoutes);
app.use('/api', advertiseBannerPublicRoutes);
app.use('/api/metrics', metricsRoutes);

// Diagnostics: list socket rooms for a restaurant (dev only)
if ((process.env.NODE_ENV || 'development') !== 'production') {
  app.get('/api/restaurant/socket-rooms/:restaurantId', async (req, res) => {
    try {
      const restaurantId = req.params.restaurantId;
      const normalized = restaurantId?.toString() || restaurantId;
      const variations = [
        `restaurant:${normalized}`,
        ...(mongoose.Types.ObjectId.isValid(normalized)
          ? [`restaurant:${new mongoose.Types.ObjectId(normalized).toString()}`]
          : [])
      ];

      const result = [];
      const namespaces = [
        { ns: '/restaurant', io: io.of('/restaurant') },
        { ns: '/', io: io.of('/') },
      ];

      for (const { ns, io: nsp } of namespaces) {
        for (const room of variations) {
          try {
            const sockets = await nsp.in(room).fetchSockets();
            result.push({ ns, room, sockets: sockets.length });
          } catch (e) {
            result.push({ ns, room, error: e?.message || 'fetch error' });
          }
        }
      }

      res.json({ success: true, restaurantId: normalized, rooms: result });
    } catch (e) {
      res.status(500).json({ success: false, message: e?.message || 'error' });
    }
  });
}

// 404 handler - but skip Socket.IO paths
app.use((req, res, next) => {
  // Skip Socket.IO paths - Socket.IO handles its own routing
  if (req.path.startsWith('/socket.io/') || req.path.startsWith('/restaurant') || req.path.startsWith('/delivery')) {
    return next();
  }

  // Log 404 errors for debugging (especially for admin routes)
  if (req.path.includes('/admin') || req.path.includes('refund')) {
    console.error('❌ [404 HANDLER] Route not found:', {
      method: req.method,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      route: req.route?.path,
      registeredRoutes: 'Check server startup logs for route registration'
    });
    console.error('💡 [404 HANDLER] Expected route: POST /api/admin/refund-requests/:orderId/process');
    console.error('💡 [404 HANDLER] Make sure:');
    console.error('   1. Backend server has been restarted');
    console.error('   2. Route is registered (check startup logs)');
    console.error('   3. Authentication token is valid');
  }

  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method,
    expectedRoute: req.path.includes('refund') ? 'POST /api/admin/refund-requests/:orderId/process' : undefined
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Delivery boy sends location update
  socket.on('update-location', (data) => {
    try {
      // Validate data
      if (!data.orderId || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
        console.error('Invalid location update data:', data);
        return;
      }

      // Broadcast location to customer tracking this order (only to specific room)
      // Format: { orderId, lat, lng, heading }
      const locationData = {
        orderId: data.orderId,
        lat: data.lat,
        lng: data.lng,
        heading: data.heading || 0,
        timestamp: Date.now()
      };

      // Send to specific order room
      io.to(`order:${data.orderId}`).emit(`location-receive-${data.orderId}`, locationData);

      // Also broadcast to the "other" order identifier room (Mongo _id <-> ORD-xxx)
      // so user tracking stays in sync with delivery app even if they use different IDs.
      (async () => {
        try {
          const { default: Order } = await import('./modules/order/models/Order.js');
          let order = null;
          if (mongoose.Types.ObjectId.isValid(String(data.orderId)) && String(data.orderId).length === 24) {
            order = await Order.findById(data.orderId).select('_id orderId').lean();
          } else {
            order = await Order.findOne({ orderId: String(data.orderId) }).select('_id orderId').lean();
          }
          if (!order) return;

          const altIds = new Set([
            order?._id?.toString(),
            order?.orderId?.toString(),
          ].filter(Boolean));
          // Emit to all IDs (including original) to guarantee room coverage
          altIds.forEach((id) => {
            io.to(`order:${id}`).emit(`location-receive-${id}`, {
              ...locationData,
              orderId: id,
            });
          });
        } catch (e) {
          console.error('Error broadcasting alt order id location:', e?.message || e);
        }
      })();

      if (isDev) {
        console.log(`📍 Location broadcasted to order room ${data.orderId}:`, {
          lat: locationData.lat,
          lng: locationData.lng,
          heading: locationData.heading
        });

        console.log(`📍 Location update for order ${data.orderId}:`, {
          lat: data.lat,
          lng: data.lng,
          heading: data.heading
        });
      }
    } catch (error) {
      console.error('Error handling location update:', error);
    }
  });

  // Customer joins order tracking room
  socket.on('join-order-tracking', async (orderId) => {
    if (orderId) {
      // Always join both mongo _id and string orderId rooms (ID-agnostic)
      socket.join(`order:${orderId}`);
      try {
        const { default: Order } = await import('./modules/order/models/Order.js');
        const order = (mongoose.Types.ObjectId.isValid(String(orderId)) && String(orderId).length === 24)
          ? await Order.findById(orderId).select('_id orderId').lean()
          : await Order.findOne({ orderId: String(orderId) }).select('_id orderId').lean();

        if (order?._id) socket.join(`order:${order._id.toString()}`);
        if (order?.orderId) socket.join(`order:${order.orderId.toString()}`);
      } catch (e) {
        console.error('Error resolving order rooms for join-order-tracking:', e?.message || e);
      }

      console.log(`Customer joined order tracking: ${orderId}`);

      // Send current location immediately when customer joins
      try {
        // Dynamic import to avoid circular dependencies
        const { default: Order } = await import('./modules/order/models/Order.js');

        const order = (mongoose.Types.ObjectId.isValid(String(orderId)) && String(orderId).length === 24)
          ? await Order.findById(orderId)
          : await Order.findOne({ orderId: String(orderId) })
          .populate({
            path: 'deliveryPartnerId',
            select: 'availability',
            populate: {
              path: 'availability.currentLocation'
            }
          })
          .lean();

        if (order?.deliveryPartnerId?.availability?.currentLocation) {
          const coords = order.deliveryPartnerId.availability.currentLocation.coordinates;
          const locationData = {
            orderId,
            lat: coords[1],
            lng: coords[0],
            heading: 0,
            timestamp: Date.now()
          };

          // Send current location immediately
          socket.emit(`current-location-${orderId}`, locationData);
          console.log(`📍 Sent current location to customer for order ${orderId}`);

          // Also emit to the alternate id channel so whichever id the client listens to gets it.
          const altIds = new Set([
            order?._id?.toString(),
            order?.orderId?.toString(),
          ].filter(Boolean));
          altIds.forEach((id) => {
            socket.emit(`current-location-${id}`, {
              ...locationData,
              orderId: id,
            });
          });
        }
      } catch (error) {
        console.error('Error sending current location:', error.message);
      }
    }
  });

  // Handle request for current location
  socket.on('request-current-location', async (orderId) => {
    if (!orderId) return;

    try {
      // Dynamic import to avoid circular dependencies
      const { default: Order } = await import('./modules/order/models/Order.js');

      const order = (mongoose.Types.ObjectId.isValid(String(orderId)) && String(orderId).length === 24)
        ? await Order.findById(orderId)
        : await Order.findOne({ orderId: String(orderId) })
        .populate({
          path: 'deliveryPartnerId',
          select: 'availability'
        })
        .lean();

      if (order?.deliveryPartnerId?.availability?.currentLocation) {
        const coords = order.deliveryPartnerId.availability.currentLocation.coordinates;
        const locationData = {
          orderId,
          lat: coords[1],
          lng: coords[0],
          heading: 0,
          timestamp: Date.now()
        };

        // Send current location immediately
        socket.emit(`current-location-${orderId}`, locationData);
        console.log(`📍 Sent requested location for order ${orderId}`);

        // Also emit to the alternate id channel for robustness
        const altIds = new Set([
          order?._id?.toString(),
          order?.orderId?.toString(),
        ].filter(Boolean));
        altIds.forEach((id) => {
          socket.emit(`current-location-${id}`, {
            ...locationData,
            orderId: id,
          });
        });
      }
    } catch (error) {
      console.error('Error fetching current location:', error.message);
    }
  });

  // Chat functionality
  // Join chat room for an order
  socket.on('join-chat', async (orderId) => {
    if (orderId) {
      // Join with string orderId (could be MongoDB _id or custom orderId string)
      socket.join(`order:${orderId}`);
      console.log(`✅ User/Delivery joined chat room: order:${orderId}`);
      
      // Resolve and join both canonical rooms (mongo _id + orderId string)
      try {
        const { default: Order } = await import('./modules/order/models/Order.js');
        const order = (mongoose.Types.ObjectId.isValid(String(orderId)) && String(orderId).length === 24)
          ? await Order.findById(orderId).select('_id orderId').lean()
          : await Order.findOne({ orderId: String(orderId) }).select('_id orderId').lean();

        if (order?._id) {
          const mongoId = order._id.toString();
          socket.join(`order:${mongoId}`);
          console.log(`✅ Also joined chat mongo room: order:${mongoId}`);
        }
        if (order?.orderId) {
          const strId = order.orderId.toString();
          socket.join(`order:${strId}`);
          console.log(`✅ Also joined chat string room: order:${strId}`);
        }
      } catch (e) {
        console.error('Error resolving order rooms for join-chat:', e?.message || e);
      }
    }
  });

  // Direct message sending via WebSocket (instant chat without HTTP)
  socket.on('send-message', async (data) => {
    try {
      const { orderId, message } = data;
      
      if (!orderId || !message || !message.trim()) {
        socket.emit('message-error', { error: 'Order ID and message are required' });
        return;
      }

      // Get user info from socket (you may need to store this during authentication)
      // For now, we'll use the HTTP endpoint, but this allows for future direct WebSocket messaging
      socket.emit('message-error', { 
        error: 'Please use HTTP endpoint /api/chat/send for now. WebSocket direct messaging coming soon.' 
      });
    } catch (error) {
      console.error('Error in send-message socket handler:', error);
      socket.emit('message-error', { error: error.message });
    }
  });

  // User joins user room for notifications and chat
  socket.on('join-user', (userId) => {
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`✅ User joined user room: ${userId}`);
    }
  });

  // Delivery boy joins delivery room for notifications and chat
  socket.on('join-delivery', (deliveryId) => {
    if (deliveryId) {
      socket.join(`delivery:${deliveryId}`);
      console.log(`✅ Delivery boy joined delivery room: ${deliveryId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

  // Initialize scheduled tasks after DB connection is established
  // Wait a bit for DB to connect, then start cron jobs
  setTimeout(() => {
    initializeScheduledTasks();
  }, 5000);
});

// Initialize scheduled tasks
function initializeScheduledTasks() {
  // Import menu schedule service
  import('./modules/restaurant/services/menuScheduleService.js').then(({ processScheduledAvailability }) => {
    // Run every minute to check for due schedules
    cron.schedule('* * * * *', async () => {
      try {
        const result = await processScheduledAvailability();
        if (result.processed > 0) {
          console.log(`[Menu Schedule Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Menu Schedule Cron] Error:', error);
      }
    });

    console.log('✅ Menu item availability scheduler initialized (runs every minute)');
  }).catch((error) => {
    console.error('❌ Failed to initialize menu schedule service:', error);
  });

  // Import auto-ready service
  import('./modules/order/services/autoReadyService.js').then(({ processAutoReadyOrders }) => {
    // Run every 30 seconds to check for orders that should be marked as ready
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const result = await processAutoReadyOrders();
        if (result.processed > 0) {
          console.log(`[Auto Ready Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Auto Ready Cron] Error:', error);
      }
    });

    console.log('✅ Auto-ready order scheduler initialized (runs every 30 seconds)');
  }).catch((error) => {
    console.error('❌ Failed to initialize auto-ready service:', error);
  });

  // Import auto-reject service
  import('./modules/order/services/autoRejectService.js').then(({ processAutoRejectOrders }) => {
    // Run every 30 seconds to check for orders that should be auto-rejected
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const result = await processAutoRejectOrders();
        if (result.processed > 0) {
          console.log(`[Auto Reject Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Auto Reject Cron] Error:', error);
      }
    });

    console.log('✅ Auto-reject order scheduler initialized (runs every 30 seconds)');
  }).catch((error) => {
    console.error('❌ Failed to initialize auto-reject service:', error);
  });

  // Import auto-cancel-ready service (Ready but not picked up within 1h30m)
  import('./modules/order/services/autoCancelReadyService.js').then(({ processAutoCancelReadyOrders }) => {
    // Run every 5 minutes (cheap + enough for 90-minute threshold)
    cron.schedule('*/5 * * * *', async () => {
      try {
        const result = await processAutoCancelReadyOrders();
        if (result.processed > 0) {
          console.log(`[Auto Cancel Ready Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Auto Cancel Ready Cron] Error:', error);
      }
    });

    console.log('✅ Auto-cancel ready order scheduler initialized (runs every 5 minutes)');
  }).catch((error) => {
    console.error('❌ Failed to initialize auto-cancel-ready service:', error);
  });

  // Import auto-cancel-accepted service (Accepted but not delivered within 2h)
  import('./modules/order/services/autoCancelAcceptedService.js').then(({ processAutoCancelAcceptedOrders }) => {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const result = await processAutoCancelAcceptedOrders();
        if (result.processed > 0) {
          console.log(`[Auto Cancel Accepted Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Auto Cancel Accepted Cron] Error:', error);
      }
    });

    console.log('✅ Auto-cancel accepted order scheduler initialized (runs every 5 minutes)');
  }).catch((error) => {
    console.error('❌ Failed to initialize auto-cancel-accepted service:', error);
  });

  // Expire stale payment intents (runs every minute)
  import('./modules/payment/services/intentExpiryService.js').then(({ expireStalePaymentIntents }) => {
    cron.schedule('* * * * *', async () => {
      try {
        const result = await expireStalePaymentIntents();
        if (result.processed > 0) {
          console.log(`[Payment Intent Expiry Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Payment Intent Expiry Cron] Error:', error);
      }
    });

    console.log('✅ Payment intent expiry scheduler initialized (runs every minute)');
  }).catch((error) => {
    console.error('❌ Failed to initialize payment intent expiry service:', error);
  });
}

// Handle unhandled errors globally
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Graceful shutdown on fatal error
  gracefulShutdown('uncaughtException');
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new requests
  httpServer.close(async () => {
    console.log('📡 HTTP server closed.');
    
    try {
      // Close database connection
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log('📁 MongoDB connection closed.');
      }
      
      // Close Redis connection
      const redisClient = getRedisClient();
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
        console.log('🧠 Redis connection closed.');
      }
      
      console.log('👋 Graceful shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during graceful shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// OS signals for shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
