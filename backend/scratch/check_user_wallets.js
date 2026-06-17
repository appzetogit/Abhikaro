import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const userIds = [
    '6a2e69f5a8ddf93186aeb003', // Kajal
    '6a28d21584d35ff1dfca08a5', // Ayush
    '6a28fb5a84d35ff1dfca2ffb'  // Aayush
  ];

  for (const id of userIds) {
    console.log(`\n========================================`);
    console.log(`Searching userwallet for user: ${id}...`);
    
    const wallet = await db.collection('userwallets').findOne({
      $or: [
        { userId: id },
        { userId: new mongoose.Types.ObjectId(id) }
      ]
    });

    if (wallet) {
      console.log(`Found wallet: Balance: ${wallet.balance}`);
      const transactions = wallet.transactions || [];
      console.log(`Transactions (${transactions.length}):`);
      transactions.forEach(t => {
        console.log(`  - Amount: ${t.amount} | Type: ${t.type} | Desc: ${t.description} | Date: ${t.createdAt}`);
      });
    } else {
      console.log(`No wallet found!`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
