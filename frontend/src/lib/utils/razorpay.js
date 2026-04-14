/**
 * Razorpay Payment Integration Utility
 * Handles Razorpay payment initialization and verification
 */

let razorpayLoaded = false;

const isProbablyWebView = () => {
  try {
    const ua = String(navigator?.userAgent || "");
    // Common WebView indicators:
    // - Android WebView: "; wv" or "Version/x.x" without Chrome brand
    // - iOS WebView: AppleWebKit but missing Safari
    const isAndroid = /Android/i.test(ua);
    const hasWv = /\bwv\b/i.test(ua);
    const hasVersion = /Version\/\d+/i.test(ua);
    const hasSafari = /Safari/i.test(ua);
    const isIOSWebView = /iPhone|iPad|iPod/i.test(ua) && !hasSafari;
    return (isAndroid && (hasWv || hasVersion)) || isIOSWebView;
  } catch {
    return false;
  }
};

/**
 * Load Razorpay checkout script
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    if (razorpayLoaded) {
      resolve();
      return;
    }

    if (window.Razorpay) {
      razorpayLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      razorpayLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Razorpay script'));
    };
    document.body.appendChild(script);
  });
};

/**
 * Initialize Razorpay payment
 * @param {Object} options - Payment options
 * @param {String} options.key - Razorpay key ID
 * @param {String} options.amount - Amount in paise
 * @param {String} options.currency - Currency code
 * @param {String} options.order_id - Razorpay order ID
 * @param {String} options.name - Company/App name
 * @param {String} options.description - Payment description
 * @param {String} options.prefill.name - Customer name
 * @param {String} options.prefill.email - Customer email
 * @param {String} options.prefill.contact - Customer phone
 * @param {Object} options.notes - Additional notes
 * @param {Function} options.handler - Success callback
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onClose - Close callback
 */
export const initRazorpayPayment = async (options) => {
  try {
    // Load Razorpay script if not already loaded
    await loadRazorpayScript();

    if (!window.Razorpay) {
      throw new Error('Razorpay SDK not available');
    }

    const razorpayOptions = {
      key: options.key,
      amount: options.amount,
      currency: options.currency || 'INR',
      order_id: options.order_id,
      name: options.name || 'Food Delivery',
      description: options.description || 'Order Payment',
      image: options.image || '/logo.png',
      // Explicitly enable all commonly-used methods. Razorpay will hide methods not enabled on the account/device.
      // This fixes cases where some environments (e.g., in-app webviews) don't show UPI by default.
      method: options.method || {
        upi: true,
        card: true,
        netbanking: true,
        wallet: true,
        emi: true,
        paylater: true,
      },
      // Allow redirect/deep-link for UPI intent apps (GPay/PhonePe/etc.)
      // Razorpay will still use in-modal UI where applicable.
      redirect: options.redirect ?? true,
      // Razorpay requirement for enabling UPI Intent inside Android WebView checkout.
      // See: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-android/
      webview_intent: options.webview_intent ?? isProbablyWebView(),
      prefill: {
        name: options.prefill?.name || '',
        email: options.prefill?.email || '',
        contact: options.prefill?.contact || ''
      },
      notes: options.notes || {},
      theme: {
        color: '#E23744'
      },
      handler: function(response) {
        if (options.handler) {
          options.handler(response);
        }
      },
      modal: {
        ondismiss: function() {
          if (options.onClose) {
            options.onClose();
          }
        },
        // Ensure modal is clickable
        escape: true,
        animation: true
      },
      // Ensure proper z-index
      retry: {
        enabled: true,
        max_count: 3
      }
    };

    // Prefer Razorpay default Checkout UI (best chance to show UPI intent apps list).
    if (options.config) {
      razorpayOptions.config = options.config;
    }

    const razorpay = new window.Razorpay(razorpayOptions);
    
    // Handle payment failures
    razorpay.on('payment.failed', function(response) {
      console.error('Razorpay payment failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Payment failed. Please try again.' });
      }
    });

    // Handle payment method selection failures
    razorpay.on('payment.method_selection_failed', function(response) {
      console.error('Razorpay payment method selection failed:', response);
      if (options.onError) {
        options.onError(response.error || { description: 'Please select another payment method.' });
      }
    });

    // Open Razorpay modal
    razorpay.open();
    
    console.log('✅ Razorpay checkout opened successfully');
    console.log('Razorpay options:', {
      key: razorpayOptions.key ? 'Present' : 'Missing',
      amount: razorpayOptions.amount,
      order_id: razorpayOptions.order_id
    });

    return razorpay;
  } catch (error) {
    console.error('Error initializing Razorpay:', error);
    if (options.onError) {
      options.onError(error);
    }
    throw error;
  }
};

/**
 * Format amount for display
 * @param {Number} amount - Amount in paise
 * @returns {String} Formatted amount string
 */
export const formatAmount = (amount) => {
  return `₹${(amount / 100).toFixed(2)}`;
};

