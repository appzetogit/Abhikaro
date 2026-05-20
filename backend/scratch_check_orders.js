import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CommissionSettings from './modules/admin/models/CommissionSettings.js';

dotenv.config();

async function runCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const settings = await CommissionSettings.findOne().sort({ createdAt: -1 }).lean();
    console.log('Commission Settings in DB:');
    console.log(JSON.stringify(settings, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

runCheck();
