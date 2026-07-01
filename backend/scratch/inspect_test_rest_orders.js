import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const inspectTestRestOrders = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db;
    const testRestId = '69d654e7c86eb9b6c8399c62';

    const orders = await db.collection('orders').find({ restaurantId: testRestId }).limit(3).toArray();
    console.log(`Found ${orders.length} order(s) for Test Restaurant:`);
    orders.forEach(order => {
      console.log(`Order ID: ${order.orderId}, Status: ${order.status}`);
      console.log('Items ordered:', JSON.stringify(order.items, null, 2));
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error inspecting:', error);
    process.exit(1);
  }
};

inspectTestRestOrders();
