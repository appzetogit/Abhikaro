import express from 'express';
import { initializeRazorpay, createOrder as createRazorpayOrder, verifyPayment, verifyWebhookSignature, fetchPayment, fetchOrderPayments, capturePayment } from './services/razorpayService.js';
import PaymentIntent from './models/PaymentIntent.js';
import { authenticate } from '../auth/middleware/auth.js';
import winston from 'winston';
import { getRazorpayCredentials } from '../../shared/utils/envService.js';
import Order from '../order/models/Order.js';
import OrderSettlement from '../order/models/OrderSettlement.js';
import mongoose from 'mongoose';
import { validateOrderDeliveryAndZone } from '../../shared/utils/orderZoneValidator.js';
import etaCalculationService from '../order/services/etaCalculationService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

async function computeDynamicOrderETA(payload, resolvedAddress, resolvedRestaurantLocation) {
  try {
    // 1. Prefer ETA already computed during checkout calculation (instant, avoids redundant external calls)
    const pEta = payload?.pricing?.eta;
    if (pEta && (pEta.totalETA || pEta.foodPreparationTime || pEta.minETA)) {
      const minETA = pEta.minETA || Math.max(1, (pEta.totalETA || 30) - 3);
      const maxETA = pEta.maxETA || ((pEta.totalETA || 30) + 3);
      const prepTime = pEta.foodPreparationTime || 15;
      const estTime = pEta.totalETA || Math.ceil((minETA + maxETA) / 2);
      return {
        preparationTime: prepTime,
        estimatedDeliveryTime: estTime,
        eta: {
          min: minETA,
          max: maxETA,
          lastUpdated: new Date(),
          additionalTime: 0,
        },
        etaDetails: {
          foodPreparationTime: pEta.foodPreparationTime || prepTime,
          deliveryTime: pEta.deliveryTime || 15,
          totalETA: estTime,
          distanceKm: pEta.distanceKm || 2.0,
          mainItem: pEta.mainItem || null,
          itemsBreakdown: pEta.itemsBreakdown || [],
          calculatedAt: new Date(),
        },
        enrichedItems: pEta.enrichedItems || payload.items
      };
    }

    const restaurantLocation = resolvedRestaurantLocation
      ? {
          latitude: resolvedRestaurantLocation.latitude || resolvedRestaurantLocation.location?.coordinates?.[1] || resolvedRestaurantLocation.coordinates?.[1],
          longitude: resolvedRestaurantLocation.longitude || resolvedRestaurantLocation.location?.coordinates?.[0] || resolvedRestaurantLocation.coordinates?.[0],
        }
      : null;

    const userLocation = resolvedAddress?.location?.coordinates
      ? {
          latitude: resolvedAddress.location.coordinates[1],
          longitude: resolvedAddress.location.coordinates[0],
        }
      : resolvedAddress?.latitude && resolvedAddress?.longitude
      ? {
          latitude: resolvedAddress.latitude,
          longitude: resolvedAddress.longitude,
        }
      : null;

    // Run dynamic ETA with a strict 2.5-second timeout to ensure payment verification never hangs
    const etaPromise = etaCalculationService.calculateDynamicETA({
      items: payload.items,
      restaurantId: payload.restaurantId,
      restaurantLocation,
      userLocation,
    });
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
    const dynamicETA = await Promise.race([etaPromise, timeoutPromise]);

    const calculatedPrepTime = dynamicETA?.foodPreparationTime || 15;
    const finalMinETA = dynamicETA?.minETA || 25;
    const finalMaxETA = dynamicETA?.maxETA || 35;
    const finalEstimatedTime = dynamicETA?.totalETA || Math.ceil((finalMinETA + finalMaxETA) / 2);

    return {
      preparationTime: calculatedPrepTime,
      estimatedDeliveryTime: finalEstimatedTime,
      eta: {
        min: finalMinETA,
        max: finalMaxETA,
        lastUpdated: new Date(),
        additionalTime: 0,
      },
      etaDetails: dynamicETA ? {
        foodPreparationTime: dynamicETA.foodPreparationTime,
        deliveryTime: dynamicETA.deliveryTime,
        totalETA: dynamicETA.totalETA,
        distanceKm: dynamicETA.distanceKm,
        mainItem: dynamicETA.mainItem,
        itemsBreakdown: dynamicETA.itemsBreakdown,
        calculatedAt: new Date(),
      } : null,
      enrichedItems: dynamicETA?.enrichedItems || payload.items
    };
  } catch (err) {
    logger.warn('⚠️ Could not compute dynamic ETA for online order: ' + err.message);
    return null;
  }
}

