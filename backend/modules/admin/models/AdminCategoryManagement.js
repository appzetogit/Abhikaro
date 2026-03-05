import mongoose from 'mongoose';

const adminCategoryManagementSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    image: {
      type: String,
      default: 'https://via.placeholder.com/40',
    },
    type: {
      type: String,
      trim: true,
      enum: ['Starters', 'Main course', 'Desserts', 'Beverages', 'Varieties'],
    },
    priority: {
      type: String,
      enum: ['High', 'Normal', 'Low'],
      default: 'Normal',
    },
    status: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Optional category-level offer percentage (0–100)
    offerPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // Optional per-user limit: how many times a user can use this category offer per day (0 = unlimited)
    offerUsageLimitPerDay: {
      type: Number,
      min: 0,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
adminCategoryManagementSchema.index({ name: 1 });
adminCategoryManagementSchema.index({ status: 1 });
adminCategoryManagementSchema.index({ priority: 1 });
adminCategoryManagementSchema.index({ createdAt: -1 });

// Virtual for serial number (for display purposes)
adminCategoryManagementSchema.virtual('sl').get(function() {
  // This will be calculated in the controller based on query results
  return null;
});

const AdminCategoryManagement = mongoose.model('AdminCategoryManagement', adminCategoryManagementSchema);

export default AdminCategoryManagement;

