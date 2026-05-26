import fs from 'fs';
import path from 'path';
import axios from 'axios';

const placeholders = [
  {
    url: "https://res.cloudinary.com/dbv5id2cy/image/upload/v1707212002/restaurant_profile.jpg",
    filename: "restaurant_profile.jpg"
  },
  {
    url: "https://res.cloudinary.com/dbv5id2cy/image/upload/v1707212003/pan_placeholder.jpg",
    filename: "pan_placeholder.jpg"
  },
  {
    url: "https://res.cloudinary.com/dbv5id2cy/image/upload/v1707212004/gst_placeholder.jpg",
    filename: "gst_placeholder.jpg"
  },
  {
    url: "https://res.cloudinary.com/dbv5id2cy/image/upload/v1707212005/fssai_placeholder.jpg",
    filename: "fssai_placeholder.jpg"
  }
];

const download = async () => {
  const targetDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const item of placeholders) {
    const targetPath = path.join(targetDir, item.filename);
    console.log(`📥 Downloading placeholder ${item.url} -> ${targetPath}...`);
    try {
      const response = await axios({
        url: item.url,
        method: 'GET',
        responseType: 'stream'
      });
      const writer = fs.createWriteStream(targetPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      console.log(`   ✅ Success!`);
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }
  process.exit();
};

download();
