import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const allWithdrawals = await db.collection('withdrawalrequests').find({}).toArray();
  console.log(`📋 Total withdrawal requests found: ${allWithdrawals.length}`);

  allWithdrawals.forEach((w, idx) => {
    console.log(`\n${idx + 1}. Request ID: ${w._id}`);
    console.log(`   Restaurant ID  : ${w.restaurantId}`);
    console.log(`   Restaurant Name: ${w.restaurantName}`);
    console.log(`   Amount         : ₹${w.amount}`);
    console.log(`   Status         : ${w.status}`);
    console.log(`   Requested At   : ${w.requestedAt || w.createdAt}`);
    console.log(`   Payment Method : ${w.paymentMethod}`);
    console.log(`   UPI ID         : ${w.upiId || 'N/A'}`);
    console.log(`   Bank details   : Account: ${w.bankDetails?.accountNumber || 'N/A'}, Holder: ${w.bankDetails?.accountHolderName || 'N/A'}, IFSC: ${w.bankDetails?.ifscCode || 'N/A'}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
