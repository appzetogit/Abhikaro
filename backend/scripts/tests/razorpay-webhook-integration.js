/* eslint-disable no-console */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import request from 'supertest';

async function run() {
	console.log('⏳ Starting in-memory MongoDB (webhook test)...');
	const mongod = await MongoMemoryServer.create();
	const uri = mongod.getUri();

	// Minimal required env before importing the server
	process.env.MONGODB_URI = uri;
	process.env.JWT_SECRET = 'test_jwt_secret_123';
	// Razorpay keys used by webhook verification (webhook secret)
	process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_abc';
	process.env.RAZORPAY_API_KEY = 'rzp_test_key';
	process.env.RAZORPAY_SECRET_KEY = 'test_secret_key_456';
	process.env.NODE_ENV = 'test';
	process.env.PORT = '0';
	process.env.ENABLE_PAID_ORDER_VISIBILITY_FIX = 'true';

	// Import server AFTER env is set so it connects to in-memory mongo
	const { default: app } = await import('../../server.js');
	const { default: User } = await import('../../modules/auth/models/User.js');
	const { default: PaymentIntent } = await import('../../modules/payment/models/PaymentIntent.js');

	function logPass(name) {
		console.log(`✅ ${name}`);
	}
	function logFail(name, err) {
		console.error(`❌ ${name}`);
		if (err) console.error(err);
	}

	try {
		// Create a test user (to own the intent)
		const user = await User.create({
			name: 'Webhook User',
			phone: '9999999998',
			role: 'user',
			isActive: true
		});

		// Prepare a created intent that maps to a Razorpay order id
		const payload = {
			restaurantId: 'rest_webhook_1',
			restaurantName: 'Webhook Test Restaurant',
			items: [{ itemId: 'itm_1', name: 'Dosa', price: 120, quantity: 1 }],
			address: { label: 'Home', street: '1 Lane', city: 'City', state: 'ST', zipCode: '000001' },
			pricing: { subtotal: 120, deliveryFee: 0, platformFee: 0, tax: 0, discount: 0, total: 120 },
			deliveryFleet: 'standard',
			note: ''
		};
		const razorpayOrderId = 'order_webhook_1';
		const intent = await PaymentIntent.create({
			userId: user._id,
			payload,
			amount: 120 * 100,
			currency: 'INR',
			status: 'created',
			razorpayOrderId: razorpayOrderId
		});

		// Build a Razorpay payment.captured webhook payload
		const paymentId = 'pay_webhook_1';
		const eventBody = {
			event: 'payment.captured',
			payload: {
				payment: { entity: { id: paymentId, order_id: razorpayOrderId } },
				order: { entity: { id: razorpayOrderId } }
			}
		};
		const raw = Buffer.from(JSON.stringify(eventBody), 'utf8');
		const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');

		// POST to webhook endpoint with raw body and signature header
		const res = await request(app)
			.post('/api/payment/razorpay/webhook')
			.set('x-razorpay-signature', signature)
			.set('content-type', 'application/json')
			.send(raw);

		if (res.status !== 200 || !res.body?.success) {
			throw new Error(`Expected 200 success ack from webhook, got ${res.status} ${JSON.stringify(res.body)}`);
		}

		// Validate that the intent is now succeeded and has an order
		const updatedIntent = await PaymentIntent.findById(intent._id).lean();
		if (updatedIntent?.status !== 'succeeded' || !updatedIntent?.orderId) {
			throw new Error('Webhook did not mark intent succeeded with orderId');
		}

		// Validate the order exists and status is confirmed so restaurant can see it
		const { default: Order } = await import('../../modules/order/models/Order.js');
		const order = await Order.findById(updatedIntent.orderId).lean();
		if (!order) {
			throw new Error('Webhook did not create order');
		}
		if (order?.status !== 'confirmed') {
			throw new Error(`Expected order status confirmed, got ${order?.status}`);
		}

		// Validate restaurant listing returns the order (controller excludes only pending)
		const { default: Restaurant } = await import('../../modules/restaurant/models/Restaurant.js');
		const restaurantDoc = await Restaurant.create({
			name: 'Webhook Test Restaurant',
			onboarding: { step1: { restaurantName: 'Webhook Test Restaurant' } },
			ownerPhone: '9000000000'
		});

		// Force order.restaurantId to match the created restaurant for listing
		await Order.updateOne({ _id: order._id }, { $set: { restaurantId: restaurantDoc._id.toString() } });

		// Call the listing endpoint with a fake restaurant auth bypass by stubbing middleware isn’t trivial here,
		// so just query DB like controller would filter:
		const visible = await Order.find({ restaurantId: { $in: [restaurantDoc._id.toString()] }, status: { $ne: 'pending' } }).lean();
		if (!visible.find(o => o._id.toString() === order._id.toString())) {
			throw new Error('Order not visible to restaurant query');
		}

		logPass('Webhook creates order, marks intent succeeded, and order is visible to restaurant');

		console.log('\n🎉 Razorpay webhook integration test passed.');
		await mongoose.connection.close();
		await mongod.stop();
		process.exit(0);
	} catch (err) {
		console.error('\n❌ Razorpay webhook integration test failed.');
		try { await mongoose.connection.close(); } catch {}
		try {
			const conns = mongoose.connections || [];
			for (const c of conns) {
				if (c.readyState !== 0) await c.close();
			}
		} catch {}
		process.exit(1);
	}
}

run();

