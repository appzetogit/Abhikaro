import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const findAdmins = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db;
    const admins = await db.collection('admins').find({}).toArray();
    console.log(`Found ${admins.length} admin(s):`);
    admins.forEach(admin => {
      console.log(`Email: ${admin.email}, Username: ${admin.username}, Role: ${admin.role}`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error finding admins:', error);
    process.exit(1);
  }
};

findAdmins();
