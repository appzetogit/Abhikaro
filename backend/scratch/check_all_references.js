import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const checkReferences = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const oldIdStr = '69d654e7c86eb9b6c8399c62';
    const oldObjectId = new mongoose.Types.ObjectId(oldIdStr);

    console.log(`Searching all collections for references to restaurant ID: ${oldIdStr}\n`);

    for (const collInfo of collections) {
      const collName = collInfo.name;
      
      // Skip system collections
      if (collName.startsWith('system.')) continue;

      const coll = db.collection(collName);

      // Search for any document where any field contains the old ID (either as ObjectId or string)
      const query = {
        $or: [
          { $jsonSchema: { required: [] } } // fallback, we will build a query below
        ]
      };

      // Since we don't know the schema dynamically, let's query for common fields:
      // 'restaurant', 'restaurantId', 'hotel', 'hotelId', 'user', 'userId', '_id' etc.
      // or we can search for the values recursively/globally if Mongoose allows,
      // but an easier way in MongoDB is to search for common field names or search by value.
      // A simple find query checking if any field matches the ObjectId or string:
      const matches = await coll.find({
        $or: [
          { restaurant: oldObjectId },
          { restaurant: oldIdStr },
          { restaurantId: oldObjectId },
          { restaurantId: oldIdStr },
          { _id: oldObjectId },
          { _id: oldIdStr }
        ]
      }).toArray();

      if (matches.length > 0) {
        console.log(`Collection [${collName}]: Found ${matches.length} document(s) referencing old ID.`);
        matches.forEach(doc => {
          console.log(`  - Doc ID: ${doc._id}`);
        });
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error checking references:', error);
    process.exit(1);
  }
};

checkReferences();
