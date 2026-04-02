import dotenv from "dotenv";
import mongoose from "mongoose";
import Restaurant from "../modules/restaurant/models/Restaurant.js";

dotenv.config();

const isDefaultPlaceholder = (value) => {
  if (!value || typeof value !== "string") return false;
  return /^Restaurant\s+\d+$/i.test(value.trim());
};

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // Only touch docs where onboarding step1 has real values.
    const candidates = await Restaurant.find({
      "onboarding.step1": { $exists: true, $ne: null },
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: "" },
        { name: { $regex: /^Restaurant\s+\d+$/i } },
        { ownerName: { $exists: false } },
        { ownerName: null },
        { ownerName: "" },
        { ownerName: { $regex: /^Restaurant\s+\d+$/i } },
      ],
    })
      .select("name ownerName onboarding.step1.restaurantName onboarding.step1.ownerName")
      .lean();

    let updated = 0;
    for (const r of candidates) {
      const step1 = r.onboarding?.step1 || {};
      const next = {};

      const desiredName = step1.restaurantName && String(step1.restaurantName).trim();
      const desiredOwner = step1.ownerName && String(step1.ownerName).trim();

      if (desiredName && (!r.name || isDefaultPlaceholder(r.name))) next.name = desiredName;
      if (desiredOwner && (!r.ownerName || isDefaultPlaceholder(r.ownerName))) next.ownerName = desiredOwner;

      if (Object.keys(next).length === 0) continue;

      await Restaurant.updateOne({ _id: r._id }, { $set: next });
      updated += 1;
      console.log("✅ Backfilled restaurant", {
        _id: r._id.toString(),
        set: next,
      });
    }

    console.log(`Done. Updated ${updated} restaurants.`);
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();

