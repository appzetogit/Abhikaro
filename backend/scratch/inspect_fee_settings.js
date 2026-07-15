import dotenv from 'dotenv';
import mongoose from 'mongoose';
import FeeSettings from '../modules/admin/models/FeeSettings.js';

dotenv.config({ path: './.env' });

const inspect = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI is not defined in .env file!');
      process.exit(1);
    }
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    const settingsList = await FeeSettings.find().lean();
    console.log('--- ALL FEE SETTINGS IN DATABASE ---');
    console.log(JSON.stringify(settingsList, null, 2));
    console.log('------------------------------------');

    const activeSettings = await FeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    console.log('--- CURRENT ACTIVE FEE SETTINGS ---');
    console.log(JSON.stringify(activeSettings, null, 2));
    console.log('------------------------------------');

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error during inspection:', error);
    process.exit(1);
  }
};

inspect();
