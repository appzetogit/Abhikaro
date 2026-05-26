import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const MONGODB_URI = 'mongodb+srv://abhikaroapp:abhikaro123@cluster0.u6y6z4b.mongodb.net/abhikaro';

const scanAndImportModels = async (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanAndImportModels(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js') && dir.endsWith('models')) {
      try {
        await import(`file://${fullPath}`);
      } catch (err) {
        // ignore
      }
    }
  }
};

async function main() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  console.log('Loading models...');
  const modulesPath = path.join(process.cwd(), 'modules');
  await scanAndImportModels(modulesPath);

  const Restaurant = mongoose.model('Restaurant');
  
  const restaurants = await Restaurant.find({}, 'name profileImage');
  console.log(`\nTotal restaurants found: ${restaurants.length}`);
  restaurants.forEach((r, idx) => {
    console.log(`[${idx + 1}] name: "${r.name}" | profileImage:`, r.profileImage);
  });

  await mongoose.disconnect();
  console.log('Disconnected!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
