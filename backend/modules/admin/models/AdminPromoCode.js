import mongoose from "mongoose";

const adminPromoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Promo code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage",
      required: true,
    },
    discountValue: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value cannot be negative"],
    },
    maxDiscount: {
      type: Number,
      default: null, // Cap for percentage discount (e.g. up to ₹100)
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, "Minimum order amount cannot be negative"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    validDays: {
      type: [String],
      enum: [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ],
      default: [], // Empty array means valid on all days
    },
    usageLimitPerUser: {
      type: Number,
      default: 1, // 0 = unlimited per user
      min: 0,
    },
    totalUsageLimit: {
      type: Number,
      default: 0, // 0 = unlimited across all users
      min: 0,
    },
    timesUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    applicableType: {
      type: String,
      enum: ["all", "specific_restaurants"],
      default: "all",
    },
    applicableRestaurants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Restaurant",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
adminPromoCodeSchema.index({ code: 1, isActive: 1 });
adminPromoCodeSchema.index({ startDate: 1, endDate: 1, isActive: 1 });

/**
 * Check if the promo code is currently valid for an order.
 * @param {Object} params
 * @param {number} params.orderAmount - Subtotal or order value
 * @param {Date} [params.currentDate=new Date()] - Date to evaluate against
 * @param {string} [params.restaurantId] - Restaurant ID (optional)
 * @returns {{ isValid: boolean, reason?: string, discountAmount?: number }}
 */
adminPromoCodeSchema.methods.evaluateValidity = function ({
  orderAmount,
  currentDate = new Date(),
  restaurantId = null,
}) {
  if (!this.isActive) {
    return { isValid: false, reason: "Promo code is inactive" };
  }

  const now = new Date(currentDate);

  // Check Start Date (allow from start of that day: 00:00:00.000)
  const startOfDay = new Date(this.startDate);
  startOfDay.setHours(0, 0, 0, 0);
  if (now < startOfDay) {
    return { isValid: false, reason: "Promo code has not started yet" };
  }

  // Check End Date (allow till end of that day: 23:59:59.999)
  const endOfDay = new Date(this.endDate);
  endOfDay.setHours(23, 59, 59, 999);
  if (now > endOfDay) {
    return { isValid: false, reason: "Promo code has expired" };
  }

  // Check Day of Week
  if (Array.isArray(this.validDays) && this.validDays.length > 0) {
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const todayName = dayNames[now.getDay()];
    const normalizedValidDays = this.validDays.map((d) => d.toLowerCase());
    if (!normalizedValidDays.includes(todayName)) {
      return {
        isValid: false,
        reason: `Promo code is only valid on: ${this.validDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}`,
      };
    }
  }

  // Check Total Usage Limit
  if (this.totalUsageLimit > 0 && this.timesUsed >= this.totalUsageLimit) {
    return { isValid: false, reason: "Promo code total usage limit reached" };
  }

  // Check Min Order Amount
  if (this.minOrderAmount > 0 && orderAmount < this.minOrderAmount) {
    return {
      isValid: false,
      reason: `Minimum order amount of ₹${this.minOrderAmount} required`,
    };
  }

  // Check Applicable Restaurants if restricted
  if (
    this.applicableType === "specific_restaurants" &&
    Array.isArray(this.applicableRestaurants) &&
    this.applicableRestaurants.length > 0
  ) {
    if (!restaurantId) {
      return {
        isValid: false,
        reason: "Promo code is not applicable for this restaurant",
      };
    }
    const matches = this.applicableRestaurants.some(
      (rId) => rId.toString() === restaurantId.toString()
    );
    if (!matches) {
      return {
        isValid: false,
        reason: "Promo code is not applicable for this restaurant",
      };
    }
  }

  // Calculate Discount Amount
  let discountAmount = 0;
  if (this.discountType === "percentage") {
    const rawDiscount = (orderAmount * this.discountValue) / 100;
    discountAmount =
      typeof this.maxDiscount === "number" && this.maxDiscount > 0
        ? Math.min(rawDiscount, this.maxDiscount)
        : rawDiscount;
  } else {
    // Flat discount
    discountAmount = Math.min(this.discountValue, orderAmount);
  }

  discountAmount = Math.round(discountAmount * 100) / 100;

  return {
    isValid: true,
    discountAmount,
  };
};

export default mongoose.model("AdminPromoCode", adminPromoCodeSchema);
