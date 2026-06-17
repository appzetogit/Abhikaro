import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

function deepSearch(obj, term) {
  if (obj === null || obj === undefined) return false;
  if (typeof obj === 'string') {
    return obj.toLowerCase().includes(term.toLowerCase());
  }
  if (typeof obj === 'number') {
    return String(obj) === term;
  }
  if (Array.isArray(obj)) {
    return obj.some(item => deepSearch(item, term));
  }
  if (typeof obj === 'object') {
    return Object.values(obj).some(val => deepSearch(val, term));
  }
  return false;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const targetIds = [
    'ORD-1781427300679-102',
    '6a2e6c64a8ddf93186aeb234',
    'ORD-1781061063275-657',
    '6a28d5c784d35ff1dfca0b1c'
  ];

  const collections = await db.listCollections().toArray();
  
  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (['orders', 'ordersettlements', 'auditlogs', 'admincommissions', 'system.indexes'].includes(colName)) {
      continue;
    }

    try {
      const col = db.collection(colName);
      const allDocs = await col.find({}).toArray();
      
      for (const target of targetIds) {
        const matches = allDocs.filter(doc => deepSearch(doc, target));
        if (matches.length > 0) {
          console.log(`\n========================================`);
          console.log(`MATCH FOUND IN "${colName}" for "${target}":`);
          matches.forEach(m => {
            console.log(JSON.stringify(m, null, 2));
          });
        }
      }
    } catch (err) {
      console.log(`Error checking ${colName}: ${err.message}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
