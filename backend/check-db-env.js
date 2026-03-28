import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EnvironmentVariable from './modules/admin/models/EnvironmentVariable.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function checkEnv() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const envVars = await EnvironmentVariable.findOne();
    if (!envVars) {
      console.log('❌ No environment variables found in DB');
      process.exit(1);
    }

    const data = envVars.toEnvObject();
    console.log('📊 FCM Config in DB:');
    console.log('   FIREBASE_PROJECT_ID:', data.FIREBASE_PROJECT_ID);
    console.log('   FIREBASE_CLIENT_EMAIL:', data.FIREBASE_CLIENT_EMAIL);
    console.log('   FIREBASE_PRIVATE_KEY is present:', !!data.FIREBASE_PRIVATE_KEY);
    if (data.FIREBASE_PRIVATE_KEY) {
      console.log('   FIREBASE_PRIVATE_KEY start:', data.FIREBASE_PRIVATE_KEY.substring(0, 30));
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkEnv();
