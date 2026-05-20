import express from 'express';
import { initializeRazorpay, createOrder as createRazorpayOrder, verifyPayment, verifyWebhookSignature, fetchPayment, capturePayment } from './services/razorpayService.js';
import PaymentIntent from './models/PaymentIntent.js';
import { authenticate } from '../auth/middleware/auth.js';
import winston from 'winston';
import { getRazorpayCredentials } from '../../shared/utils/envService.js';
import Order from '../order/models/Order.js';
import OrderSettlement from '../order/models/OrderSettlement.js';
import mongoose from 'mongoose';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize Razorpay on module load
initializeRazorpay();

const router = express.Router();

// Health
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Payment module is active',
    razorpayConfigured: !!process.env.RAZORPAY_KEY_ID
  });
});

/**
 * Create Razorpay order + PaymentIntent
 * POST /api/payment/razorpay/order
 * Body: { payload: {...same as old order create body...} }
 */
router.post('/razorpay/order', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body || {};

    // Basic validations (deep business validations happen during order creation after success)
    if (!payload?.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }
    if (!payload?.pricing || typeof payload.pricing?.total !== 'number' || payload.pricing.total <= 0) {
      return res.status(400).json({ success: false, message: 'Order total is required' });
    }

    const amountPaise = Math.round(Number(payload.pricing.total) * 100);

    // Create Razorpay order
    const rzpOrder = await createRazorpayOrder({
      amount: amountPaise,
      currency: 'INR',
      receipt: `intent_${Date.now()}`,
      notes: {
        userId: String(userId),
        restaurantId: payload.restaurantId || 'unknown'
      }
    });

    // Persist intent
    const intent = await PaymentIntent.create({
      userId: userId,
      payload,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      razorpayOrderId: rzpOrder.id,
      metadata: { source: 'cart' }
    });

    // Frontend needs publishable key
    let keyId = null;
    try {
      const creds = await getRazorpayCredentials();
      keyId = creds.keyId || process.env.RAZORPAY_KEY_ID;
    } catch {
      keyId = process.env.RAZORPAY_KEY_ID;
    }

    return res.status(201).json({
      success: true,
      data: {
        intentId: intent._id.toString(),
        razorpay: {
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          key: keyId
        }
      }
    });
  } catch (error) {
    logger.error('Error creating payment intent:', error);
    return res.status(500).json({ success: false, message: 'Failed to initialize payment' });
  }
});

