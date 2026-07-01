import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const inspectDocs = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db;
    const oldIdStr = '6a0aef7f6c863eb14688a817';
    const oldObjectId = new mongoose.Types.ObjectId(oldIdStr);

    const collections = [
      'orders',
      'restaurantcommissions',
      'admincommissions',
      'ordersettlements',
      'restaurantcategories'
    ];

    for (const collName of collections) {
      console.log(`\n--- Inspecting collection: ${collName} ---`);
      const coll = db.collection(collName);
      const docs = await coll.find({
        $or: [
          { restaurant: oldObjectId },
          { restaurant: oldIdStr },
          { restaurantId: oldObjectId },
          { restaurantId: oldIdStr }
        ]
      }).limit(2).toArray();

      docs.forEach(doc => {
        console.log(`Doc ID: ${doc._id}`);
        // Log fields containing the old ID
        for (const [key, value] of Object.entries(doc)) {
          if (value && (value.toString() === oldIdStr || (Array.isArray(value) && value.some(v => v && v.toString() === oldIdStr)))) {
            console.log(`  Field [${key}]: ${JSON.stringify(value)}`);
          } else if (value && typeof value === 'object') {
            // Nested object check
            for (const [subKey, subVal] of Object.entries(value)) {
              if (subVal && subVal.toString() === oldIdStr) {
                console.log(`  Nested Field [${key}.${subKey}]: ${JSON.stringify(subVal)}`);
              }
            }
          }
        }
      });
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error inspecting:', error);
    process.exit(1);
  }
};

inspectDocs();