/**
 * Idempotently and reliably finalize a paid order from PaymentIntent.
 * Used by /verify, /reconcile, /webhook, and /status auto-heal.
 */
export async function finalizePaidOrder({
  intentId,
  razorpayPaymentId = null,
  razorpaySignature = null,
  razorpayOrderId = null,
  reqUser = null,
  source = 'unknown'
}) {
  logger.info(`[finalizePaidOrder] Invoked from source="${source}" for intent=${intentId}`);

  const intent = await PaymentIntent.findById(intentId);
  if (!intent) {
    logger.warn(`[finalizePaidOrder] Intent not found: ${intentId}`);
    return { success: false, message: 'Payment intent not found' };
  }

  // Idempotency: If order already created, return immediately
  if (intent.orderId) {
    const existingOrder = await Order.findById(intent.orderId).select('_id orderId status').lean();
    logger.info(`[finalizePaidOrder] Order already exists: ${existingOrder?.orderId || intent.orderId}`);
    return {
      success: true,
      orderId: intent.orderId,
      order: existingOrder,
      alreadyCreated: true
    };
  }

  // Mark processing
  if (intent.status !== 'processing') {
    intent.status = 'processing';
    if (razorpayPaymentId) intent.razorpayPaymentId = razorpayPaymentId;
    if (razorpaySignature) intent.razorpaySignature = razorpaySignature;
    await intent.save();
  }

  const payload = intent.payload || {};

  // 1. Resolve restaurant location/address BEFORE starting database transaction
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
          location: {
            type: 'Point',
            coordinates: [lng, lat],
          },
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
          formattedAddress: restaurantDoc.location?.formattedAddress || restaurantDoc.address || null,
          address: restaurantDoc.location?.address || restaurantDoc.address || null,
        };
      }
    }
  } catch (e) {
    logger.warn(`[finalizePaidOrder] Could not resolve restaurant location (${source}):`, e?.message || e);
  }

  // 2. Resolve delivery address
  const baseAddress = payload.address || {};
  const resolvedAddress = {
    ...baseAddress,
    additionalDetails:
      payload.additionalAddress ||
      baseAddress.additionalDetails ||
      baseAddress.additionalAddress ||
      null,
  };

  // 3. Resolve hotel details for QR/Hotel orders
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
      logger.warn(`[finalizePaidOrder] Could not resolve hotel details (${source}):`, e?.message);
    }
  }

  // 4. Dynamic ETA (fast path with payload.pricing.eta, or 2.5s strict timeout)
  const etaInfo = await computeDynamicOrderETA(payload, resolvedAddress, resolvedRestaurantLocation);

  const effectiveRzpOrderId = razorpayOrderId || intent.razorpayOrderId || null;
  const effectiveRzpPaymentId = razorpayPaymentId || intent.razorpayPaymentId || null;
  const effectiveRzpSignature = razorpaySignature || intent.razorpaySignature || null;

  const orderDoc = new Order({
    orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId: intent.userId,
    userName: payload.userName || (typeof reqUser === 'object' && (reqUser?.name || reqUser?.fullName)) || null,
    userPhone: payload.userPhone || (typeof reqUser === 'object' && reqUser?.phone) || null,
    restaurantId: payload.restaurantId,
    restaurantName: payload.restaurantName,
    items: etaInfo?.enrichedItems || payload.items,
    preparationTime: etaInfo?.preparationTime || 0,
    estimatedDeliveryTime: etaInfo?.estimatedDeliveryTime || 30,
    eta: etaInfo?.eta || { min: 25, max: 30, lastUpdated: new Date(), additionalTime: 0 },
    etaDetails: etaInfo?.etaDetails || undefined,
    address: resolvedAddress,
    restaurantLocation: resolvedRestaurantLocation,
    pricing: payload.pricing,
    deliveryFleet: payload.deliveryFleet || 'standard',
    note: payload.note || '',
    sendCutlery: payload.sendCutlery !== false,
    status: 'confirmed',
    zoneId: payload.zoneId || null,
    zoneName: payload.zoneName || null,
    hotelReference: payload.hotelReference || null,
    hotelId: resolvedHotelMongoId,
    qrReferenceId: payload.qrReferenceId || null,
    hotelName: resolvedHotelName,
    orderType: (payload.hotelReference || payload.orderType === 'QR') ? 'QR' : 'DIRECT',
    roomNumber: payload.roomNumber || null,
    payment: {
      method: 'razorpay',
      status: 'completed',
      razorpayOrderId: effectiveRzpOrderId,
      razorpayPaymentId: effectiveRzpPaymentId,
      razorpaySignature: effectiveRzpSignature,
      transactionId: effectiveRzpPaymentId,
      paymentIntentId: intent._id
    },
    tracking: {
      confirmed: { status: true, timestamp: new Date() }
    }
  });

  // 5. Atomic persistence: Try MongoDB session transaction first, fallback to direct document save
  let savedOrder = null;
  let session = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const fresh = await PaymentIntent.findById(intent._id).session(session);
      if (fresh?.orderId) {
        savedOrder = await Order.findById(fresh.orderId).session(session);
        return;
      }
      await orderDoc.save({ session });
      fresh.status = 'succeeded';
      if (effectiveRzpPaymentId) fresh.razorpayPaymentId = effectiveRzpPaymentId;
      if (effectiveRzpSignature) fresh.razorpaySignature = effectiveRzpSignature;
      fresh.orderId = orderDoc._id;
      await fresh.save({ session });
      savedOrder = orderDoc;
    });
  } catch (txnError) {
    logger.warn(`[finalizePaidOrder] Transaction failed (${txnError.message}), using safe direct save fallback`);
    const freshCheck = await PaymentIntent.findById(intent._id);
    if (freshCheck?.orderId) {
      savedOrder = await Order.findById(freshCheck.orderId);
    } else {
      await orderDoc.save();
      freshCheck.status = 'succeeded';
      if (effectiveRzpPaymentId) freshCheck.razorpayPaymentId = effectiveRzpPaymentId;
      if (effectiveRzpSignature) freshCheck.razorpaySignature = effectiveRzpSignature;
      freshCheck.orderId = orderDoc._id;
      await freshCheck.save();
      savedOrder = orderDoc;
    }
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch (_) {}
    }
  }

  const finalOrderId = savedOrder?._id || intent.orderId;
  logger.info(`[finalizePaidOrder] Order successfully finalized: MongoID=${finalOrderId}, OrderID=${savedOrder?.orderId}`);

  // 6. Post-order side effects (non-blocking outside transaction)
  if (savedOrder) {
    // Notify restaurant
    try {
      const { notifyRestaurantNewOrder } = await import('../order/services/restaurantNotificationService.js');
      const restaurantId = savedOrder.restaurantId?.toString() || savedOrder.restaurantId;
      if (restaurantId) {
        await notifyRestaurantNewOrder(savedOrder, restaurantId);
      }
    } catch (e) {
      logger.error('[finalizePaidOrder] Failed to notify restaurant:', e?.message || e);
    }

    // Hotel QR commission
    try {
      const isHotelQROrder = (savedOrder.hotelId || savedOrder.hotelReference) && savedOrder.orderType === 'QR';
      if (isHotelQROrder && !savedOrder.commissionDistributed) {
        const { distributeCommissions } = await import('../order/services/commissionDistributionService.js');
        await distributeCommissions(savedOrder._id);
        logger.info(`[finalizePaidOrder] Hotel QR commission distributed for order ${savedOrder.orderId}`);
      }
    } catch (distErr) {
      logger.error('[finalizePaidOrder] Failed to distribute QR commission (non-blocking):', distErr?.message || distErr);
    }

    // Push notification to user
    try {
      const { notifyUserOrderPlaced } = await import('../fcm/services/pushNotificationService.js');
      await notifyUserOrderPlaced(savedOrder);
    } catch (e) {
      logger.warn('[finalizePaidOrder] User push notify failed (non-blocking):', e?.message || e);
    }
  }

  return {
    success: true,
    orderId: finalOrderId,
    order: savedOrder
  };
}

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

    // CRITICAL: Strict delivery zone, restaurant active status, and max distance validation
    const zoneCheck = await validateOrderDeliveryAndZone({
      restaurantId: payload.restaurantId,
      deliveryAddress: payload.address,
      clientZoneId: payload.zoneId,
      hotelReference: payload.hotelReference,
    });

    if (!zoneCheck.isValid) {
      logger.warn(`🚫 Rejected Razorpay order init outside delivery zone: ${zoneCheck.message}`, {
        restaurantId: payload.restaurantId,
        userLat: zoneCheck.userLat,
        userLng: zoneCheck.userLng,
        distanceKm: zoneCheck.distanceKm
      });
      return res.status(zoneCheck.statusCode || 403).json({
        success: false,
        message: zoneCheck.message,
      });
    }

    // Attach resolved zone information to payload
    payload.zoneId = zoneCheck.restaurantZone?._id?.toString() || payload.zoneId;
    payload.zoneName = zoneCheck.restaurantZone?.name || zoneCheck.restaurantZone?.zoneName || null;
    if (zoneCheck.restaurantLat && zoneCheck.restaurantLng && !payload.restaurantLocation) {
      payload.restaurantLocation = {
        latitude: zoneCheck.restaurantLat,
        longitude: zoneCheck.restaurantLng,
        location: {
          type: 'Point',
          coordinates: [zoneCheck.restaurantLng, zoneCheck.restaurantLat],
        },
        formattedAddress: zoneCheck.restaurant?.location?.formattedAddress || zoneCheck.restaurant?.address || null,
        address: zoneCheck.restaurant?.location?.address || zoneCheck.restaurant?.address || null,
      };
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

    const result = await finalizePaidOrder({
      intentId: intent._id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      razorpayOrderId: razorpay_order_id,
      reqUser: req.user,
      source: 'verify'
    });

    if (!result.success || !result.orderId) {
      return res.status(500).json({ success: false, message: result.message || 'Failed to place order' });
    }

    return res.json({
      success: true,
      data: {
        status: 'succeeded',
        orderId: result.orderId.toString()
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
        await finalizePaidOrder({
          intentId: intent._id,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          source: 'webhook'
        });
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
    try {
      const { default: WebhookDeadLetter } = await import('./models/WebhookDeadLetter.js');
      await WebhookDeadLetter.create({
        eventType: event?.event || 'unknown',
        rawEvent: event || req.body || {},
        reason: `webhook_error: ${error.message}`,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id || null,
        notes: `Webhook execution failed: ${error.stack}`
      });
    } catch (dlqErr) {
      logger.warn('Failed to write webhook dead-letter on webhook catch:', { error: dlqErr?.message });
    }
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
    const intent = await PaymentIntent.findOne({ _id: intentId, userId });
    if (!intent) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    if (intent.status === 'succeeded' && intent.orderId) {
      return res.json({
        success: true,
        data: {
          status: 'succeeded',
          orderId: String(intent.orderId)
        }
      });
    }

    // Auto-heal: If intent is stuck in processing or created, check Razorpay directly
    if (!intent.orderId && (intent.status === 'processing' || intent.status === 'created') && intent.razorpayOrderId) {
      try {
        const paymentsList = await fetchOrderPayments(intent.razorpayOrderId);
        const successful = (paymentsList?.items || []).find(p => p.status === 'captured' || p.status === 'authorized');
        if (successful) {
          logger.info(`[status:autoheal] Found successful payment ${successful.id} for stuck intent ${intent._id}`);
          if (successful.status === 'authorized') {
            try {
              await capturePayment(successful.id, intent.amount || successful.amount);
            } catch (capErr) {
              logger.warn('[status:autoheal] Capture warning:', capErr.message);
            }
          }
          const healResult = await finalizePaidOrder({
            intentId: intent._id,
            razorpayPaymentId: successful.id,
            razorpayOrderId: intent.razorpayOrderId,
            reqUser: req.user,
            source: 'status_autoheal'
          });
          if (healResult.success && healResult.orderId) {
            return res.json({
              success: true,
              data: {
                status: 'succeeded',
                orderId: String(healResult.orderId)
              }
            });
          }
        }
      } catch (healErr) {
        logger.warn('[status:autoheal] Auto-heal check warning (non-blocking):', healErr?.message);
      }
    }

    return res.json({
      success: true,
      data: {
        status: intent.status,
        orderId: intent.orderId ? String(intent.orderId) : null
      }
    });
  } catch (error) {
    logger.error('Error fetching payment status:', error);
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

    const result = await finalizePaidOrder({
      intentId: intent._id,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: intent.razorpayOrderId,
      reqUser: req.user,
      source: 'reconcile'
    });

    if (!result.success || !result.orderId) {
      return res.status(500).json({ success: false, message: result.message || 'Failed to reconcile payment' });
    }

    return res.json({
      success: true,
      data: {
        status: 'succeeded',
        orderId: result.orderId.toString()
      }
    });
  } catch (error) {
    logger.error('Error in reconcile endpoint:', error);
    return res.status(500).json({ success: false, message: 'Failed to reconcile payment' });
  }
});

export default router;

