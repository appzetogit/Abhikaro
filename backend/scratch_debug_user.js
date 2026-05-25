import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

async function checkUsers() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB");

    const User = (await import('./modules/auth/models/User.js')).default;
    
    // Find users by phone pattern or name pattern
    const users = await User.find({
      $or: [
        { phone: /7610416911/ },
        { phone: /76104/ },
        { name: /Ajay/i },
        { name: /Sumit/i }
      ]
    }).lean();

    console.log(`Found ${users.length} matching users in DB:`);
    users.forEach(u => {
      console.log(`ID: ${u._id}`);
      console.log(`Name: "${u.name}"`);
      console.log(`Phone: "${u.phone}"`);
      console.log(`Email: "${u.email}"`);
      console.log(`Wallet Balance: ${u.wallet?.balance}`);
      console.log(`-------------------------------------`);
    });

  } catch (error) {
    console.error("Error checking users:", error);
  } finally {
    await mongoose.disconnect();
  }
}

checkUsers();
