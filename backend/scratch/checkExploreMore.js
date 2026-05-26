import mongoose from 'mongoose';
import dotenv from 'dotenv';
import LandingPageExploreMore from '../modules/heroBanner/models/LandingPageExploreMore.js';

dotenv.config();

const check = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const items = await LandingPageExploreMore.find({});
  console.log("LandingPageExploreMore records:");
  console.log(JSON.stringify(items, null, 2));
  process.exit();
};

check();
