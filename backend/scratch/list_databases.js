import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const listDatabases = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to cluster.');

    const admin = mongoose.connection.db.admin();
    const result = await admin.listDatabases();
    console.log('\n--- Databases in the MongoDB Cluster ---');
    result.databases.forEach(db => {
      console.log(`Database: ${db.name} | Size: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error listing databases:', error);
    process.exit(1);
  }
};

listDatabases();
