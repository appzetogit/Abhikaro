import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: 'd:/CurrentlyRunningProject/Abhikaro-main/backend/.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
  const order = await Order.findOne({ orderId: 'ORD-1785229257471-245' });
  if (!order) {
    console.error('Order not found');
    process.exit(1);
  }

  const OrderSettlement = mongoose.model('OrderSettlement', new mongoose.Schema({}, { strict: false }));
  const settlement = await OrderSettlement.findOne({ orderId: order._id });
  if (!settlement) {
    console.error('Settlement not found');
    process.exit(1);
  }

  const DeliveryBoyCommission = (await import('../modules/admin/models/DeliveryBoyCommission.js')).default;
  
  // Coordinates for Wow Shyam Cafe: [75.40312080400625, 27.365674937018227]
  // Customer address coords: [75.401149, 27.363804]
  const [rlng, rlat] = [75.40312080400625, 27.365674937018227];
  const [clng, clat] = order.address?.location?.coordinates || [75.401149, 27.363804];
  
  const R = 6371;
  const dLat = ((clat - rlat) * Math.PI) / 180;
  const dLng = ((clng - rlng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((rlat * Math.PI) / 180) * Math.cos((clat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const realDistance = Math.round(R * c * 100) / 100;
  
  console.log('Real delivery distance:', realDistance, 'km');

  const deliveryComm = await DeliveryBoyCommission.calculateCommission(realDistance);
  console.log('Recalculated Delivery Partner Commission:', deliveryComm);

  const newDeliveryPartnerEarning = {
    basePayout: deliveryComm.breakdown.basePayout,
    distance: realDistance,
    commissionPerKm: deliveryComm.breakdown.commissionPerKm,
    distanceCommission: deliveryComm.breakdown.distanceCommission,
    surgeMultiplier: 1,
    surgeAmount: 0,
    totalEarning: deliveryComm.commission,
    status: settlement.deliveryPartnerEarning?.status || 'pending'
  };

  const deliveryFee = settlement.userPayment?.deliveryFee || 35;
  const deliveryMargin = deliveryFee - deliveryComm.commission;

  await OrderSettlement.updateOne(
    { _id: settlement._id },
    {
      $set: {
        deliveryPartnerEarning: newDeliveryPartnerEarning,
        'adminEarning.deliveryMargin': deliveryMargin
      }
    }
  );

  console.log('✅ Successfully updated OrderSettlement for ORD-1785229257471-245!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
