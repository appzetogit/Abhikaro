/* eslint-disable no-console */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import request from 'supertest';

async function run() {
	console.log('⏳ Starting in-memory MongoDB replica set...');
	const replset = await MongoMemoryReplSet.create({
		replSet: { count: 1, storageEngine: 'wiredTiger' }
	});
	const uri = replset.getUri();

	// Minimal required env before importing the server
	process.env.MONGODB_URI = uri;
	process.env.JWT_SECRET = 'test_jwt_secret_123';
	// Razorpay keys used by verifyPayment (server reads via envService)
	process.env.RAZORPAY_API_KEY = 'rzp_test_key';
	process.env.RAZORPAY_SECRET_KEY = 'test_secret_key_456';

	// Keep optional dependencies disabled
	process.env.REDIS_ENABLED = 'false';
	process.env.NODE_ENV = 'test';
	process.env.PORT = '0';

	// Import server AFTER env is set so it connects to in-memory mongo
	const { default: app } = await import('../../server.js');
	const { default: User } = await import('../../modules/auth/models/User.js');
	const { default: PaymentIntent } = await import('../../modules/payment/models/PaymentIntent.js');
	const jwtServiceModule = await import('../../modules/auth/services/jwtService.js');
	const jwtService = jwtServiceModule.default;

	function logPass(name) {
		console.log(`✅ ${name}`);
	}
	function logFail(name, err) {
		console.error(`❌ ${name}`);
		if (err) console.error(err);
	}

	try {
		// Create a test user and token
		const user = await User.create({
			name: 'Test User',
			phone: '9999999999',
			role: 'user',
			isActive: true
		});
		const token = jwtService.generateAccessToken({ userId: user._id.toString(), role: 'user' });

		// Helper to build minimal valid payload used by order creation
		function buildPayload() {
			return {
				restaurantId: 'rest_1',
				restaurantName: 'Test Restaurant',
				items: [
					{ itemId: 'itm_1', name: 'Paneer Tikka', price: 150, quantity: 1 }
				],
				address: {
					label: 'Home',
					street: '123 Test St',
					city: 'Test City',
					state: 'TS',
					zipCode: '123456'
				},
				pricing: {
					subtotal: 150,
					deliveryFee: 0,
					platformFee: 0,
					tax: 0,
					discount: 0,
					total: 150
				},
				deliveryFleet: 'standard',
				note: ''
			};
		}

		// Test 1: Success flow
		try {
			const payload = buildPayload();
			const intent = await PaymentIntent.create({
				userId: user._id,
				payload,
				amount: 150 * 100,
				currency: 'INR',
				status: 'created',
				razorpayOrderId: 'order_succ_1'
			});

			const paymentId = 'pay_succ_1';
			const secret = process.env.RAZORPAY_SECRET_KEY;
			const signature = crypto
				.createHmac('sha256', secret)
				.update(`order_succ_1|${paymentId}`)
				.digest('hex');

			const res = await request(app)
				.post('/api/payment/razorpay/verify')
				.set('Authorization', `Bearer ${token}`)
				.send({
					intentId: intent._id.toString(),
					razorpay_order_id: 'order_succ_1',
					razorpay_payment_id: paymentId,
					razorpay_signature: signature
				});

			if (res.status !== 200 || !res.body?.success) {
				throw new Error(`Expected 200 success, got ${res.status} ${JSON.stringify(res.body)}`);
			}
			if (res.body?.data?.status !== 'succeeded' || !res.body?.data?.orderId) {
				throw new Error(`Expected succeeded with orderId, got ${JSON.stringify(res.body?.data)}`);
			}

			const updatedIntent = await PaymentIntent.findById(intent._id).lean();
			if (updatedIntent?.status !== 'succeeded' || !updatedIntent?.orderId) {
				throw new Error('PaymentIntent not updated to succeeded with orderId');
			}

			const { default: Order } = await import('../../modules/order/models/Order.js');
			const order = await Order.findById(updatedIntent.orderId).lean();
			if (!order) {
				throw new Error('Order not created');
			}
			if (order?.payment?.status !== 'completed') {
				throw new Error(`Order payment status expected completed, got ${order?.payment?.status}`);
			}
			logPass('Payment verify success creates order and marks intent succeeded');
		} catch (e) {
			logFail('Payment verify success creates order and marks intent succeeded', e);
			throw e;
		}

		// Test 2: Failure on invalid signature
		try {
			const payload = buildPayload();
			const intent = await PaymentIntent.create({
				userId: user._id,
				payload,
				amount: 150 * 100,
				currency: 'INR',
				status: 'created',
				razorpayOrderId: 'order_fail_1'
			});

			const res = await request(app)
				.post('/api/payment/razorpay/verify')
				.set('Authorization', `Bearer ${token}`)
				.send({
					intentId: intent._id.toString(),
					razorpay_order_id: 'order_fail_1',
					razorpay_payment_id: 'pay_fail_1',
					razorpay_signature: 'invalid_signature'
				});

			if (res.status !== 400 || res.body?.success !== false) {
				throw new Error(`Expected 400 error, got ${res.status} ${JSON.stringify(res.body)}`);
			}
			const updatedIntent = await PaymentIntent.findById(intent._id).lean();
			if (updatedIntent?.status !== 'failed') {
				throw new Error(`Expected intent status failed, got ${updatedIntent?.status}`);
			}
			logPass('Invalid signature marks intent failed and does not create order');
		} catch (e) {
			logFail('Invalid signature marks intent failed and does not create order', e);
			throw e;
		}

		// Test 3: Duplicate verify is idempotent (no duplicate orders)
		try {
			const payload = buildPayload();
			const intent = await PaymentIntent.create({
				userId: user._id,
				payload,
				amount: 150 * 100,
				currency: 'INR',
				status: 'created',
				razorpayOrderId: 'order_dupe_1'
			});

			const paymentId = 'pay_dupe_1';
			const secret = process.env.RAZORPAY_SECRET_KEY;
			const signature = crypto
				.createHmac('sha256', secret)
				.update(`order_dupe_1|${paymentId}`)
				.digest('hex');

			// First call
			const res1 = await request(app)
				.post('/api/payment/razorpay/verify')
				.set('Authorization', `Bearer ${token}`)
				.send({
					intentId: intent._id.toString(),
					razorpay_order_id: 'order_dupe_1',
					razorpay_payment_id: paymentId,
					razorpay_signature: signature
				});
			if (res1.status !== 200 || !res1.body?.success) {
				throw new Error(`First verify failed: ${res1.status} ${JSON.stringify(res1.body)}`);
			}
			const firstOrderId = res1.body?.data?.orderId;
			if (!firstOrderId) throw new Error('First verify missing orderId');

			// Second (duplicate) call
			const res2 = await request(app)
				.post('/api/payment/razorpay/verify')
				.set('Authorization', `Bearer ${token}`)
				.send({
					intentId: intent._id.toString(),
					razorpay_order_id: 'order_dupe_1',
					razorpay_payment_id: paymentId,
					razorpay_signature: signature
				});
			if (res2.status !== 200 || !res2.body?.success) {
				throw new Error(`Second verify failed: ${res2.status} ${JSON.stringify(res2.body)}`);
			}
			const secondOrderId = res2.body?.data?.orderId;
			if (secondOrderId !== firstOrderId) {
				throw new Error('Duplicate verify returned a different orderId');
			}

			const { default: Order } = await import('../../modules/order/models/Order.js');
			const ordersForIntent = await Order.find({ 'payment.paymentIntentId': intent._id }).lean();
			if (!ordersForIntent || ordersForIntent.length !== 1) {
				throw new Error(`Expected exactly 1 order for intent, got ${ordersForIntent?.length || 0}`);
			}

			logPass('Duplicate payment verify is idempotent (returns same order, no duplicates)');
		} catch (e) {
			logFail('Duplicate payment verify is idempotent (returns same order, no duplicates)', e);
			throw e;
		}

		// All tests passed
		console.log('\n🎉 All payment verification integration tests passed.');
		await mongoose.connection.close();
		await replset.stop();
		process.exit(0);
	} catch (err) {
		console.error('\n❌ Payment verification integration tests failed.');
		try {
			await mongoose.connection.close();
		} catch {}
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

