import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const searchTerms = [
    '1658',
    '562',
    'Kajal',
    'Ayush',
    '918102086503',
    '917219176737',
    'ORD-1781427300679-102',
    'ORD-1781061063275-657'
  ];

  const collections = await db.listCollections().toArray();
  console.log(`Searching across all ${collections.length} collections...`);

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (['orders', 'ordersettlements', 'auditlogs', 'admincommissions', 'system.indexes'].includes(colName)) continue;

    try {
      const col = db.collection(colName);
      
      for (const term of searchTerms) {
        // Build regex
        const regex = new RegExp(term, 'i');
        
        // Find one doc matching term in any string field, or ID field, or nested field
        const query = {
          $or: [
            { _id: term },
            { _id: term.length === 24 ? new mongoose.Types.ObjectId(term) : null },
            { name: regex },
            { text: regex },
            { message: regex },
            { phone: regex },
            { phoneNo: regex },
            { userPhone: regex },
            { customerPhone: regex },
            { description: regex },
            { details: regex },
            { payload: regex },
            { data: regex },
            { orderId: regex }
          ].filter(q => q !== null)
        };

        const docs = await col.find(query).toArray();
        if (docs.length > 0) {
          console.log(`\n[MATCH] Collection "${colName}" has ${docs.length} matches for term "${term}":`);
          docs.forEach((d, idx) => {
            console.log(`  - [${idx+1}] ID: ${d._id}`);
            console.log(JSON.stringify(d, null, 2));
          });
        }
      }
    } catch (err) {
      // Ignore errors from system collections
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
