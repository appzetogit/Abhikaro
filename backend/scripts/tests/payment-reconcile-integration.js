/* eslint-disable no-console */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

async function run() {
	console.log('⏳ Starting in-memory MongoDB...');
	const mongod = await MongoMemoryServer.create();
	const uri = mongod.getUri();

	// Minimal required env before importing the server
	process.env.MONGODB_URI = uri;
	process.env.JWT_SECRET = 'test_jwt_secret_123';
	// Keys (not used due to NODE_ENV=test skip for external calls)
	process.env.RAZORPAY_API_KEY = 'rzp_test_key';
	process.env.RAZORPAY_SECRET_KEY = 'test_secret_key_456';
	process.env.NODE_ENV = 'test';
	process.env.PORT = '0';

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
			name: 'Recon User',
			phone: '9999999998',
			role: 'user',
			isActive: true
		});
		const token = jwtService.generateAccessToken({ userId: user._id.toString(), role: 'user' });

		const payload = {
			restaurantId: 'rest_recon_1',
			restaurantName: 'Recon Restaurant',
			items: [{ itemId: 'itm_1', name: 'Dal', price: 120, quantity: 1 }],
			address: { label: 'Home', street: '1 St', city: 'City', state: 'ST', zipCode: '111111' },
			pricing: { subtotal: 120, deliveryFee: 0, platformFee: 0, tax: 0, discount: 0, total: 120 },
			deliveryFleet: 'standard',
			note: ''
		};

		// Create intent without order
		const intent = await PaymentIntent.create({
			userId: user._id,
			payload,
			amount: 120 * 100,
			currency: 'INR',
			status: 'created',
			razorpayOrderId: 'order_recon_1'
		});

		// Call reconcile (in test env, external fetch is skipped)
		const res = await request(app)
			.post('/api/payment/razorpay/reconcile')
			.set('Authorization', `Bearer ${token}`)
			.send({
				intentId: intent._id.toString(),
				razorpay_payment_id: 'pay_recon_1'
			});

		if (res.status !== 200 || !res.body?.success) {
			throw new Error(`Expected 200 success, got ${res.status} ${JSON.stringify(res.body)}`);
		}
		if (res.body?.data?.status !== 'succeeded' || !res.body?.data?.orderId) {
			throw new Error(`Expected succeeded with orderId, got ${JSON.stringify(res.body?.data)}`);
		}

		logPass('Reconcile endpoint creates order and marks intent succeeded');

		console.log('\n🎉 Reconcile tests passed.');
		await mongoose.connection.close();
		await mongod.stop();
		process.exit(0);
	} catch (err) {
		console.error('\n❌ Reconcile tests failed.');
		try { await mongoose.connection.close(); } catch {}
		process.exit(1);
	}
}

run();

