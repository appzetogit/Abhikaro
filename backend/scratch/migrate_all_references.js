import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const migrateReferences = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db;
    const oldIdStr = '6a0aef7f6c863eb14688a817';
    const oldObjectId = new mongoose.Types.ObjectId(oldIdStr);
    const newIdStr = '6a312d8fe277d6a8fc17ffc1';
    const newObjectId = new mongoose.Types.ObjectId(newIdStr);

    console.log(`Migrating references from ${oldIdStr} to ${newIdStr}...\n`);

    // 1. orders
    const ordersResult = await db.collection('orders').updateMany(
      { restaurantId: { $in: [oldIdStr, oldObjectId] } },
      { $set: { restaurantId: newIdStr } } // restaurantId is stored as string in orders
    );
    console.log(`Updated 'orders': matched ${ordersResult.matchedCount}, modified ${ordersResult.modifiedCount}`);

    // 2. restaurantcommissions
    const rcResult = await db.collection('restaurantcommissions').updateMany(
      { restaurant: { $in: [oldIdStr, oldObjectId] } },
      { $set: { restaurant: newObjectId } } // store as ObjectId
    );
    console.log(`Updated 'restaurantcommissions': matched ${rcResult.matchedCount}, modified ${rcResult.modifiedCount}`);

    // 3. admincommissions
    const acResult = await db.collection('admincommissions').updateMany(
      { restaurantId: { $in: [oldIdStr, oldObjectId] } },
      { $set: { restaurantId: newObjectId } } // store as ObjectId
    );
    console.log(`Updated 'admincommissions': matched ${acResult.matchedCount}, modified ${acResult.modifiedCount}`);

    // 4. ordersettlements
    const osResult = await db.collection('ordersettlements').updateMany(
      { restaurantId: { $in: [oldIdStr, oldObjectId] } },
      { $set: { restaurantId: newObjectId } } // store as ObjectId
    );
    console.log(`Updated 'ordersettlements': matched ${osResult.matchedCount}, modified ${osResult.modifiedCount}`);

    // 5. restaurantcategories
    const catResult = await db.collection('restaurantcategories').updateMany(
      { restaurant: { $in: [oldIdStr, oldObjectId] } },
      { $set: { restaurant: newObjectId } } // store as ObjectId
    );
    console.log(`Updated 'restaurantcategories': matched ${catResult.matchedCount}, modified ${catResult.modifiedCount}`);

    console.log('\nMigration completed successfully.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
};

migrateReferences();
