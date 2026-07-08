import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

import EnvironmentVariable from '../modules/admin/models/EnvironmentVariable.js';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB.');

  const envVars = await EnvironmentVariable.findOne().lean();
  if (!envVars) {
    console.log('No EnvironmentVariable document found in DB.');
  } else {
    console.log('Found EnvironmentVariable document in DB.');
    // Print all keys present
    const keys = Object.keys(envVars);
    keys.forEach(k => {
      if (k.startsWith('_') || k === 'createdAt' || k === 'updatedAt') return;
      const value = envVars[k];
      console.log(`Key: ${k}, Value present: ${!!value}, Length: ${value ? String(value).length : 0}`);
    });
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
