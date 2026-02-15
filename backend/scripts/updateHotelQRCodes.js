/**
 * Script to update all hotel QR codes from localhost to production URL
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

    // Get production URL
    const productionUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'https://foods.abhikaro.in';
    console.log('🔗 Using production URL:', productionUrl);

    // Find all hotels with QR codes
    const hotels = await Hotel.find({ qrCode: { $exists: true, $ne: null } });
    console.log(`📋 Found ${hotels.length} hotels with QR codes`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const hotel of hotels) {
      let qrCode = hotel.qrCode;
      let needsUpdate = false;
      const hotelId = hotel.hotelId || hotel._id.toString();

      // Check if QR code contains localhost
      if (qrCode && typeof qrCode === 'string') {
        if (qrCode.includes('localhost') || qrCode.includes('127.0.0.1') || qrCode.includes('localhost:5173')) {
          // Extract hotel ID from existing URL
          const hotelIdMatch = qrCode.match(/\/hotel\/view\/([^/?]+)/);
          if (hotelIdMatch) {
            const extractedHotelId = hotelIdMatch[1];
            qrCode = `${productionUrl}/hotel/view/${extractedHotelId}?hotelRef=${extractedHotelId}`;
            needsUpdate = true;
          } else {
            // Try to extract from hotelRef parameter
            const hotelRefMatch = qrCode.match(/hotelRef=([^&]+)/);
            if (hotelRefMatch) {
              const extractedHotelId = hotelRefMatch[1];
              qrCode = `${productionUrl}/hotel/view/${extractedHotelId}?hotelRef=${extractedHotelId}`;
              needsUpdate = true;
            } else {
              // Use hotel ID from database
              qrCode = `${productionUrl}/hotel/view/${hotelId}?hotelRef=${hotelId}`;
              needsUpdate = true;
            }
          }
        } else {
          // Check if it's JSON format
          try {
            const parsed = JSON.parse(qrCode);
            if (parsed.type === "hotel" && parsed.hotelId) {
              qrCode = `${productionUrl}/hotel/view/${parsed.hotelId}?hotelRef=${parsed.hotelId}`;
              needsUpdate = true;
            }
          } catch (e) {
            // Not JSON, check if it already has production URL
            if (!qrCode.includes('foods.abhikaro.in') && !qrCode.includes(productionUrl)) {
              // Doesn't have production URL, update it
              qrCode = `${productionUrl}/hotel/view/${hotelId}?hotelRef=${hotelId}`;
              needsUpdate = true;
            }
          }
        }
      }

      if (needsUpdate) {
        hotel.qrCode = qrCode;
        await hotel.save();
        console.log(`✅ Updated QR code for hotel: ${hotel.hotelName || hotelId}`);
        console.log(`   New URL: ${qrCode}`);
        updatedCount++;
      } else {
        console.log(`⏭️  Skipped hotel: ${hotel.hotelName || hotelId} (already has production URL)`);
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
