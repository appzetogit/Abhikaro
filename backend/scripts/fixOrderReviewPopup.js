import dotenv from "dotenv";
import mongoose from "mongoose";
import Order from "../modules/order/models/Order.js";

dotenv.config();

async function run() {
  const orderIdArg = process.argv[2];

  if (!orderIdArg) {
    console.error(
      "Usage: npm run fix:order-review-popup -- <ORDER_ID_OR_MONGO_ID>",
    );
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const isMongoId =
      mongoose.Types.ObjectId.isValid(orderIdArg) && orderIdArg.length === 24;

    const query = isMongoId ? { _id: orderIdArg } : { orderId: orderIdArg };

    const order = await Order.findOne(query).lean();
    if (!order) {
      console.error(`Order not found: ${orderIdArg}`);
      process.exit(1);
    }

    const hadReview =
      order.review &&
      (order.review.rating !== undefined ||
        order.review.comment !== undefined ||
        order.review.submittedAt !== undefined);

    if (!hadReview) {
      console.log("No review found on order; nothing to fix.", {
        orderId: order.orderId,
        mongoId: order._id?.toString?.() || order._id,
      });
      process.exit(0);
    }

    await Order.updateOne(
      { _id: order._id },
      {
        $unset: {
          "review.rating": 1,
          "review.comment": 1,
          "review.submittedAt": 1,
          "review.reviewedBy": 1,
        },
      },
    );

    console.log("Review cleared successfully for popup eligibility.", {
      orderId: order.orderId,
      mongoId: order._id?.toString?.() || order._id,
    });
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error("Failed to fix order review popup:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
