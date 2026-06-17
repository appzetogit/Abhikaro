import { isWithdrawAllowedNow } from '../shared/utils/withdrawSchedule.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  const result = await isWithdrawAllowedNow();
  console.log('Result:', result);
  await mongoose.disconnect();
}

main().catch(console.error);
