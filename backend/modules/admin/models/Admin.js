import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  ADMIN_PERMISSION_IDS,
  getDefaultAdminPermissions,
} from '../../../shared/constants/adminPermissions.js';

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default
    },
    phone: {
      type: String,
      sparse: true,
      trim: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    profileImage: {
      type: String,
    },
    permissions: {
      type: [String],
      default: function () {
        // Use role-aware default permissions
        return getDefaultAdminPermissions(this.role || 'admin');
      },
      validate: {
        validator(value) {
          // Allow empty / undefined and legacy permission values for backward compatibility.
          // New writes are sanitized at controller level, so here we only ensure values are strings.
          if (!value || !Array.isArray(value) || value.length === 0) {
            return true;
          }
          return value.every((perm) => typeof perm === 'string');
        },
        message: 'Invalid permission value. Expected an array of strings.',
      },
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'moderator'],
      default: 'admin',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    fcmtokenWeb: {
      type: String,
      default: null,
    },
    fcmtokenMobile: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
adminSchema.index({ email: 1 }, { unique: true });
adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  next();
});

// Method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update last login
adminSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  this.loginCount = (this.loginCount || 0) + 1;
  await this.save();
};

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;