/**
 * Verify payment securely on server and create Order from intent
 * POST /api/payment/razorpay/verify
 * Body: { intentId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post('/razorpay/verify', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { intentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!intentId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const intent = await PaymentIntent.findOne({ _id: intentId, userId });
    if (!intent) {
      return res.status(404).json({ success: false, message: 'Payment intent not found' });
    }
    if (intent.status === 'succeeded' && intent.orderId) {
      return res.json({ success: true, data: { status: 'succeeded', orderId: intent.orderId.toString() } });
    }

    // Verify signature
    const valid = await verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!valid) {
      intent.status = 'failed';
      intent.razorpayPaymentId = razorpay_payment_id;
      intent.razorpaySignature = razorpay_signature;
      await intent.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Double-check payment status via Razorpay API and capture if necessary (skip in test env)
    if ((process.env.NODE_ENV || '').toLowerCase() !== 'test') {
      try {
        const payment = await fetchPayment(razorpay_payment_id);
        if (!payment || (payment.status !== 'captured' && payment.status !== 'authorized')) {
          return res.status(400).json({ success: false, message: 'Payment not captured yet' });
        }
        if (payment.status === 'authorized') {
          const captureAmount = intent?.amount || payment?.amount;
          await capturePayment(razorpay_payment_id, captureAmount);
        }
      } catch (checkErr) {
        logger.error('Error validating/capturing Razorpay payment:', checkErr);
        return res.status(400).json({ success: false, message: 'Unable to confirm payment capture' });
      }
    }

    // Idempotent order creation
    if (!intent.orderId) {
      intent.status = 'processing';
      await intent.save();

      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        // Double-check after acquiring txn
        const fresh = await PaymentIntent.findById(intent._id).session(session);
        if (fresh.orderId) return;

        const payload = fresh.payload || {};

        // Resolve restaurant location/address for rider pickup
        let resolvedRestaurantLocation = null;
        try {
          // Prefer location saved in payload (if frontend provided)
          const pLoc = payload.restaurantLocation;
          if (pLoc && (pLoc.latitude || pLoc.longitude || pLoc?.location?.coordinates?.length)) {
            const lat =
              Number(pLoc.latitude) ||
              Number(pLoc?.location?.coordinates?.[1]) ||
              null;
            const lng =
              Number(pLoc.longitude) ||
              Number(pLoc?.location?.coordinates?.[0]) ||
              null;
            if (lat != null && lng != null) {
              resolvedRestaurantLocation = {
                latitude: lat,
                longitude: lng,
                location: {
                  type: 'Point',
                  coordinates: [lng, lat],
                },
                formattedAddress: pLoc.formattedAddress || pLoc.address || null,
                address: pLoc.formattedAddress || pLoc.address || null,
              };
            }
          } else if (payload.restaurantId) {
            // Fallback: fetch Restaurant doc
            const { default: Restaurant } = await import('../restaurant/models/Restaurant.js');
            let restaurantDoc = null;
            if (mongoose.Types.ObjectId.isValid(payload.restaurantId)) {
              restaurantDoc = await Restaurant.findById(payload.restaurantId).select('location address').lean();
            }
            if (!restaurantDoc) {
              restaurantDoc = await Restaurant.findOne({
                $or: [{ restaurantId: payload.restaurantId }, { _id: payload.restaurantId }],
              }).select('location address').lean();
            }
            const coords =
              restaurantDoc?.location?.geoLocation?.coordinates?.length
                ? restaurantDoc.location.geoLocation.coordinates
                : restaurantDoc?.location?.coordinates;
            if (coords && coords.length === 2) {
              const [lng, lat] = coords;
              resolvedRestaurantLocation = {
                latitude: Number(lat),
                longitude: Number(lng),
                location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
                formattedAddress:
                  restaurantDoc.location?.formattedAddress || restaurantDoc.address || null,
                address: restaurantDoc.location?.address || restaurantDoc.address || null,
              };
            }
          }
        } catch (e) {
          logger.warn('Could not resolve restaurant location during verify:', e?.message || e);
        }

        // Merge additionalAddress into address.additionalDetails for consistency
        const baseAddress = payload.address || {};
        const resolvedAddress = {
          ...baseAddress,
          additionalDetails:
            payload.additionalAddress ||
            baseAddress.additionalDetails ||
            baseAddress.additionalAddress ||
            null,
        };

        // Resolve hotel details for QR/Hotel orders if not already resolved
        let resolvedHotelName = payload.hotelName || null;
        let resolvedHotelMongoId = (payload.hotelReference && mongoose.Types.ObjectId.isValid(payload.hotelReference)) ? payload.hotelReference : null;

        if (payload.hotelReference && (!resolvedHotelName || !resolvedHotelMongoId)) {
          try {
            const { default: Hotel } = await import('../hotel/models/Hotel.js');
            const hotelDoc = mongoose.Types.ObjectId.isValid(payload.hotelReference)
              ? await Hotel.findById(payload.hotelReference).select('hotelName _id').lean()
              : await Hotel.findOne({ hotelId: payload.hotelReference }).select('hotelName _id').lean();

            if (hotelDoc) {
              resolvedHotelName = hotelDoc.hotelName || resolvedHotelName;
              resolvedHotelMongoId = hotelDoc._id || resolvedHotelMongoId;
            }
          } catch (e) {
            logger.warn('Could not resolve hotel details during verify:', e?.message);
          }
        }

        // Minimal, safe order creation that matches existing schema, with pickup location
        const orderDoc = new Order({
          orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: fresh.userId,
          restaurantId: payload.restaurantId,
          restaurantName: payload.restaurantName,
          items: payload.items,
          address: resolvedAddress,
          restaurantLocation: resolvedRestaurantLocation,
          pricing: payload.pricing,
          deliveryFleet: payload.deliveryFleet || 'standard',
          note: payload.note || '',
          sendCutlery: payload.sendCutlery !== false,
          status: 'confirmed',
          // Preserve hotel/QR metadata for orders placed via hotel QR flow
          hotelReference: payload.hotelReference || null,
          hotelId: resolvedHotelMongoId,
          qrReferenceId: payload.qrReferenceId || null,
          hotelName: resolvedHotelName,
          orderType: (payload.hotelReference || payload.orderType === 'QR') ? 'QR' : 'DIRECT',
          roomNumber: payload.roomNumber || null,
          payment: {
            method: 'razorpay',
            status: 'completed',
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            transactionId: razorpay_payment_id,
            paymentIntentId: fresh._id
          },
          tracking: {
            confirmed: { status: true, timestamp: new Date() }
          }
        });

        await orderDoc.save({ session });

        fresh.status = 'succeeded';
        fresh.razorpayPaymentId = razorpay_payment_id;
        fresh.razorpaySignature = razorpay_signature;
        fresh.orderId = orderDoc._id;
        await fresh.save({ session });

        // Notify restaurant in-transaction (non-blocking errors will be caught outside)
        try {
          const { notifyRestaurantNewOrder } = await import('../order/services/restaurantNotificationService.js');
          const restaurantId = orderDoc.restaurantId?.toString() || orderDoc.restaurantId;
          if (restaurantId) {
            await notifyRestaurantNewOrder(orderDoc, restaurantId);
          }
        } catch (e) {
          logger.error('Failed to notify restaurant about new prepaid order:', e?.message || e);
        }
      });
      session.endSession();
    }

    const updated = await PaymentIntent.findById(intent._id);

    // Best-effort push notification to user
    if (updated?.status === 'succeeded' && updated?.orderId) {
      try {
        const { notifyUserOrderPlaced } = await import('../fcm/services/pushNotificationService.js');
        const placedOrder = await Order.findById(updated.orderId);
        if (placedOrder) {
          await notifyUserOrderPlaced(placedOrder);
          if (process.env.NODE_ENV !== 'production') {
            logger.info('Order created via verify with restaurantLocation:', {
              orderId: placedOrder.orderId,
              hasRestaurantLocation: !!placedOrder.restaurantLocation,
              coords: placedOrder.restaurantLocation?.coordinates,
              formattedAddress: placedOrder.restaurantLocation?.formattedAddress
            });
          }
        }
      } catch (e) {
        logger.warn('User push notify failed (non-blocking):', e?.message || e);
      }
    }

    return res.json({
      success: true,
      data: {
        status: updated.status,
        orderId: updated.orderId?.toString() || null
      }
    });
  } catch (error) {
    logger.error('Error verifying payment intent:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

/**
 * Razorpay Webhook (server-to-server)
 * POST /api/payment/razorpay/webhook
 * Headers: x-razorpay-signature
 * Body: raw JSON from Razorpay
 */
