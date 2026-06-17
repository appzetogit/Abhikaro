import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import BusinessSettings from '../modules/admin/models/BusinessSettings.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const settings = await BusinessSettings.findOne().sort({ createdAt: -1 }).lean();
  console.log('Business Settings:', JSON.stringify(settings, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
