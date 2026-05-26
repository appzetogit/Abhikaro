/**
 * test-compression.js
 * 
 * Run from backend directory:
 *   node scripts/test-compression.js
 * 
 * This reads a real image file from the frontend assets, runs it through
 * compressImage(), writes the output to public/uploads/test/, and prints
 * a before/after size comparison.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compressImage } from '../shared/utils/imageOptimizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pick a large real image from the frontend assets for testing
const TEST_IMAGES = [
  path.resolve(__dirname, '../../frontend/src/assets/loginbanner.png'),
  path.resolve(__dirname, '../../frontend/src/assets/deliveryloginbanner.png'),
  path.resolve(__dirname, '../../frontend/src/assets/collectionspagebanner.png'),
  path.resolve(__dirname, '../../frontend/src/assets/groumetpagebanner.png'),
];

const TEST_FOLDERS = ['menu-items', 'profile-images', 'hero-banners', 'default'];

const outDir = path.resolve(__dirname, '../public/uploads/test');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function runTest(imagePath, folder) {
  if (!fs.existsSync(imagePath)) {
    console.warn(`⚠️  Skipping (not found): ${imagePath}`);
    return;
  }

  const buffer = fs.readFileSync(imagePath);
  const name = path.basename(imagePath, path.extname(imagePath));

  const result = await compressImage(buffer, { folder });

  const originalKB = (result.originalSize / 1024).toFixed(1);
  const compressedKB = (result.compressedSize / 1024).toFixed(1);
  const savings = (((result.originalSize - result.compressedSize) / result.originalSize) * 100).toFixed(1);

  const outFile = path.join(outDir, `${name}__${folder}.${result.extension}`);
  fs.writeFileSync(outFile, result.buffer);

  console.log(
    `  📁 ${path.basename(imagePath)} [folder:${folder}]\n` +
    `     Before : ${originalKB} KB\n` +
    `     After  : ${compressedKB} KB\n` +
    `     Savings: ${savings}%\n` +
    `     Output : ${outFile}\n`
  );
}

async function main() {
  console.log('\n🔬 Image Compression Test\n' + '='.repeat(60));

  // Test with multiple images × multiple folder profiles
  for (const imgPath of TEST_IMAGES) {
    for (const folder of TEST_FOLDERS) {
      try {
        await runTest(imgPath, folder);
      } catch (err) {
        console.error(`❌ Error testing ${imgPath} [${folder}]:`, err.message);
      }
    }
  }

  console.log('='.repeat(60));
  console.log(`✅ Test complete. Output written to: ${outDir}`);
}

main();
