import mongoose from "mongoose";

const businessSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      default: "Food Delivery",
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      default: "",
    },
    region: {
      type: String,
      required: true,
      enum: ["India", "UK", "US"],
      default: "India",
    },
    phone: {
      countryCode: {
        type: String,
        required: false,
        default: "+91",
      },
      number: {
        type: String,
        required: false,
        trim: true,
        default: "",
      },
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    logo: {
      url: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },
    favicon: {
      url: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },
    maintenanceMode: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      startDate: {
        type: Date,
        default: null,
      },
      endDate: {
        type: Date,
        default: null,
      },
    },
    // Global Delivery Partner cash limit (applies to all delivery partners)
    // Used for "Available cash limit" in delivery Pocket/Wallet UI.
    deliveryCashLimit: {
      type: Number,
      default: 750,
      min: 0,
    },
    // Minimum amount above which delivery boy can withdraw. Withdrawal allowed only when withdrawable amount >= this.
    deliveryWithdrawalLimit: {
      type: Number,
      default: 100,
      min: 0,
    },
    // Delivery assignment mode: 'automatic' or 'manual'
    // automatic: When restaurant accepts order, automatically send request to nearby delivery boys
    // manual: When restaurant accepts order, show in admin panel for manual assignment
    deliveryAssignmentMode: {
      type: String,
      enum: ["automatic", "manual"],
      default: "automatic",
    },
    // Global withdraw schedule for restaurants & hotels
    withdrawSchedule: {
      enabled: {
        type: Boolean,
        default: false,
      },
      // 0 (Sunday) - 6 (Saturday)
      dayOfWeek: {
        type: Number,
        min: 0,
        max: 6,
        default: 0,
      },
      // "HH:MM" 24-hour format, e.g. "10:00"
      startTime: {
        type: String,
        default: "10:00",
      },
      // Optional timezone string (defaults to Asia/Kolkata when omitted)
      timeZone: {
        type: String,
        default: "Asia/Kolkata",
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Home page categories limit (used by /categories/public?home=true)
    homeCategoriesLimit: {
      type: Number,
      default: 10,
      min: 1,
      max: 50,
    },
    payAtHotelMaxTotal: {
      type: Number,
      default: 699,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
businessSettingsSchema.index({ createdAt: -1 });

// Ensure only one document exists
businessSettingsSchema.statics.getSettings = async function () {
  try {
    let settings = await this.findOne();
    if (!settings) {
      settings = await this.create({
        companyName: "Food Delivery",
        region: "India",
        email: "",
        phone: {
          countryCode: "+91",
          number: "",
        },
        deliveryCashLimit: 750,
        deliveryWithdrawalLimit: 100,
        deliveryAssignmentMode: "automatic",
        payAtHotelMaxTotal: 699,
      });
    }
    // Manual assignment is no longer supported. Normalize any legacy values.
    if (settings.deliveryAssignmentMode !== "automatic") {
      settings.deliveryAssignmentMode = "automatic";
      await settings.save();
    }
    return settings;
  } catch (error) {
    console.error("Error in getSettings:", error);
    // If creation fails, try to return existing or create minimal document
    let settings = await this.findOne();
    if (!settings) {
      // Create with minimal required fields
      settings = new this({
        companyName: "Food Delivery",
        region: "India",
        email: "",
        phone: {
          countryCode: "+91",
          number: "",
        },
        deliveryCashLimit: 750,
        deliveryWithdrawalLimit: 100,
        deliveryAssignmentMode: "automatic",
        payAtHotelMaxTotal: 699,
      });
      await settings.save();
    }
    // Manual assignment is no longer supported. Normalize any legacy values.
    if (settings.deliveryAssignmentMode !== "automatic") {
      settings.deliveryAssignmentMode = "automatic";
      await settings.save();
    }
    return settings;
  }
};

export default mongoose.model("BusinessSettings", businessSettingsSchema);
