import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const users = await db.collection('users').find({
    $or: [
      { phone: /7219176737/ },
      { phone: /8102086503/ },
      { name: /Kajal/i },
      { name: /Ayush/i }
    ]
  }).toArray();

  console.log(`Found ${users.length} users:`);
  for (const u of users) {
    console.log(`User ID: ${u._id} | Name: ${u.name} | Phone: ${u.phone}`);
    
    // Find all orders for this user
    const orders = await db.collection('orders').find({
      userId: u._id
    }).toArray();
    
    console.log(`  -> Has ${orders.length} orders in DB`);
    for (const o of orders) {
      console.log(`     - Order: ${o.orderId} | Restaurant: ${o.restaurantName} | Total: ${o.pricing?.total} | Status: ${o.status}`);
      console.log(`       Items:`, JSON.stringify(o.items));
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
