import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import FeeSettings from '../modules/admin/models/FeeSettings.js';
import { calculateDistance, calculatePlatformFee } from '../modules/order/services/orderCalculationService.js';

dotenv.config({ path: './.env' });

const testCalc = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // Fetch a restaurant
    const restaurant = await Restaurant.findOne({ isActive: true }).lean();
    if (!restaurant) {
      console.log('No active restaurant found in database.');
      await mongoose.connection.close();
      return;
    }

    console.log(`Using Restaurant: ${restaurant.name} (${restaurant._id})`);
    console.log('Restaurant Location:', JSON.stringify(restaurant.location, null, 2));

    // Mock different user addresses and calculate distance & platform fee
    // Let's assume restaurant location coords are [lng, lat]
    const restCoords = restaurant.location?.coordinates || 
                       (restaurant.location?.geoLocation?.coordinates) ||
                       [restaurant.location?.longitude, restaurant.location?.latitude];
    
    if (!restCoords || !restCoords[0] || !restCoords[1]) {
      console.error('Restaurant does not have valid coordinates!');
      await mongoose.connection.close();
      return;
    }

    const [restLng, restLat] = restCoords;
    console.log(`Restaurant Coordinates (Lng, Lat): [${restLng}, ${restLat}]`);

    // Let's test a couple of offsets (representing different distances in km)
    // 1 degree latitude is approx 111 km. So 0.01 degree is approx 1.11 km.
    const testCases = [
      { name: 'Same location (0 km)', latOffset: 0, lngOffset: 0 },
      { name: 'Approx 1.1 km away', latOffset: 0.01, lngOffset: 0 },
      { name: 'Approx 5.5 km away', latOffset: 0.05, lngOffset: 0 },
      { name: 'Approx 11 km away', latOffset: 0.1, lngOffset: 0 },
      { name: 'Approx 16.5 km away', latOffset: 0.15, lngOffset: 0 },
      { name: 'Approx 22 km away', latOffset: 0.2, lngOffset: 0 },
      { name: 'Very far away (110 km)', latOffset: 1.0, lngOffset: 0 },
    ];

    console.log('\n--- CALCULATING FEES FOR TEST CASES ---');
    for (const tc of testCases) {
      const userLat = restLat + tc.latOffset;
      const userLng = restLng + tc.lngOffset;
      
      const userAddress = {
        location: {
          type: 'Point',
          coordinates: [userLng, userLat]
        },
        latitude: userLat,
        longitude: userLng
      };

      const distance = calculateDistance(
        [restLng, restLat],
        [userLng, userLat]
      );

      const fee = await calculatePlatformFee(distance);
      
      console.log(`Case: ${tc.name}`);
      console.log(`  User Coordinates: [${userLng.toFixed(6)}, ${userLat.toFixed(6)}]`);
      console.log(`  Calculated Distance: ${distance.toFixed(3)} km`);
      console.log(`  Platform Fee: ₹${fee}`);
      console.log('------------------------------------');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

testCalc();
