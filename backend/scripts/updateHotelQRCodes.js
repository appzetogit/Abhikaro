/**
 * Script to normalize all hotel QR codes to the public landing URL.
 * Run with: node scripts/updateHotelQRCodes.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import Hotel from '../modules/hotel/models/Hotel.js';

dotenv.config();

const updateHotelQRCodes = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database');

    // Get desired frontend URL (default to production)
    const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'https://foods.abhikaro.in';
    console.log('🔗 Using frontend URL:', frontendUrl);

    // Find all hotels with QR codes
    const hotels = await Hotel.find({ qrCode: { $exists: true, $ne: null } });
    console.log(`📋 Found ${hotels.length} hotels with QR codes`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const hotel of hotels) {
      let qrCode = hotel.qrCode;
      let needsUpdate = false;
      const hotelId = hotel.hotelId || hotel._id.toString();

      // Normalize stored qrCode string into `${frontendUrl}/hotel-menu?ref=<hotelId>`
      if (qrCode && typeof qrCode === 'string') {
        // Extract possible hotelId from various legacy formats
        const idFromPath = qrCode.match(/\/hotel\/view\/([^/?]+)/)?.[1] || null;
        const idFromHotelRef = qrCode.match(/hotelRef=([^&]+)/)?.[1] || null;
        const idFromRef = qrCode.match(/[?&]ref=([^&]+)/)?.[1] || null;

        // JSON legacy format: {"type":"hotel","hotelId":"..."}
        let idFromJson = null;
        try {
          const parsed = JSON.parse(qrCode);
          if (parsed && parsed.type === "hotel" && parsed.hotelId) {
            idFromJson = parsed.hotelId;
          }
        } catch (_) {}

        const derivedHotelId = idFromRef || idFromPath || idFromHotelRef || idFromJson || hotelId;
        const normalized = `${frontendUrl}/hotel-menu?ref=${derivedHotelId}`;

        if (qrCode !== normalized) {
          qrCode = normalized;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        hotel.qrCode = qrCode;
        await hotel.save();
        console.log(`✅ Updated QR code for hotel: ${hotel.hotelName || hotelId}`);
        console.log(`   New URL: ${qrCode}`);
        updatedCount++;
      } else {
        console.log(`⏭️  Skipped hotel: ${hotel.hotelName || hotelId} (already normalized)`);
        skippedCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total hotels: ${hotels.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log('\n✅ Script completed successfully');

    // Close database connection
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating hotel QR codes:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
updateHotelQRCodes();
