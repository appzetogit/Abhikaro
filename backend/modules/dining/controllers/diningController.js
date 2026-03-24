import DiningRestaurant from "../models/DiningRestaurant.js";
import DiningCategory from "../models/DiningCategory.js";
import DiningLimelight from "../models/DiningLimelight.js";
import DiningBankOffer from "../models/DiningBankOffer.js";
import DiningMustTry from "../models/DiningMustTry.js";
import DiningOfferBanner from "../models/DiningOfferBanner.js";
import DiningStory from "../models/DiningStory.js";
import TableBooking from "../models/TableBooking.js";
import DiningReview from "../models/DiningReview.js";
import DiningCoupon from "../models/DiningCoupon.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import RestaurantDiningOffer from "../../restaurant/models/RestaurantDiningOffer.js";
import RestaurantWallet from "../../restaurant/models/RestaurantWallet.js";
import emailService from "../../auth/services/emailService.js";
import {
  createOrder as createRazorpayOrder,
  verifyPayment as verifyRazorpayPayment,
} from "../../payment/services/razorpayService.js";
import { getRazorpayCredentials } from "../../../shared/utils/envService.js";

// Get all dining restaurants (with filtering)
export const getRestaurants = async (req, res) => {
  try {
    const { city } = req.query;
    const query = {
      isActive: true,
      "diningSettings.isEnabled": true,
    };

    if (city) {
      const cityRegex = new RegExp(city, "i");
      query.$or = [
        { "location.city": cityRegex },
        { "location.address": cityRegex },
        { "location.formattedAddress": cityRegex },
        { "onboarding.step1.city": cityRegex },
      ];
    }

    const restaurants = await Restaurant.find(query)
      .select("-password -refreshToken")
      .lean();

    const fallbackQuery = city
      ? { location: { $regex: city, $options: "i" } }
      : {};
    const fallbackRestaurants =
      restaurants.length === 0
        ? await DiningRestaurant.find(fallbackQuery).lean()
        : [];
    const dataToSend = restaurants.length > 0 ? restaurants : fallbackRestaurants;

    res.status(200).json({
      success: true,
      count: dataToSend.length,
      data: dataToSend,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// Get single restaurant by slug (also supports _id and name-based slug fallback)
export const getRestaurantBySlug = async (req, res) => {
  try {
    const slugParam = req.params.slug;
    let actualRestaurant = null;

    // 1. Try finding by slug in DiningRestaurant
    actualRestaurant = await DiningRestaurant.findOne({ slug: slugParam });

    // 2. Try finding by slug in Restaurant
    if (!actualRestaurant) {
      actualRestaurant = await Restaurant.findOne({ slug: slugParam })
        .select('-password -refreshToken');
    }

    // 3. Try finding by _id (if slugParam looks like a valid ObjectId)
    if (!actualRestaurant && slugParam.match(/^[0-9a-fA-F]{24}$/)) {
      actualRestaurant = await Restaurant.findById(slugParam)
        .select('-password -refreshToken');
      if (!actualRestaurant) {
        actualRestaurant = await DiningRestaurant.findById(slugParam);
      }
    }

    // 4. Fallback: Try matching by name-derived slug
    //    (handles case where restaurant has no slug field in DB but frontend generated one from name)
    if (!actualRestaurant) {
      const allDiningRestaurants = await Restaurant.find({
        isActive: true,
        'diningSettings.isEnabled': true
      }).select('-password -refreshToken').lean();

      actualRestaurant = allDiningRestaurants.find((r) => {
        const name = r?.onboarding?.step1?.restaurantName || r?.name || '';
        const generatedSlug = name.toLowerCase().replace(/\s+/g, '-');
        return generatedSlug === slugParam;
      });

      // Also check DiningRestaurant collection by name
      if (!actualRestaurant) {
        const allDining = await DiningRestaurant.find({}).lean();
        actualRestaurant = allDining.find((r) => {
          const name = r?.name || '';
          const generatedSlug = name.toLowerCase().replace(/\s+/g, '-');
          return generatedSlug === slugParam;
        });
      }
    }

    if (!actualRestaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // Prevent caching so Dining Management updates show immediately on the public page
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.status(200).json({
      success: true,
      data: actualRestaurant,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = await DiningCategory.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getLimelight = async (req, res) => {
  try {
    const limelights = await DiningLimelight.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: limelights.length,
      data: limelights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getBankOffers = async (req, res) => {
  try {
    const offers = await DiningBankOffer.find({ isActive: true });
    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getMustTries = async (req, res) => {
  try {
    const mustTries = await DiningMustTry.find({ isActive: true }).sort({
      order: 1,
    });
    res.status(200).json({
      success: true,
      count: mustTries.length,
      data: mustTries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getOfferBanners = async (req, res) => {
  try {
    const banners = await DiningOfferBanner.find({ isActive: true })
      .populate("restaurant", "name slug")
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const getStories = async (req, res) => {
  try {
    const stories = await DiningStory.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      success: true,
      count: stories.length,
      data: stories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const createBooking = async (req, res) => {
  try {
    const { restaurant, guests, date, timeSlot, specialRequest } = req.body;
    const userId = req.user._id;

    const booking = await TableBooking.create({
      restaurant,
      user: userId,
      guests,
      date,
      timeSlot,
      specialRequest,
      status: "confirmed",
    });

    let populatedBooking = await TableBooking.findById(booking._id).populate(
      "restaurant",
      "name location image",
    );
    let bookingObj = populatedBooking.toObject();

    if (!bookingObj.restaurant || typeof bookingObj.restaurant === "string") {
      const diningRes = await DiningRestaurant.findById(
        booking.restaurant,
      ).select("name location image");
      if (diningRes) {
        bookingObj.restaurant = diningRes;
      }
    }

    res.status(201).json({
      success: true,
      message: "Booking confirmed successfully",
      data: bookingObj,
    });

    if (req.user.email) {
      emailService
        .sendBookingConfirmation(req.user.email, bookingObj)
        .catch((err) => {
          console.error("Failed to send booking confirmation email:", err);
        });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

export const getUserBookings = async (req, res) => {
  try {
    const bookings = await TableBooking.find({ user: req.user._id })
      .populate("restaurant", "name location image")
      .sort({ createdAt: -1 });

    const processedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const bookingObj = booking.toObject();

        if (
          !bookingObj.restaurant ||
          typeof bookingObj.restaurant === "string"
        ) {
          const diningRes = await DiningRestaurant.findById(
            booking.restaurant,
          ).select("name location image");
          if (diningRes) {
            bookingObj.restaurant = diningRes;
          }
        }
        return bookingObj;
      }),
    );

    res.status(200).json({
      success: true,
      count: processedBookings.length,
      data: processedBookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
};

export const getRestaurantBookings = async (req, res) => {
  try {
    const restaurantId = req.restaurant ? req.restaurant._id : req.params.restaurantId;
    if (req.restaurant && req.params.restaurantId && req.params.restaurantId !== restaurantId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to view this restaurant's bookings" });
    }

    const bookings = await TableBooking.find({ restaurant: restaurantId })
      .populate("user", "name phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch restaurant bookings",
      error: error.message,
    });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, cancellationReason } = req.body;
    const booking = await TableBooking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // User route: only booking owner can cancel a booking
    if (req.user) {
      if (booking.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized for this booking",
        });
      }

      if (status !== "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Users can only cancel bookings",
        });
      }

      if (!["pending", "confirmed"].includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: "Only pending or confirmed bookings can be cancelled",
        });
      }

      if (booking.paymentStatus === "paid" || booking.billStatus === "completed") {
        return res.status(400).json({
          success: false,
          message: "Paid bookings cannot be cancelled",
        });
      }
    }

    // Restaurant route: only owning restaurant can update booking
    if (req.restaurant) {
      if (booking.restaurant.toString() !== req.restaurant._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this booking",
        });
      }
    }

    booking.status = status;
    if (status === "checked-in") {
      booking.checkInTime = new Date();
    } else if (status === "completed" || status === "dining_completed") {
      booking.checkOutTime = new Date();
    } else if (status === "cancelled") {
      booking.cancelledAt = new Date();
      booking.cancelledBy = req.user ? "user" : req.restaurant ? "restaurant" : "admin";
      if (cancellationReason != null) {
        booking.cancellationReason = String(cancellationReason).trim();
      }
    }
    await booking.save();

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      data: booking,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
      error: error.message,
    });
  }
};

export const createDiningReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user._id;

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to review this booking",
      });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "You can only review completed bookings",
      });
    }

    const review = await DiningReview.create({
      booking: bookingId,
      user: userId,
      restaurant: booking.restaurant,
      rating,
      comment,
    });

    res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
};

export const sendBill = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { billAmount, note } = req.body;
    const restaurantId = req.restaurant._id;

    if (!billAmount || typeof billAmount !== "number" || billAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid bill amount is required",
      });
    }

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.restaurant.toString() !== restaurantId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.status !== "dining_completed") {
      return res.status(400).json({
        success: false,
        message: "Bill can only be sent when booking status is Dining Completed",
      });
    }
    if (booking.billStatus !== "not_sent") {
      return res.status(400).json({
        success: false,
        message: booking.paymentStatus === "paid" ? "Bill already paid" : "Bill already sent",
      });
    }

    booking.billAmount = billAmount;
    booking.discountAmount = 0;
    booking.finalAmount = billAmount;
    booking.billStatus = "pending";
    booking.billSentAt = new Date();
    if (note != null) booking.billNote = String(note).trim();
    await booking.save();

    res.status(200).json({
      success: true,
      message: "Bill sent successfully",
      data: booking,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send bill",
      error: error.message,
    });
  }
};

export const applyCoupon = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { code } = req.body;
    const userId = req.user._id || req.user.id;

    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const booking = await TableBooking.findById(bookingId).populate("appliedCoupon");
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.billStatus !== "pending" || booking.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Coupon can only be applied to a pending, unpaid bill",
      });
    }

    const coupon = await DiningCoupon.findOne({ code: String(code).trim().toUpperCase() });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }
    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: "This coupon is not active" });
    }
    if (coupon.expiryDate < new Date()) {
      return res.status(400).json({ success: false, message: "This coupon has expired" });
    }
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }
    if (booking.billAmount < (coupon.minBillAmount || 0)) {
      return res.status(400).json({
        success: false,
        message: `Minimum bill amount for this coupon is ₹${coupon.minBillAmount}`,
      });
    }

    let discount = 0;
    if (coupon.discountType === "percentage") {
      discount = (booking.billAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = Math.min(coupon.discountValue, booking.billAmount);
    }
    const finalAmount = Math.max(0, booking.billAmount - discount);

    const wasAlreadyApplied = booking.appliedCoupon && booking.appliedCoupon.toString() === coupon._id.toString();
    booking.appliedCoupon = coupon._id;
    booking.discountAmount = discount;
    booking.finalAmount = finalAmount;
    await booking.save();

    if (!wasAlreadyApplied) {
      coupon.usedCount += 1;
      await coupon.save();
    }

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        discountAmount: discount,
        finalAmount,
        billAmount: booking.billAmount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
      error: error.message,
    });
  }
};

