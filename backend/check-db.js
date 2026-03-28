import mongoose from 'mongoose';
import EnvironmentVariable from './modules/admin/models/EnvironmentVariable.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ev = await EnvironmentVariable.getOrCreate();
  console.log('--- DB PROJECT ID ---');
  console.log('FIREBASE_PROJECT_ID:', ev.FIREBASE_PROJECT_ID);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
