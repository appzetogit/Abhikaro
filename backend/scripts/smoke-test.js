/**
 * Smoke test: load env and core modules without starting server.
 * Run: npm test (no args required)
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function run() {
  try {
    // Load FCM service (pulls in User, Restaurant, Delivery, Hotel models)
    const fcm = await import('../modules/fcm/services/fcmService.js');
    if (typeof fcm.saveFcmToken !== 'function') throw new Error('FCM service missing saveFcmToken');
    console.log('✅ Smoke test passed (FCM + models load OK)');
    console.log('   Run FCM test: npm run test:fcm -- <userId> [role]');
    console.log('   Example: npm run test:fcm -- 69933b405aa50f4ffb622728 user');
    process.exit(0);
  } catch (err) {
    console.error('❌ Smoke test failed:', err.message);
    process.exit(1);
  }
}

run();
