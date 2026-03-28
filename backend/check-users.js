import mongoose from 'mongoose';
import User from './modules/auth/models/User.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const users = await User.find({ fcmtokenWeb: { $ne: null } }).limit(5);
  console.log('--- USERS WITH TOKENS ---');
  users.forEach(u => console.log(`${u.role}: ${u.email}`));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