// NOTE: Raw body parsing is registered in `backend/server.js` BEFORE JSON parsers.
// Do not add another body parser here, otherwise signature verification can break.
router.post('/razorpay/webhook', async (req, res) => {
  try {
    const featureFlag = String(process.env.ENABLE_PAID_ORDER_VISIBILITY_FIX || '').toLowerCase() === 'true';
    const headerSignature = req.get('x-razorpay-signature') || req.get('X-Razorpay-Signature') || '';
    const rawBody = req.razorpayRawBody || req.body;

    if ((process.env.NODE_ENV || '').toLowerCase() === 'test') {
      logger.info('Webhook raw body diagnostics', {
        isBuffer: Buffer.isBuffer(rawBody),
        bodyType: typeof rawBody,
        constructor: rawBody?.constructor?.name || null,
        hasHeaderSignature: !!headerSignature
      });
    }

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(rawBody, headerSignature);
    if (!isValid) {
      logger.warn('Webhook signature verification failed', {
        source: 'razorpay.webhook',
        hasHeaderSignature: !!headerSignature
      });
      return res.status(400).json({ success: false });
    }

    // Parse event safely after signature verification
    let event;
    try {
      const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
      event = JSON.parse(bodyString);
    } catch (e) {
      logger.error('Failed to parse webhook payload JSON', {
        source: 'razorpay.webhook',
        error: e?.message
      });
      return res.status(400).json({ success: false });
    }

    const eventType = event?.event;
    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const refundEntity = event?.payload?.refund?.entity;

    // ---------------------------
    // Refund events (do NOT rely on PaymentIntent / razorpay_order_id)
    // ---------------------------
    if (eventType && typeof eventType === 'string' && eventType.startsWith('refund.')) {
      try {
        const refundId = refundEntity?.id || null;
        const refundStatus = refundEntity?.status || null; // typically: processed / pending / failed
        const refundPaymentId = refundEntity?.payment_id || null;
        const refundedAmountPaise = typeof refundEntity?.amount === 'number' ? refundEntity.amount : null;

        logger.info('Webhook refund event received', {
          source: 'razorpay.webhook',
          eventType,
          refundId,
          refundStatus,
          refundPaymentId,
          refundedAmountPaise
        });

        if (!refundPaymentId && !refundId) {
          logger.warn('Refund webhook missing identifiers, ignoring', {
            source: 'razorpay.webhook',
            eventType
          });
          return res.status(200).json({ success: true });
        }

        // Find order by payment id (primary), fallback by refundId (if we persisted it earlier)
        const order =
          (refundPaymentId
            ? await Order.findOne({ 'payment.razorpayPaymentId': refundPaymentId })
            : null) ||
          (refundId ? await Order.findOne({ 'payment.refund.refundId': refundId }) : null);

        if (!order) {
          logger.warn('Refund webhook: no matching Order found', {
            source: 'razorpay.webhook',
            eventType,
            refundId,
            refundPaymentId
          });
          return res.status(200).json({ success: true });
        }

        // Update order.payment.refund status (best-effort)
        const now = new Date();
        order.payment = order.payment || {};
        order.payment.refund = order.payment.refund || {};
        if (refundId) order.payment.refund.refundId = refundId;
        order.payment.refund.razorpayStatus = refundStatus || order.payment.refund.razorpayStatus || null;
        // Normalize our UI-facing status to: initiated / processed / failed
        if (refundStatus === 'processed') {
          order.payment.refund.status = 'processed';
          order.payment.refund.processedAt = now;
          // Mark payment status refunded for visibility (optional)
          if (order.payment.status === 'completed') order.payment.status = 'refunded';
        } else if (refundStatus === 'failed') {
          order.payment.refund.status = 'failed';
          order.payment.refund.processedAt = now;
          order.payment.refund.message = refundEntity?.error_description || refundEntity?.error_reason || order.payment.refund.message || null;
        } else {
          // pending / created / any other state → initiated (keep as-is if already processed)
          if (order.payment.refund.status !== 'processed') {
            order.payment.refund.status = 'initiated';
          }
        }
        if (refundedAmountPaise != null && order.payment.refund.amountPaise == null) {
          order.payment.refund.amountPaise = refundedAmountPaise;
          order.payment.refund.amount =
            typeof order.payment.refund.amount === 'number'
              ? order.payment.refund.amount
              : Math.round((refundedAmountPaise / 100) * 100) / 100;
        }

        await order.save();

        // Update settlement cancellationDetails for user UI (authoritative for list endpoints)
        try {
          const settlement = await OrderSettlement.findOne({ orderId: order._id });
          if (settlement) {
            settlement.cancellationDetails = settlement.cancellationDetails || {};
            if (refundId) settlement.cancellationDetails.razorpayRefundId = refundId;

            if (refundStatus === 'processed') {
              settlement.cancellationDetails.refundStatus = 'processed';
              settlement.cancellationDetails.refundProcessedAt = now;
            } else if (refundStatus === 'failed') {
              settlement.cancellationDetails.refundStatus = 'failed';
              settlement.cancellationDetails.refundFailureReason =
                refundEntity?.error_description ||
                refundEntity?.error_reason ||
                settlement.cancellationDetails.refundFailureReason ||
                'Refund failed at gateway';
            } else {
              // pending / created → initiated (unless already processed)
              if (settlement.cancellationDetails.refundStatus !== 'processed') {
                settlement.cancellationDetails.refundStatus = 'initiated';
              }
            }

            await settlement.save();
          }
        } catch (settlementErr) {
          logger.warn('Refund webhook: failed updating settlement (non-blocking)', {
            source: 'razorpay.webhook',
            eventType,
            orderId: order?._id?.toString?.(),
            error: settlementErr?.message
          });
        }

        return res.status(200).json({ success: true });
      } catch (refundErr) {
        logger.error('Refund webhook handler error (non-blocking)', {
          source: 'razorpay.webhook',
          eventType,
          error: refundErr?.message,
          stack: refundErr?.stack
        });
        return res.status(200).json({ success: true });
      }
    }

    // Extract ids
    const razorpay_payment_id =
      paymentEntity?.id ||
      event?.payload?.payment?.id ||
      null;
    const razorpay_order_id =
      paymentEntity?.order_id ||
      orderEntity?.id ||
      event?.payload?.order?.id ||
      null;

    if (!razorpay_order_id) {
      logger.warn('Webhook missing razorpay_order_id, ignoring', {
        source: 'razorpay.webhook',
        eventType
      });
      return res.status(200).json({ success: true }); // acknowledge regardless
    }

    // Lookup intent by razorpay order id
    const intent = await PaymentIntent.findOne({ razorpayOrderId: razorpay_order_id });
    if (!intent) {
      logger.warn('No PaymentIntent found for webhook order id', {
        source: 'razorpay.webhook',
        eventType,
        razorpay_order_id
      });
      try {
        // Persist to dead-letter for investigation if enabled
        const { default: WebhookDeadLetter } = await import('./models/WebhookDeadLetter.js');
        await WebhookDeadLetter.create({
          eventType,
          rawEvent: event,
          reason: 'payment_intent_not_found',
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id || null,
          notes: 'Captured payment without matching app PaymentIntent'
        });
      } catch (dlqErr) {
        logger.warn('Failed to write webhook dead-letter', { error: dlqErr?.message });
      }
      return res.status(200).json({ success: true });
    }

    // Handle events
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      logger.info('Webhook payment success received', {
        source: 'razorpay.webhook',
        eventType,
        razorpay_order_id,
        razorpay_payment_id,
        intentId: intent?._id?.toString(),
        currentStatus: intent?.status,
        hasOrderId: !!intent?.orderId
      });
      // Idempotent creation if not already succeeded
      if (!intent.orderId) {
        intent.status = 'processing';
        await intent.save();

        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
          const fresh = await PaymentIntent.findById(intent._id).session(session);
          if (fresh.orderId) return;

          const payload = fresh.payload || {};

          // Resolve restaurant location/address
          let resolvedRestaurantLocation = null;
          try {
            const pLoc = payload.restaurantLocation;
            if (pLoc && (pLoc.latitude || pLoc.longitude || pLoc?.location?.coordinates?.length)) {
              const lat =
                Number(pLoc.latitude) ||
                Number(pLoc?.location?.coordinates?.[1]) ||
                null;
              const lng =
                Number(pLoc.longitude) ||
                Number(pLoc?.location?.coordinates?.[0]) ||
                null;
              if (lat != null && lng != null) {
                resolvedRestaurantLocation = {
                  latitude: lat,
                  longitude: lng,
                  location: { type: 'Point', coordinates: [lng, lat] },
                  formattedAddress: pLoc.formattedAddress || pLoc.address || null,
                  address: pLoc.formattedAddress || pLoc.address || null,
                };
              }
            } else if (payload.restaurantId) {
              const { default: Restaurant } = await import('../restaurant/models/Restaurant.js');
              let restaurantDoc = null;
              if (mongoose.Types.ObjectId.isValid(payload.restaurantId)) {
                restaurantDoc = await Restaurant.findById(payload.restaurantId).select('location address').lean();
              }
              if (!restaurantDoc) {
                restaurantDoc = await Restaurant.findOne({
                  $or: [{ restaurantId: payload.restaurantId }, { _id: payload.restaurantId }],
                }).select('location address').lean();
              }
              const coords =
                restaurantDoc?.location?.geoLocation?.coordinates?.length
                  ? restaurantDoc.location.geoLocation.coordinates
                  : restaurantDoc?.location?.coordinates;
              if (coords && coords.length === 2) {
                const [lng, lat] = coords;
                resolvedRestaurantLocation = {
                  latitude: Number(lat),
                  longitude: Number(lng),
                  location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
                  formattedAddress:
                    restaurantDoc.location?.formattedAddress || restaurantDoc.address || null,
                  address: restaurantDoc.location?.address || restaurantDoc.address || null,
                };
              }
            }
          } catch (e) {
            logger.warn('Could not resolve restaurant location during webhook:', e?.message || e);
          }

          // Merge additionalAddress into address.additionalDetails
          const baseAddress = payload.address || {};
          const resolvedAddress = {
            ...baseAddress,
            additionalDetails:
              payload.additionalAddress ||
              baseAddress.additionalDetails ||
              baseAddress.additionalAddress ||
              null,
          };

          // Resolve hotel details for QR/Hotel orders if not already resolved
          let resolvedHotelName = payload.hotelName || null;
          let resolvedHotelMongoId = (payload.hotelReference && mongoose.Types.ObjectId.isValid(payload.hotelReference)) ? payload.hotelReference : null;

          if (payload.hotelReference && (!resolvedHotelName || !resolvedHotelMongoId)) {
            try {
              const { default: Hotel } = await import('../hotel/models/Hotel.js');
              const hotelDoc = mongoose.Types.ObjectId.isValid(payload.hotelReference)
                ? await Hotel.findById(payload.hotelReference).select('hotelName _id').lean()
                : await Hotel.findOne({ hotelId: payload.hotelReference }).select('hotelName _id').lean();

              if (hotelDoc) {
                resolvedHotelName = hotelDoc.hotelName || resolvedHotelName;
                resolvedHotelMongoId = hotelDoc._id || resolvedHotelMongoId;
              }
            } catch (e) {
              logger.warn('Could not resolve hotel details during webhook:', e?.message);
            }
          }

          const orderDoc = new Order({
            orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            userId: fresh.userId,
            restaurantId: payload.restaurantId,
            restaurantName: payload.restaurantName,
            items: payload.items,
            address: resolvedAddress,
            restaurantLocation: resolvedRestaurantLocation,
            pricing: payload.pricing,
            deliveryFleet: payload.deliveryFleet || 'standard',
            note: payload.note || '',
            sendCutlery: payload.sendCutlery !== false,
            status: 'confirmed',
          // Preserve hotel/QR metadata for webhook-driven creation
          hotelReference: payload.hotelReference || null,
          hotelId: resolvedHotelMongoId,
          qrReferenceId: payload.qrReferenceId || null,
          hotelName: resolvedHotelName,
          orderType: (payload.hotelReference || payload.orderType === 'QR') ? 'QR' : 'DIRECT',
          roomNumber: payload.roomNumber || null,
            payment: {
              method: 'razorpay',
              status: 'completed',
              razorpayOrderId: razorpay_order_id,
              razorpayPaymentId: razorpay_payment_id || null,
              razorpaySignature: null,
              transactionId: razorpay_payment_id || null,
              paymentIntentId: fresh._id
            },
            tracking: {
              confirmed: { status: true, timestamp: new Date() }
            }
          });

          await orderDoc.save({ session });

          fresh.status = 'succeeded';
          if (razorpay_payment_id) fresh.razorpayPaymentId = razorpay_payment_id;
          fresh.orderId = orderDoc._id;
          await fresh.save({ session });

          // Best-effort notify restaurant
          try {
            const { notifyRestaurantNewOrder } = await import('../order/services/restaurantNotificationService.js');
            const restaurantId = orderDoc.restaurantId?.toString() || orderDoc.restaurantId;
            if (restaurantId) {
              await notifyRestaurantNewOrder(orderDoc, restaurantId);
            }
            logger.info('Restaurant notified for new prepaid order', {
              source: 'razorpay.webhook',
              orderMongoId: orderDoc._id?.toString?.(),
              orderId: orderDoc.orderId,
              restaurantId
            });
          } catch (e) {
            logger.error('Restaurant notify failed on webhook:', e?.message || e);
          }
        });
        session.endSession();

        // Best-effort notify user
        try {
          const { notifyUserOrderPlaced } = await import('../fcm/services/pushNotificationService.js');
          const placedOrder = await Order.findById(intent.orderId);
          if (placedOrder) {
            await notifyUserOrderPlaced(placedOrder);
          }
        } catch (e) {
          logger.warn('User notify failed (webhook):', e?.message || e);
        }
      } else {
        logger.info('Webhook is idempotent: order already exists for intent', {
          source: 'razorpay.webhook',
          eventType,
          intentId: intent?._id?.toString(),
          orderId: intent?.orderId?.toString?.()
        });
      }
    } else if (eventType === 'payment.failed') {
      // Mark failed if still pending
      if (intent.status !== 'succeeded') {
        intent.status = 'failed';
        if (razorpay_payment_id) intent.razorpayPaymentId = razorpay_payment_id;
        await intent.save();
        logger.info('Marked intent failed from webhook', {
          source: 'razorpay.webhook',
          intentId: intent?._id?.toString(),
          razorpay_payment_id
        });
      }
    } else {
      logger.info('Ignoring unrelated Razorpay webhook event', {
        source: 'razorpay.webhook',
        eventType,
        razorpay_order_id
      });
    }

    // Always 200 to acknowledge
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Webhook handler error:', error);
    // Still acknowledge to avoid retries storm; log for investigation
    return res.status(200).json({ success: true });
  }
});

