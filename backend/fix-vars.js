import mongoose from 'mongoose';
import EnvironmentVariable from './modules/admin/models/EnvironmentVariable.js';
import dotenv from 'dotenv';
dotenv.config();

const updateVars = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const envVars = await EnvironmentVariable.getOrCreate();
    
    // EXPLICIT VALUES (NO process.env fallbacks for these critical ones)
    envVars.FIREBASE_PROJECT_ID = 'abhikaro-d2df6';
    envVars.FIREBASE_API_KEY = 'AIzaSyB-4su3CTC0xp2qmjLVTmvw_lkhE4cixpQ';
    envVars.FIREBASE_AUTH_DOMAIN = 'abhikaro-d2df6.firebaseapp.com';
    envVars.FIREBASE_STORAGE_BUCKET = 'abhikaro-d2df6.firebasestorage.app';
    envVars.FIREBASE_MESSAGING_SENDER_ID = '32245733236';
    envVars.FIREBASE_APP_ID = '1:32245733236:web:e27be3db7ea7175a40be21';
    envVars.MEASUREMENT_ID = 'G-EPPC8FXHL9';
    envVars.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@abhikaro-d2df6.iam.gserviceaccount.com';
    envVars.FIREBASE_VAPID_KEY = 'BOJYkw1hoH8YO0OMNOnRs5UGHvnSsxZmLccoTYsvWQwMaEDt_xbDelYDdFGvyA6uLG7WbLYUcHsdSUEL9Tp2jf8';
    envVars.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY; // Large string, keep from env

    // Reset modification flags
    Object.keys(envVars.schema.paths).forEach(key => {
        if (key.includes('FIREBASE') || key === 'MEASUREMENT_ID') {
            envVars.markModified(key);
        }
    });

    await envVars.save();
    console.log('✅ Firebase configuration hard-fixed in database');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  }
};

updateVars();
