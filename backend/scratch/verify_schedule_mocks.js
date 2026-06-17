import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

import { isWithdrawAllowedNow } from '../shared/utils/withdrawSchedule.js';

// We will temporarily wrap/mock Date to return specific times
const RealDate = Date;

function setMockDate(dateString) {
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length > 0) {
        return new RealDate(...args);
      }
      return new RealDate(dateString);
    }
    static now() {
      return new RealDate(dateString).getTime();
    }
  };
}

function restoreDate() {
  global.Date = RealDate;
}

async function testScenario(scenarioName, dateStr, expectedAllowed) {
  setMockDate(dateStr);
  const res = await isWithdrawAllowedNow();
  const pass = res.allowed === expectedAllowed;
  console.log(`🎬 Scenario: ${scenarioName}`);
  console.log(`   Time Mocked : ${dateStr}`);
  console.log(`   Allowed     : ${res.allowed} (Expected: ${expectedAllowed}) -> ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!res.allowed) {
    console.log(`   Message     : ${res.message}`);
  }
  console.log('');
}

async function main() {
  await mongoose.connect(MONGO_URI);

  console.log('--- 🧪 Testing Withdrawal Schedule Mock Scenarios ---');

  // Today is Wednesday, June 17, 2026.
  // Assuming business settings has Thursday 10:00 AM (dow = 4, time = "10:00")
  
  // 1. Thursday, June 18, 2026 at 09:00 AM IST (2026-06-18T09:00:00+05:30)
  await testScenario(
    'Thursday Before Start Time',
    '2026-06-18T09:00:00+05:30',
    false
  );

  // 2. Thursday, June 18, 2026 at 10:00 AM IST (2026-06-18T10:00:00+05:30)
  await testScenario(
    'Thursday Exactly Start Time',
    '2026-06-18T10:00:00+05:30',
    true
  );

  // 3. Thursday, June 18, 2026 at 11:00 AM IST (2026-06-18T11:00:00+05:30)
  await testScenario(
    'Thursday After Start Time',
    '2026-06-18T11:00:00+05:30',
    true
  );

  // 4. Friday, June 19, 2026 at 12:00 PM IST (2026-06-19T12:00:00+05:30)
  await testScenario(
    'Friday (Different Day)',
    '2026-06-19T12:00:00+05:30',
    false
  );

  // 5. Wednesday, June 17, 2026 at 12:00 PM IST (2026-06-17T12:00:00+05:30)
  await testScenario(
    'Wednesday (Different Day)',
    '2026-06-17T12:00:00+05:30',
    false
  );

  restoreDate();
  await mongoose.disconnect();
}

main().catch(console.error);