/**
 * Poll intent status
 * GET /api/payment/status/:intentId
 */
router.get('/status/:intentId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { intentId } = req.params;
    const intent = await PaymentIntent.findOne({ _id: intentId, userId }).lean();
    if (!intent) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.json({
      success: true,
      data: {
        status: intent.status,
        orderId: intent.orderId ? String(intent.orderId) : null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

/**
 * Reconcile an intent by confirming payment directly with Razorpay and creating order if missing
 * POST /api/payment/razorpay/reconcile
 * Body: { intentId, razorpay_payment_id }
 */
router.post('/razorpay/reconcile', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { intentId, razorpay_payment_id } = req.body || {};

    if (!intentId || !razorpay_payment_id) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const intent = await PaymentIntent.findOne({ _id: intentId, userId });
    if (!intent) {
      return res.status(404).json({ success: false, message: 'Payment intent not found' });
    }

    // If already created, return
    if (intent.status === 'succeeded' && intent.orderId) {
      return res.json({ success: true, data: { status: 'succeeded', orderId: intent.orderId.toString() } });
    }

    // Validate payment state and capture if needed (skip in test env)
    if ((process.env.NODE_ENV || '').toLowerCase() !== 'test') {
      try {
        const payment = await fetchPayment(razorpay_payment_id);
        if (!payment || (payment.status !== 'captured' && payment.status !== 'authorized')) {
          return res.status(400).json({ success: false, message: 'Payment not captured yet' });
        }
        if (payment.status === 'authorized') {
          const captureAmount = intent?.amount || payment?.amount;
          await capturePayment(razorpay_payment_id, captureAmount);
        }
      } catch (checkErr) {
        logger.error('Error reconciling Razorpay payment:', checkErr);
        return res.status(400).json({ success: false, message: 'Unable to confirm payment capture' });
      }
    }

    // Create order idempotently
    if (!intent.orderId) {
      intent.status = 'processing';
      await intent.save();

      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const fresh = await PaymentIntent.findById(intent._id).session(session);
        if (fresh.orderId) return;

        const payload = fresh.payload || {};

        // Resolve restaurant location/address
        let resolvedRestaurantLocation = null;
        try {
          const pLoc = payload.restaurantLocation;
          if (pLoc && (pLoc.latitude || pLoc.longitude || pLoc?.location?.coordinates?.length)) {
            const lat =
              Number(pLoc.latitude) ||
              Number(pLoc?.location?.coordinates?.[1]) ||
              null;
            const lng =
              Number(pLoc.longitude) ||
              Number(pLoc?.location?.coordinates?.[0]) ||
              null;
            if (lat != null && lng != null) {
              resolvedRestaurantLocation = {
                latitude: lat,
                longitude: lng,
                location: { type: 'Point', coordinates: [lng, lat] },
                formattedAddress: pLoc.formattedAddress || pLoc.address || null,
                address: pLoc.formattedAddress || pLoc.address || null,
              };
            }
          } else if (payload.restaurantId) {
            const { default: Restaurant } = await import('../restaurant/models/Restaurant.js');
            let restaurantDoc = null;
            if (mongoose.Types.ObjectId.isValid(payload.restaurantId)) {
              restaurantDoc = await Restaurant.findById(payload.restaurantId).select('location address').lean();
            }
            if (!restaurantDoc) {
              restaurantDoc = await Restaurant.findOne({
                $or: [{ restaurantId: payload.restaurantId }, { _id: payload.restaurantId }],
              }).select('location address').lean();
            }
            const coords =
              restaurantDoc?.location?.geoLocation?.coordinates?.length
                ? restaurantDoc.location.geoLocation.coordinates
                : restaurantDoc?.location?.coordinates;
            if (coords && coords.length === 2) {
              const [lng, lat] = coords;
              resolvedRestaurantLocation = {
                latitude: Number(lat),
                longitude: Number(lng),
                location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
                formattedAddress:
                  restaurantDoc.location?.formattedAddress || restaurantDoc.address || null,
                address: restaurantDoc.location?.address || restaurantDoc.address || null,
              };
            }
          }
        } catch (e) {
          logger.warn('Could not resolve restaurant location during reconcile:', e?.message || e);
        }

        // Merge additionalAddress into address.additionalDetails
        const baseAddress = payload.address || {};
        const resolvedAddress = {
          ...baseAddress,
          additionalDetails:
            payload.additionalAddress ||
            baseAddress.additionalDetails ||
            baseAddress.additionalAddress ||
            null,
        };

        // Resolve hotel details for QR/Hotel orders if not already resolved
        let resolvedHotelName = payload.hotelName || null;
        let resolvedHotelMongoId = (payload.hotelReference && mongoose.Types.ObjectId.isValid(payload.hotelReference)) ? payload.hotelReference : null;

        if (payload.hotelReference && (!resolvedHotelName || !resolvedHotelMongoId)) {
          try {
            const { default: Hotel } = await import('../hotel/models/Hotel.js');
            const hotelDoc = mongoose.Types.ObjectId.isValid(payload.hotelReference)
              ? await Hotel.findById(payload.hotelReference).select('hotelName _id').lean()
              : await Hotel.findOne({ hotelId: payload.hotelReference }).select('hotelName _id').lean();

            if (hotelDoc) {
              resolvedHotelName = hotelDoc.hotelName || resolvedHotelName;
              resolvedHotelMongoId = hotelDoc._id || resolvedHotelMongoId;
            }
          } catch (e) {
            logger.warn('Could not resolve hotel details during reconcile:', e?.message);
          }
        }

        const orderDoc = new Order({
          orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: fresh.userId,
          restaurantId: payload.restaurantId,
          restaurantName: payload.restaurantName,
          items: payload.items,
          address: resolvedAddress,
          restaurantLocation: resolvedRestaurantLocation,
          pricing: payload.pricing,
          deliveryFleet: payload.deliveryFleet || 'standard',
          note: payload.note || '',
          sendCutlery: payload.sendCutlery !== false,
          status: 'confirmed',
          // Preserve hotel/QR metadata for reconcile-driven creation
          hotelReference: payload.hotelReference || null,
          hotelId: resolvedHotelMongoId,
          qrReferenceId: payload.qrReferenceId || null,
          hotelName: resolvedHotelName,
          orderType: (payload.hotelReference || payload.orderType === 'QR') ? 'QR' : 'DIRECT',
          roomNumber: payload.roomNumber || null,
          payment: {
            method: 'razorpay',
            status: 'completed',
            razorpayOrderId: intent.razorpayOrderId || null,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: null,
            transactionId: razorpay_payment_id,
            paymentIntentId: fresh._id
          },
          tracking: {
            confirmed: { status: true, timestamp: new Date() }
          }
        });

        await orderDoc.save({ session });

        fresh.status = 'succeeded';
        fresh.razorpayPaymentId = razorpay_payment_id;
        fresh.orderId = orderDoc._id;
        await fresh.save({ session });

        // Notify restaurant
        try {
          const { notifyRestaurantNewOrder } = await import('../order/services/restaurantNotificationService.js');
          const restaurantId = orderDoc.restaurantId?.toString() || orderDoc.restaurantId;
          if (restaurantId) {
            await notifyRestaurantNewOrder(orderDoc, restaurantId);
          }
          if (process.env.NODE_ENV !== 'production') {
            logger.info('Order created via reconcile with restaurantLocation:', {
              orderId: orderDoc.orderId,
              hasRestaurantLocation: !!orderDoc.restaurantLocation,
              coords: orderDoc.restaurantLocation?.coordinates,
              formattedAddress: orderDoc.restaurantLocation?.formattedAddress
            });
          }
        } catch (e) {
          logger.error('Failed to notify restaurant during reconcile:', e?.message || e);
        }
      });
      session.endSession();
    }

    const updated = await PaymentIntent.findById(intent._id);
    return res.json({
      success: true,
      data: { status: updated.status, orderId: updated.orderId?.toString() || null }
    });
  } catch (error) {
    logger.error('Error in reconcile endpoint:', error);
    return res.status(500).json({ success: false, message: 'Failed to reconcile payment' });
  }
});

export default router;

