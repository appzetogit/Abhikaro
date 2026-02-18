/**
 * Migration Script: Populate geoLocation field for existing restaurants
 * 
 * This script migrates existing restaurant data to include GeoJSON Point format
 * for geospatial queries. This replaces the need for Google Places API.
 * 
 * Run this script once after deploying the schema changes:
 * node scripts/migrateRestaurantGeoLocation.js
 */

import mongoose from 'mongoose';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

async function migrateRestaurantGeoLocation() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all restaurants that have latitude/longitude but missing geoLocation
    const restaurants = await Restaurant.find({
      $and: [
        { 'location.latitude': { $exists: true, $ne: null } },
        { 'location.longitude': { $exists: true, $ne: null } },
        {
          $or: [
            { 'location.geoLocation': { $exists: false } },
            { 'location.geoLocation.coordinates': { $exists: false } },
            { 'location.geoLocation.coordinates': null }
          ]
        }
      ]
    });

    console.log(`📊 Found ${restaurants.length} restaurants to migrate`);

    if (restaurants.length === 0) {
      console.log('✅ No restaurants need migration. All restaurants already have geoLocation.');
      await mongoose.disconnect();
      return;
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const restaurant of restaurants) {
      try {
        const lat = restaurant.location.latitude;
        const lng = restaurant.location.longitude;

        // Validate coordinates
        if (typeof lat !== 'number' || typeof lng !== 'number' ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.warn(`⚠️  Skipping restaurant ${restaurant._id}: Invalid coordinates (${lat}, ${lng})`);
          skipped++;
          continue;
        }

        // Set geoLocation in GeoJSON Point format: [longitude, latitude]
        restaurant.location.geoLocation = {
          type: 'Point',
          coordinates: [lng, lat]
        };

        // Also sync legacy coordinates array for backward compatibility
        if (!restaurant.location.coordinates) {
          restaurant.location.coordinates = [lng, lat];
        }

        await restaurant.save();
        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`📝 Migrated ${migrated} restaurants...`);
        }
      } catch (error) {
        console.error(`❌ Error migrating restaurant ${restaurant._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n✅ Migration completed!');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⚠️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    // Verify migration by checking index
    console.log('\n🔍 Verifying 2dsphere index...');
    const indexes = await Restaurant.collection.getIndexes();
    if (indexes['location.geoLocation_2dsphere']) {
      console.log('✅ 2dsphere index exists and is ready for geospatial queries');
    } else {
      console.warn('⚠️  2dsphere index not found. Creating index...');
      await Restaurant.collection.createIndex({ 'location.geoLocation': '2dsphere' });
      console.log('✅ 2dsphere index created');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateRestaurantGeoLocation();
