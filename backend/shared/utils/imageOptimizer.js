import { Jimp } from 'jimp';

/**
 * Folder-specific compression profiles.
 * - maxWidth/maxHeight: max dimension in pixels (aspect-ratio preserved)
 * - quality: JPEG quality 0-100
 */
const FOLDER_PROFILES = {
  // Profile/avatar images — small square, high quality
  'profile-images': { maxWidth: 400, maxHeight: 400, quality: 80 },
  'restaurant-profiles': { maxWidth: 400, maxHeight: 400, quality: 80 },
  'delivery-profiles': { maxWidth: 400, maxHeight: 400, quality: 80 },
  // Menu item images — web-optimized
  'menu-items': { maxWidth: 800, maxHeight: 800, quality: 75 },
  'menu-categories': { maxWidth: 600, maxHeight: 400, quality: 75 },
  // Banners — wider, slightly higher quality
  'hero-banners': { maxWidth: 1200, maxHeight: 600, quality: 78 },
  'under-250-banners': { maxWidth: 1000, maxHeight: 500, quality: 78 },
  'banners': { maxWidth: 1000, maxHeight: 500, quality: 78 },
  // Documents / QR codes — keep quality high
  'documents': { maxWidth: 1200, maxHeight: 1200, quality: 90 },
  'qr-codes': { maxWidth: 400, maxHeight: 400, quality: 90 },
  // Default — generic web image
  default: { maxWidth: 800, maxHeight: 800, quality: 75 },
};

/**
 * Detect the leading MIME type from a buffer's magic bytes.
 * Returns 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'unknown'
 */
function detectMimeType(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  const b = buffer;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  // GIF: 47 49 46
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  // WebP: RIFF????WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
  return 'unknown';
}

/**
 * Compress an image buffer using Jimp.
 *
 * @param {Buffer} inputBuffer  - Raw file buffer from multer memory storage.
 * @param {Object} opts
 * @param {string} [opts.folder='default']  - Upload folder name used to pick compression profile.
 * @param {boolean} [opts.isVideo=false]    - Skip compression for videos.
 * @returns {Promise<{ buffer: Buffer, originalSize: number, compressedSize: number, mimeType: string, extension: string }>}
 */
export async function compressImage(inputBuffer, opts = {}) {
  const originalSize = inputBuffer.length;

  // Skip videos entirely
  if (opts.isVideo) {
    return {
      buffer: inputBuffer,
      originalSize,
      compressedSize: originalSize,
      mimeType: 'video/mp4',
      extension: 'mp4',
    };
  }

  const mimeType = detectMimeType(inputBuffer);

  // Skip unknown or SVG (pass through as-is)
  if (mimeType === 'unknown') {
    console.warn('⚠️  imageOptimizer: Unknown mime type, skipping compression.');
    return {
      buffer: inputBuffer,
      originalSize,
      compressedSize: originalSize,
      mimeType: 'application/octet-stream',
      extension: 'bin',
    };
  }

  // Pick compression profile
  const folderKey = opts.folder || 'default';
  const profile = FOLDER_PROFILES[folderKey] || FOLDER_PROFILES.default;
  const { maxWidth, maxHeight, quality } = profile;

  try {
    // Load image with Jimp
    const image = await Jimp.read(inputBuffer);

    const origW = image.bitmap.width;
    const origH = image.bitmap.height;

    // Only resize if the image is larger than the target dimensions
    if (origW > maxWidth || origH > maxHeight) {
      image.scaleToFit({ w: maxWidth, h: maxHeight });
      console.log(
        `📐 imageOptimizer: Resized ${origW}x${origH} → ${image.bitmap.width}x${image.bitmap.height} (folder: ${folderKey})`
      );
    }

    // For GIFs, return as-is after optional resize (Jimp can't properly compress animated GIFs)
    if (mimeType === 'image/gif') {
      const outBuffer = await image.getBuffer('image/gif');
      return {
        buffer: outBuffer,
        originalSize,
        compressedSize: outBuffer.length,
        mimeType: 'image/gif',
        extension: 'gif',
      };
    }

    // Convert everything to JPEG for maximum compression (except PNG with transparency check)
    let outputMime = 'image/jpeg';
    let outputExt = 'jpg';

    // Preserve PNG only if it has an alpha channel
    const hasAlpha = mimeType === 'image/png' && image.bitmap.data.some((v, i) => i % 4 === 3 && v < 255);
    if (hasAlpha) {
      outputMime = 'image/png';
      outputExt = 'png';
    }

    // Apply JPEG quality or PNG compression
    let outBuffer;
    if (outputMime === 'image/jpeg') {
      outBuffer = await image.getBuffer('image/jpeg', { quality });
    } else {
      outBuffer = await image.getBuffer('image/png');
    }

    const compressedSize = outBuffer.length;
    const savings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);

    console.log(
      `✅ imageOptimizer: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB` +
      ` (${savings}% saved, quality: ${quality}, folder: ${folderKey})`
    );

    return {
      buffer: outBuffer,
      originalSize,
      compressedSize,
      mimeType: outputMime,
      extension: outputExt,
    };
  } catch (err) {
    // On any Jimp error, fall back to original buffer
    console.error('❌ imageOptimizer: Compression failed, using original buffer:', err.message);
    return {
      buffer: inputBuffer,
      originalSize,
      compressedSize: originalSize,
      mimeType,
      extension: mimeType.split('/')[1] || 'jpg',
    };
  }
}
