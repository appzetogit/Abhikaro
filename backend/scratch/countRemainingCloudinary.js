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
  let totalCloudinary = 0;
  let matches = [];

  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName);
    const docs = await Model.find({});
    
    for (const doc of docs) {
      const docObj = doc.toObject();
      
      const scanObject = (obj, pathStr = '') => {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = pathStr ? `${pathStr}.${key}` : key;
          if (typeof value === 'string' && value.includes('res.cloudinary.com')) {
            totalCloudinary++;
            matches.push({
              model: modelName,
              id: doc._id,
              path: currentPath,
              url: value
            });
          } else if (Array.isArray(value)) {
            value.forEach((item, index) => {
              if (typeof item === 'string' && item.includes('res.cloudinary.com')) {
                totalCloudinary++;
                matches.push({
                  model: modelName,
                  id: doc._id,
                  path: `${currentPath}[${index}]`,
                  url: item
                });
              } else if (item && typeof item === 'object') {
                scanObject(item, `${currentPath}[${index}]`);
              }
            });
          } else if (value && typeof value === 'object') {
            scanObject(value, currentPath);
          }
        }
      };
      
      scanObject(docObj);
    }
  }

  console.log(`\n🔍 Found ${totalCloudinary} remaining Cloudinary URLs in database:`);
  matches.forEach((match, idx) => {
    console.log(`[${idx + 1}] Model: ${match.model} | ID: ${match.id} | Path: ${match.path} \n    URL: ${match.url}\n`);
  });

  await mongoose.disconnect();
  console.log('Disconnected!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
