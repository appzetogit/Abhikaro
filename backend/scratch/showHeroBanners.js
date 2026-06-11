import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://abhikaroapp:abhikaro123@cluster0.u6y6z4b.mongodb.net/abhikaro';

const heroBannerSchema = new mongoose.Schema({
  imageUrl: String,
  cloudinaryPublicId: String,
  order: Number,
  isActive: Boolean,
  linkedRestaurants: [mongoose.Schema.Types.ObjectId]
});

const HeroBanner = mongoose.model('HeroBanner', heroBannerSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  const banners = await HeroBanner.find({}).lean();
  console.log('Raw Banners:');
  console.log(JSON.stringify(banners, null, 2));
  await mongoose.disconnect();
}

main().catch(console.error);
