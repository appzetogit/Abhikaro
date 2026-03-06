// One-time helper script to promote an existing admin user to super_admin
// Usage:
// 1. Set MONGODB_URL in backend .env
// 2. Run with node: `node scripts/promote_super_admin.js admin@example.com`

import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "../modules/admin/models/Admin.js";
import {
  ADMIN_PERMISSIONS,
  getDefaultAdminPermissions,
} from "../shared/constants/adminPermissions.js";

dotenv.config();

const run = async () => {
  const email = process.argv[2];
  if (!email) {
    console.error("Please provide admin email. Example:");
    console.error("  node scripts/promote_super_admin.js admin@example.com");
    process.exit(1);
  }

  const mongoUrl = process.env.MONGODB_URL || process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGODB_URL (or MONGO_URL) is not set in environment.");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  console.log("Connected to MongoDB");

  try {
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      console.error(`Admin with email ${email} not found`);
      process.exit(1);
    }

    admin.role = "super_admin";
    // Give full permissions list
    admin.permissions = ADMIN_PERMISSIONS.map((p) => p.id);

    await admin.save();
    console.log(
      `✅ Admin ${email} promoted to super_admin with full permissions.`,
    );
  } catch (error) {
    console.error("Error promoting super admin:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();

