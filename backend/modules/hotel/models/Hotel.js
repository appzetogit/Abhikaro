import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";

const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  coordinates: {
    type: [Number],
    default: undefined,
  },
  formattedAddress: String,
  address: String,
  addressLine1: String,
  addressLine2: String,
  area: String,
  city: String,
  state: String,
  landmark: String,
  zipCode: String,
  pincode: String,
  postalCode: String,
  street: String,
});

const hotelSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      unique: true,
    },
    // Authentication fields
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      select: false,
    },
    signupMethod: {
      type: String,
      enum: ["phone", "email", "admin"],
      default: "phone",
    },
    // Hotel basic info
    hotelName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    location: locationSchema,
    // Document images
    aadharCardImage: {
      url: String,
      publicId: String,
    },
    hotelRentProofImage: {
      url: String,
      publicId: String,
    },
    cancelledCheckImages: [
      {
        url: String,
        publicId: String,
      },
    ],
    profileImage: {
      url: String,
      publicId: String,
    },
    qrCode: {
      type: String,
      default: null, // Store QR code data (JSON string)
    },
    isActive: {
      type: Boolean,
      default: false, // Hotels need admin approval
    },
    // Approval/Rejection fields
    rejectionReason: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Commission percentage for orders from QR code scans
    commission: {
      type: Number,
      default: 0, // Default 0% commission for hotel
      min: 0,
      max: 100, // Maximum 100% commission
    },
    // Admin commission percentage for orders from QR code scans
    adminCommission: {
      type: Number,
      default: 0, // Default 0% commission for admin
      min: 0,
      max: 100, // Maximum 100% commission
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
hotelSchema.index({ phone: 1 }, { unique: true });
hotelSchema.index({ email: 1 }, { sparse: true });

// Hash password before saving
hotelSchema.pre("save", async function (next) {
  // Generate hotelId FIRST (before any validation)
  if (!this.hotelId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    this.hotelId = `HOTEL-${timestamp}-${random}`;
  }

  // Normalize phone number if it exists and is modified
  if (this.isModified("phone") && this.phone) {
    const normalized = normalizePhoneNumber(this.phone);
    if (normalized) {
      this.phone = normalized;
    }
  }

  // Hash password if it's modified
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Method to compare password
hotelSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Hotel", hotelSchema);
