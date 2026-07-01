import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const listCollections = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const dbs = ['abhikaro', 'abhikaro_testing', 'abhikaro_testing_abhi'];
    const baseUri = process.env.MONGODB_URI.substring(0, process.env.MONGODB_URI.lastIndexOf('/'));

    for (const dbName of dbs) {
      console.log(`\n--- Collections in Database: ${dbName} ---`);
      const dbUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
      const conn = await mongoose.createConnection(dbUri).asPromise();
      
      const collections = await conn.db.listCollections().toArray();
      const names = collections.map(c => c.name);
      console.log(names.sort().join('\n'));
      
      await conn.close();
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error listing collections:', error);
    process.exit(1);
  }
};

listCollections();
