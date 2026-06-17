import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import OrderSettlement from '../modules/order/models/OrderSettlement.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  
  const sampleMissingSettlement = await OrderSettlement.findOne({
    orderNumber: 'ORD-1775660678058-851'
  }).lean();

  console.log('Sample missing settlement details:');
  console.log(JSON.stringify(sampleMissingSettlement, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
