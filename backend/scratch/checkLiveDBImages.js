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

  const modelNames = mongoose.modelNames();
  console.log(`Registered models: ${modelNames.join(', ')}`);

  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName);
    const count = await Model.countDocuments({});
    console.log(`\n📊 Model: ${modelName} (Total docs: ${count})`);
    
    if (count === 0) continue;

    const docs = await Model.find({}).limit(5);

    // Recursively scan for image URLs
    const scanDoc = (obj, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && (value.includes('/uploads') || value.includes('cloudinary'))) {
          console.log(`   👉 [${prefix}${key}]: ${value}`);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === 'string' && (item.includes('/uploads') || item.includes('cloudinary'))) {
              console.log(`   👉 [${prefix}${key}[${index}]]: ${item}`);
            } else if (item && typeof item === 'object') {
              scanDoc(item, `${prefix}${key}[${index}].`);
            }
          });
        } else if (value && typeof value === 'object') {
          scanDoc(value, `${prefix}${key}.`);
        }
      }
    };

    docs.forEach((doc, idx) => {
      console.log(`  Document #${idx + 1} (_id: ${doc._id})`);
      scanDoc(doc.toObject());
    });
  }

  await mongoose.disconnect();
  console.log('Disconnected!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
