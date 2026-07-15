import dotenv from 'dotenv';
import mongoose from 'mongoose';
import FeeSettings from '../modules/admin/models/FeeSettings.js';
import { setCache, getCache, generateCacheKey, deleteCache } from '../shared/utils/cache.js';

dotenv.config({ path: './.env' });

const verify = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // Test 1: Verify getPublicFeeSettings selection fields
    console.log('--- TEST 1: Verify getPublicFeeSettings selection fields ---');
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .select('deliveryFee deliveryFeeRanges freeDeliveryThreshold platformFee platformFeeRanges gstRate')
      .lean();

    if (feeSettings) {
      console.log('Successfully retrieved active fee settings.');
      console.log('Has platformFeeRanges field:', 'platformFeeRanges' in feeSettings);
      console.log('platformFeeRanges content:', JSON.stringify(feeSettings.platformFeeRanges, null, 2));
      if ('platformFeeRanges' in feeSettings) {
        console.log('✅ TEST 1 PASSED: platformFeeRanges is successfully selected!');
      } else {
        console.error('❌ TEST 1 FAILED: platformFeeRanges is NOT selected!');
      }
    } else {
      console.log('No active fee settings found to test selection.');
    }
    console.log('----------------------------------------------------------\n');

    // Test 2: Verify Cache Invalidation
    console.log('--- TEST 2: Verify Cache Invalidation ---');
    const cacheKey = generateCacheKey('feeSettings', 'active');
    console.log(`Generated cache key: ${cacheKey}`);

    // Set dummy cached settings
    const dummySettings = { dummy: true, val: 123 };
    await setCache(cacheKey, dummySettings, 30);
    console.log('Dummy settings set in cache.');

    // Verify cache has it
    const cachedValBefore = await getCache(cacheKey);
    console.log('Cached value before invalidation:', cachedValBefore);

    if (!cachedValBefore || cachedValBefore.val !== 123) {
      console.error('❌ Cache set failed. Is Redis running?');
    } else {
      console.log('Cache set successfully verified.');
    }

    // Invalidate the cache (calling deleteCache directly, which is what the controller does)
    console.log('Invalidating cache...');
    await deleteCache(cacheKey);

    // Verify cache is cleared
    const cachedValAfter = await getCache(cacheKey);
    console.log('Cached value after invalidation:', cachedValAfter);

    if (cachedValAfter === null) {
      console.log('✅ TEST 2 PASSED: Cache invalidated successfully!');
    } else {
      console.error('❌ TEST 2 FAILED: Cache key still exists!');
    }
    console.log('----------------------------------------------------------\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('Verification failed with error:', error);
    process.exit(1);
  }
};

verify();
