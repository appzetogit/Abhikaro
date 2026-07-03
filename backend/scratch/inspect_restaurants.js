import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const inspect = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/abhikaro';
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log('Collections list:');
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments({});
      console.log(`- ${col.name} (${count} docs)`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

inspect();
