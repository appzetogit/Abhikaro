import mongoose from 'mongoose';
import winston from 'winston';
import PaymentIntent from '../models/PaymentIntent.js';

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	transports: [
		new winston.transports.Console({
			format: winston.format.simple()
		})
	]
});

/**
 * Release any reserved inventory for a given intent.
 * This is intentionally a no-op unless reservation logic is implemented elsewhere.
 * We keep this function for future extension and clear observability.
 */
async function releaseInventoryForIntent(intent, session) {
	try {
		// If your system reserves stock at intent creation time,
		// release that stock here using `intent.payload.items`.
		// Current implementation is a no-op for safety.
		logger.debug && logger.debug(`No-op inventory release for intent ${intent._id}`);
	} catch (error) {
		logger.warn(`Inventory release failed for intent ${intent._id}: ${error?.message || error}`);
	}
}

/**
 * Expire stale payment intents that have passed their expiresAt timestamp without succeeding.
 * - Marks status as 'expired'
 * - Optionally releases any reserved inventory
 * - Skips intents already linked to an order
 */
export async function expireStalePaymentIntents(options = {}) {
	const now = options.now instanceof Date ? options.now : new Date();
	const batchSize = Number.isInteger(options.batchSize) && options.batchSize > 0 ? options.batchSize : 200;

	const filter = {
		status: { $in: ['created', 'processing'] },
		expiresAt: { $lte: now },
		orderId: { $exists: false }
	};

	const staleIntents = await PaymentIntent.find(filter).limit(batchSize);
	if (!staleIntents.length) {
		return { processed: 0, message: 'No stale payment_intents to expire' };
	}

	let processed = 0;
	let errors = 0;

	for (const intent of staleIntents) {
		const session = await mongoose.startSession();
		try {
			await session.withTransaction(async () => {
				const fresh = await PaymentIntent.findById(intent._id).session(session).exec();
				if (!fresh) return;

				// Re-check state under transaction for idempotency
				if (fresh.status === 'succeeded' || fresh.orderId) {
					return;
				}
				if (fresh.status === 'expired') {
					return;
				}
				if (fresh.expiresAt && fresh.expiresAt > now) {
					return;
				}

				// Attempt to release any reserved inventory
				await releaseInventoryForIntent(fresh, session);

				// Expire the intent
				fresh.status = 'expired';
				await fresh.save({ session });
				processed += 1;
			});
		} catch (error) {
			errors += 1;
			logger.error(`Failed expiring intent ${intent._id}: ${error?.message || error}`);
		} finally {
			session.endSession();
		}
	}

	return {
		processed,
		errors,
		message: `Expired ${processed} payment_intent(s)${errors ? `, ${errors} errors` : ''}`
	};
}

export default {
	expireStalePaymentIntents
};

