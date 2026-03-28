import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EnvironmentVariable from './modules/admin/models/EnvironmentVariable.js';
import { clearEnvCache } from './shared/utils/envService.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function updateCredentials() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const envVars = await EnvironmentVariable.getOrCreate();
    
    console.log('🔄 Updating Firebase credentials in database...');
    
    envVars.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
    envVars.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
    envVars.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
    envVars.FIREBASE_VAPID_KEY = "BOJYkw1hoH8YO0OMNOnRs5UGHvnSsxZmLccoTYsvWQwMaEDt_xbDelYDdFGvyA6uLG7WbLYUcHsdSUEL9Tp2jf8";
    
    // Also ensuring other fields are set if they were missing
    envVars.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
    envVars.FIREBASE_AUTH_DOMAIN = process.env.FIREBASE_AUTH_DOMAIN;
    envVars.FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
    envVars.FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID;
    envVars.FIREBASE_APP_ID = process.env.FIREBASE_APP_ID;
    envVars.MEASUREMENT_ID = process.env.MEASUREMENT_ID;

    envVars.markModified('FIREBASE_PROJECT_ID');
    envVars.markModified('FIREBASE_CLIENT_EMAIL');
    envVars.markModified('FIREBASE_PRIVATE_KEY');
    envVars.markModified('FIREBASE_VAPID_KEY');
    envVars.markModified('FIREBASE_API_KEY');
    envVars.markModified('FIREBASE_AUTH_DOMAIN');
    envVars.markModified('FIREBASE_STORAGE_BUCKET');
    envVars.markModified('FIREBASE_MESSAGING_SENDER_ID');
    envVars.markModified('FIREBASE_APP_ID');
    envVars.markModified('MEASUREMENT_ID');

    await envVars.save();
    console.log('✅ Firebase credentials updated in database and encrypted!');
    
    clearEnvCache();
    console.log('🧹 Environment cache cleared');

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating credentials:', err);
    process.exit(1);
  }
}

updateCredentials();