export const createDiningPaymentOrder = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id || req.user.id;

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.billStatus !== "pending" || booking.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "No pending bill to pay for this booking",
      });
    }
    const amountToPay = booking.finalAmount;
    if (!amountToPay || amountToPay <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payable amount" });
    }

    const amountInPaise = Math.round(amountToPay * 100);
    let receipt = `dining_${booking._id.toString().slice(-8)}_${Date.now()
      .toString()
      .slice(-6)}`;
    if (receipt.length > 40) {
      receipt = receipt.slice(0, 40);
    }
    const razorpayOrder = await createRazorpayOrder({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: { bookingId: booking._id.toString(), type: "dining" },
    });

    booking.razorpayOrderId = razorpayOrder.id;
    await booking.save();

    const credentials = await getRazorpayCredentials();
    const keyId = credentials?.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;

    res.status(200).json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key_id: keyId,
        finalAmount: amountToPay,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    });
  }
};

export const verifyDiningPayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id || req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are required",
      });
    }

    const booking = await TableBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized for this booking" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Bill already paid" });
    }
    if (booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: "Payment order mismatch" });
    }

    const isValid = await verifyRazorpayPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const restaurant = await Restaurant.findById(booking.restaurant)
      .select("diningCommissionPercentage")
      .lean();
    const commissionPercentage = restaurant?.diningCommissionPercentage ?? 0;
    const finalAmount = booking.finalAmount;
    const commissionAmount = (finalAmount * commissionPercentage) / 100;
    const restaurantEarning = finalAmount - commissionAmount;
    const adminEarning = commissionAmount;

    booking.paymentStatus = "paid";
    booking.billStatus = "completed";
    booking.paidAt = new Date();
    booking.razorpayOrderId = undefined;
    booking.commissionAmount = commissionAmount;
    booking.restaurantEarning = restaurantEarning;
    booking.adminEarning = adminEarning;
    await booking.save();

    const wallet = await RestaurantWallet.findOrCreateByRestaurantId(booking.restaurant);
    wallet.addTransaction({
      amount: restaurantEarning,
      type: "payment",
      status: "Completed",
      description: `Dining bill #${booking.bookingId || booking._id}`,
    });
    await wallet.save();

    res.status(200).json({
      success: true,
      message: "Payment successful",
      data: {
        paymentStatus: "paid",
        paidAt: booking.paidAt,
        finalAmount,
        commissionAmount,
        restaurantEarning,
        adminEarning,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: error.message,
    });
  }
};

export const getDiningOffersBySlug = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug })
      .select("_id")
      .lean();
    if (!restaurant) {
      return res
        .status(404)
        .json({ success: false, message: "Restaurant not found" });
    }
    const offers = await RestaurantDiningOffer.find({
      restaurant: restaurant._id,
      isActive: true,
    })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

