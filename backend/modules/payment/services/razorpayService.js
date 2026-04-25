import Razorpay from 'razorpay';
import crypto from 'crypto';
import winston from 'winston';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';
import { getEnvVar } from '../../../shared/utils/envService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize Razorpay instance
let razorpayInstance = null;
let lastCredFingerprint = null;

const fingerprintCreds = (keyId, keySecret) => {
  const a = String(keyId || '').trim();
  const b = String(keySecret || '').trim();
  // Don't log secrets; fingerprint only for change detection
  return `${a.length}:${b.length}:${a.slice(0, 6)}`;
};

const initializeRazorpay = async () => {
  try {
    const credentials = await getRazorpayCredentials();
    const keyId = credentials.keyId;
    const keySecret = credentials.keySecret;

    // If creds changed since last init, re-init instance
    const fp = fingerprintCreds(keyId, keySecret);
    if (razorpayInstance && lastCredFingerprint && fp !== lastCredFingerprint) {
      logger.warn('Razorpay credentials changed; reinitializing instance', {
        previous: lastCredFingerprint,
        current: fp
      });
      razorpayInstance = null;
    }

    logger.info('Razorpay credentials check:', {
      hasKeyId: !!keyId,
      hasKeySecret: !!keySecret,
      keyIdLength: keyId?.length || 0,
      keySecretLength: keySecret?.length || 0
    });

    if (!keyId || !keySecret) {
      logger.warn('Razorpay credentials not found. Payment gateway will not work.', {
        keyId: keyId ? 'present' : 'missing',
        keySecret: keySecret ? 'present' : 'missing'
      });
      return null;
    }

    try {
      razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      lastCredFingerprint = fp;
      logger.info('Razorpay initialized successfully');
      return razorpayInstance;
    } catch (error) {
      logger.error(`Error initializing Razorpay: ${error.message}`, {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  } catch (error) {
    logger.error(`Error fetching Razorpay credentials: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
};

// Get Razorpay instance
const getRazorpayInstance = async () => {
  // Always ensure instance matches current env creds (fixes stale cached creds).
  const { keyId, keySecret } = await getRazorpayCredentials();
  const fp = fingerprintCreds(keyId, keySecret);

  if (!razorpayInstance || !lastCredFingerprint || fp !== lastCredFingerprint) {
    return await initializeRazorpay();
  }

  return razorpayInstance;
};

/**
 * Create a Razorpay order
 * @param {Object} options - Order options
 * @param {Number} options.amount - Amount in paise (e.g., 10000 for ₹100)
 * @param {String} options.currency - Currency code (default: INR)
 * @param {String} options.receipt - Receipt ID
 * @param {Object} options.notes - Additional notes
 * @returns {Promise<Object>} Razorpay order object
 */
const createOrder = async (options) => {
  logger.info('Creating Razorpay order with options:', {
    amount: options.amount,
    currency: options.currency,
    receipt: options.receipt
  });

  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    logger.error('Razorpay instance is null - credentials may be missing or invalid');
    throw new Error('Razorpay is not initialized. Please check your credentials.');
  }

  try {
    const orderOptions = {
      amount: options.amount, // Amount in paise
      currency: options.currency || 'INR',
      receipt: options.receipt || `receipt_${Date.now()}`,
      notes: options.notes || {}
    };

    logger.info('Calling Razorpay API to create order...');
    const order = await razorpay.orders.create(orderOptions);
    
    logger.info(`Razorpay order created successfully: ${order.id}`, {
      orderId: order.id,
      amount: order.amount,
      receipt: order.receipt,
      status: order.status
    });

    return order;
  } catch (error) {
    logger.error(`Error creating Razorpay order:`, {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: error.statusCode,
      status: error.status,
      options: {
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt
      },
      stack: error.stack
    });
    
    // Return more descriptive error message
    let errorMessage = 'Failed to create payment order';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Verify Razorpay payment signature
 * @param {String} razorpayOrderId - Razorpay order ID
 * @param {String} razorpayPaymentId - Razorpay payment ID
 * @param {String} razorpaySignature - Razorpay signature
 * @returns {Boolean} True if signature is valid
 */
const verifyPayment = async (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  const credentials = await getRazorpayCredentials();
  const keySecret = credentials.keySecret;
  
  if (!keySecret) {
    logger.error('Razorpay key secret not found');
    return false;
  }

  try {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const isValid = generatedSignature === razorpaySignature;
    
    if (!isValid) {
      logger.warn('Invalid Razorpay signature', {
        razorpayOrderId,
        razorpayPaymentId,
        providedSignature: razorpaySignature,
        generatedSignature
      });
    }

    return isValid;
  } catch (error) {
    logger.error(`Error verifying Razorpay payment: ${error.message}`);
    return false;
  }
};

/**
 * Verify Razorpay webhook signature
 * @param {Buffer|string} rawBody - Raw request body as Buffer or string
 * @param {string} headerSignature - Value of 'x-razorpay-signature' header
 * @returns {Promise<boolean>} True if signature is valid
 */
const verifyWebhookSignature = async (rawBody, headerSignature) => {
  try {
    const webhookSecretEnv = await getEnvVar('RAZORPAY_WEBHOOK_SECRET');
    const secret =
      webhookSecretEnv ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.RAZORPAY_WEBHOOK_SIGNING_SECRET ||
      '';

    if (!secret) {
      logger.error('Razorpay webhook secret not configured');
      return false;
    }

    const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const valid = generatedSignature === headerSignature;
    if (!valid) {
      if ((process.env.NODE_ENV || '').toLowerCase() === 'test') {
        const payloadSha256 = crypto.createHash('sha256').update(payload).digest('hex');
        logger.warn('Invalid Razorpay webhook signature', {
          headerSignature,
          generatedSignature,
          payloadLength: payload?.length || 0,
          secretLength: secret?.length || 0,
          payloadSha256
        });
      } else {
        logger.warn('Invalid Razorpay webhook signature');
      }
    }
    return valid;
  } catch (error) {
    logger.error(`Error verifying webhook signature: ${error.message}`);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay
 * @param {String} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
const fetchPayment = async (paymentId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error(`Error fetching Razorpay payment: ${error.message}`);
    throw error;
  }
};

/**
 * Capture an authorized Razorpay payment
 * @param {String} paymentId - Razorpay payment ID
 * @param {Number} amount - Amount in paise to capture
 * @returns {Promise<Object>} Captured payment details
 */
const capturePayment = async (paymentId, amount) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }
  try {
    const captured = await razorpay.payments.capture(paymentId, amount);
    logger.info(`Payment captured: ${captured.id}`, {
      paymentId: captured.id,
      amount: captured.amount,
      status: captured.status
    });
    return captured;
  } catch (error) {
    logger.error(`Error capturing Razorpay payment: ${error.message}`, {
      paymentId,
      amount,
      error: error?.error || error?.description || error
    });
    throw error;
  }
};

/**
 * Create a refund
 * @param {String} paymentId - Razorpay payment ID
 * @param {Number|Object} amountOrOptions - Refund amount in paise OR options object
 * @param {Object} notesOrOptions - Refund notes OR options object (when amount is number)
 * @param {Object} maybeOptions - Optional options { speed, receipt, notes }
 * @returns {Promise<Object>} Refund details
 */
const createRefund = async (paymentId, amountOrOptions = null, notesOrOptions = {}, maybeOptions = {}) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    // Backward-compatible arg parsing:
    // - createRefund(paymentId, amountPaise, notes, options)
    // - createRefund(paymentId, { amount, speed, receipt, notes })
    let amount = null;
    let notes = {};
    let options = {};

    if (amountOrOptions && typeof amountOrOptions === 'object') {
      options = amountOrOptions || {};
      amount = typeof options.amount === 'number' ? options.amount : null;
      notes = options.notes && typeof options.notes === 'object' ? options.notes : {};
    } else {
      amount = typeof amountOrOptions === 'number' ? amountOrOptions : null;
      if (notesOrOptions && typeof notesOrOptions === 'object') {
        // If 3rd arg looks like options (has speed/receipt), treat it as options
        const looksLikeOptions = ('speed' in notesOrOptions) || ('receipt' in notesOrOptions) || ('notes' in notesOrOptions);
        if (looksLikeOptions) {
          options = notesOrOptions || {};
          notes = options.notes && typeof options.notes === 'object' ? options.notes : {};
        } else {
          notes = notesOrOptions || {};
          options = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
        }
      }
    }

    const refundOptions = {};
    if (amount != null) refundOptions.amount = amount;
    if (options?.speed) refundOptions.speed = options.speed;
    if (options?.receipt) refundOptions.receipt = options.receipt;
    refundOptions.notes = notes || {};

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    logger.info(`Refund created: ${refund.id}`, {
      refundId: refund.id,
      paymentId,
      amount: refund.amount
    });

    return refund;
  } catch (error) {
    logger.error(`Error creating refund: ${error.message}`);
    throw error;
  }
};

export {
  initializeRazorpay,
  getRazorpayInstance,
  createOrder,
  verifyPayment,
  verifyWebhookSignature,
  fetchPayment,
  capturePayment,
  createRefund
};

