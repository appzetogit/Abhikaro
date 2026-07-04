import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log("Connected to database.");

    // Look up delivery partner by phone or name
    // The collection is typically "Delivery" or "DeliveryBoy" or similar, let's list all collections first to find the name
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:");
    collections.forEach(c => console.log(c.name));

    // Inspect 2 existing deliveries
    const Delivery = mongoose.model('Delivery', new mongoose.Schema({}, { strict: false }), 'deliveries');
    const existingDeliveries = await Delivery.find().limit(2).lean();
    console.log("Existing deliveries:");
    existingDeliveries.forEach(d => {
      console.log(d);
    });

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
