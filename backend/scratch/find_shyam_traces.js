import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // List all collections
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  console.log('Collections in database:', collectionNames);

  console.log('\n--- 1. Searching for "Shree Shyam" or "Shyam" or the restaurant ID in all collections ---');
  const searchTerms = [
    'Shree shyam',
    'shree shyam',
    'Shyam',
    'shyam',
    '6a312d8fe277d6a8fc17ffc1',
    'REST-1779101567693-2213'
  ];

  for (const name of collectionNames) {
    // Skip system/large indices if any
    if (name.startsWith('system.')) continue;

    try {
      const col = db.collection(name);
      
      // Let's search using a regex or ID check on all fields
      // To be safe, we will search for documents matching any of these strings
      const query = {
        $or: [
          { name: { $regex: /shyam/i } },
          { restaurantName: { $regex: /shyam/i } },
          { restaurantId: { $regex: /shyam/i } },
          { restaurantId: new mongoose.Types.ObjectId('6a312d8fe277d6a8fc17ffc1') },
          { restaurantId: '6a312d8fe277d6a8fc17ffc1' },
          { _id: new mongoose.Types.ObjectId('6a312d8fe277d6a8fc17ffc1') },
          { _id: '6a312d8fe277d6a8fc17ffc1' },
          { ownerName: { $regex: /shyam/i } },
          { description: { $regex: /shyam/i } },
          { text: { $regex: /shyam/i } }
        ]
      };

      const results = await col.find(query).toArray();
      if (results.length > 0) {
        console.log(`\nMatch found in collection "${name}": (${results.length} docs)`);
        results.forEach((doc, idx) => {
          console.log(`  [${idx + 1}] ID: ${doc._id}`);
          if (doc.name) console.log(`      Name: ${doc.name}`);
          if (doc.restaurantName) console.log(`      RestaurantName: ${doc.restaurantName}`);
          if (doc.restaurantId) console.log(`      RestaurantId: ${doc.restaurantId}`);
          if (doc.amount) console.log(`      Amount: ${doc.amount}`);
          if (doc.status) console.log(`      Status: ${doc.status}`);
          if (doc.type) console.log(`      Type: ${doc.type}`);
        });
      }
    } catch (err) {
      // Some collections might fail query due to schema or indices
      // console.log(`Failed to query collection ${name}: ${err.message}`);
    }
  }

  console.log('\n--- 2. Checking if any other restaurant has withdrawal requests ---');
  const allWithdrawals = await db.collection('withdrawalrequests').find({}).toArray();
  console.log(`Total withdrawal requests: ${allWithdrawals.length}`);
  
  await mongoose.disconnect();
}

main().catch(console.error);
