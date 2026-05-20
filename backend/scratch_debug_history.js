import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RestaurantWallet from './modules/restaurant/models/RestaurantWallet.js';
import Order from './modules/order/models/Order.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Admin from './modules/admin/models/Admin.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  const id = '69c11b2e986136d667a656f0'; // Kanha Restaurant ID
  const type = 'payment'; // Test filter type
  const onlyAdjustments = 'false';

  try {
    const restaurantDoc = await Restaurant.findById(id).select("restaurantId slug").lean();
    if (!restaurantDoc) {
      throw new Error('Restaurant not found');
    }
    const restaurantPublicId = restaurantDoc?.restaurantId;
    const restaurantSlug = restaurantDoc?.slug;
    const restaurantIdVariations = [
      id.toString(),
      restaurantPublicId?.toString(),
      restaurantSlug?.toString()
    ].filter(Boolean);

    const [deliveredCount, orderedCount] = await Promise.all([
      Order.countDocuments({ restaurantId: { $in: restaurantIdVariations }, status: "delivered" }),
      Order.countDocuments({ restaurantId: { $in: restaurantIdVariations } })
    ]);

    const walletDoc = await RestaurantWallet.findOrCreateByRestaurantId(id);
    if (walletDoc) {
      await walletDoc.populate("transactions.processedBy", "name email");
    }
    const wallet = walletDoc ? walletDoc.toObject() : null;

    if (!wallet) {
      console.log('No wallet found');
      return;
    }

    let transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log('Original transactions length:', transactions.length);

    if (type && type !== "all") {
      if (type === "payment") {
        const allOrders = await Order.find({ restaurantId: { $in: restaurantIdVariations } }).select("_id").lean();
        const orderIdsSet = new Set(allOrders.map((o) => o._id.toString()));
        transactions = transactions.filter((t) => t.type === "payment" && t.orderId && orderIdsSet.has(t.orderId.toString()));
      } else if (type === "credit") {
        const allOrders = await Order.find({ restaurantId: { $in: restaurantIdVariations } }).select("_id").lean();
        const orderIdsSet = new Set(allOrders.map((o) => o._id.toString()));
        transactions = transactions.filter((t) => 
          t.type === "bonus" || 
          t.type === "refund" ||
          (t.type === "payment" && t.orderId && !orderIdsSet.has(t.orderId.toString()))
        );
      } else if (type === "deduction") {
        transactions = transactions.filter((t) => t.type === "deduction");
      } else if (type === "withdrawal") {
        transactions = transactions.filter((t) => t.type === "withdrawal");
      }
    } else {
      const onlyAdj = String(onlyAdjustments).toLowerCase() !== "false";
      if (onlyAdj) {
        transactions = transactions.filter((t) => {
          const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});
          return md.adjustment === true || t.type === "bonus" || t.type === "deduction";
        });
      }
    }

    console.log('Filtered transactions length:', transactions.length);

    // Let's serialize to simulate output mapping
    const mapped = transactions.map((t) => {
      const md = t?.metadata && t.metadata.get ? Object.fromEntries(t.metadata) : (t.metadata || {});
      return {
        id: t._id,
        type: t.type,
        status: t.status,
        amount: t.amount,
        description: t.description,
        orderId: t.orderId || null,
        balanceAfter: t.balanceAfter || 0,
        date: t.createdAt,
        processedAt: t.processedAt,
        processedBy: t.processedBy
          ? { id: t.processedBy._id, name: t.processedBy.name, email: t.processedBy.email }
          : null,
        metadata: md,
      };
    });

    console.log('Mapped transactions successfully! Length:', mapped.length);

  } catch (err) {
    console.error('CRASH DETECTED:');
    console.error(err);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
