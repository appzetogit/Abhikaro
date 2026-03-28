import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EnvironmentVariable from './modules/admin/models/EnvironmentVariable.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function checkVars() {
  try {
    await mongoose.connect(MONGODB_URI);
    const envVars = await EnvironmentVariable.getOrCreate();
    const envData = envVars.toEnvObject();
    
    console.log('--- Current Firebase Environment Variables ---');
    Object.keys(envData).forEach(key => {
        if (key.includes('FIREBASE')) {
            console.log(`${key}: ${envData[key] ? (key.includes('PRIVATE_KEY') ? 'SET (length ' + envData[key].length + ')' : envData[key]) : 'NOT SET'}`);
        }
    });
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkVars();
