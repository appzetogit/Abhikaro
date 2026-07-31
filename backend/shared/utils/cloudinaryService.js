import multer from 'multer';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudinary } from '../../config/cloudinary.js';
import { compressImage } from './imageOptimizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '../..');

// Use in‑memory storage; we stream to Cloudinary
const storage = multer.memoryStorage();

// Generic file filter for common image/video mime types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    // videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload an image or video.'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB for video/GIF/images
  }
});

/**
 * Upload a file to local storage instead of Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options (folder, etc.)
 * @returns {Promise<Object>} Local upload result object mimicking Cloudinary response
 */
export function uploadToLocal(buffer, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!buffer || !Buffer.isBuffer(buffer)) {
        return reject(new Error('Invalid buffer provided'));
      }
      if (buffer.length === 0) {
        return reject(new Error('Empty buffer provided'));
      }

      const folder = options.folder || 'uploads';
      const isVideo = options.resource_type === 'video' || options.isVideo === true;
      const isGif = options.format === 'gif' || options.mimeType === 'image/gif';

      // ── Image/Media compression step ─────────────────────────────────────────
      let finalBuffer = buffer;
      let fileExtension = isVideo ? (options.format || 'mp4') : (isGif ? 'gif' : (options.format || 'jpg'));

      if (!isVideo && !isGif) {
        try {
          const compressed = await compressImage(buffer, { folder, isVideo: false });
          finalBuffer = compressed.buffer;
          fileExtension = compressed.extension;
        } catch (compErr) {
          // Non-fatal: fall back to raw buffer if compression errors out
          console.warn('⚠️  Compression skipped, using raw buffer:', compErr.message);
          fileExtension = options.format || 'jpg';
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const targetDir = path.join(backendDir, 'public', 'uploads', folder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const uniqueId = Date.now() + '_' + Math.random().toString(36).substring(2, 11);
      const filename = `${options.public_id ? path.basename(options.public_id) : uniqueId}.${fileExtension}`;
      const filepath = path.join(targetDir, filename);

      fs.writeFile(filepath, finalBuffer, (err) => {
        if (err) {
          console.error('❌ Local file write error:', err);
          return reject(err);
        }

        const relativeUrl = `/uploads/${folder}/${filename}`;
        console.log('✅ Local upload successful:', relativeUrl);

        resolve({
          secure_url: relativeUrl,
          url: relativeUrl,
          public_id: `${folder}/${filename.replace('.' + fileExtension, '')}`,
          resource_type: isVideo ? 'video' : 'image',
          bytes: finalBuffer.length,
          format: fileExtension
        });
      });
    } catch (error) {
      console.error('❌ Error in uploadToLocal:', error);
      reject(error);
    }
  });
}

/**
 * Upload a single buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Cloudinary upload options (folder, resource_type, etc.)
 * @returns {Promise<Object>} Cloudinary upload result
 */
export async function uploadToCloudinary(buffer, options = {}) {
  if (process.env.USE_LOCAL_STORAGE === 'true') {
    return uploadToLocal(buffer, options);
  }

  // Validate buffer
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided');
  }

  if (buffer.length === 0) {
    throw new Error('Empty buffer provided');
  }

  const folder = options.folder || 'uploads';
  const isVideo = options.resource_type === 'video';

  // Compress image before uploading to Cloudinary
  let finalBuffer = buffer;
  if (!isVideo) {
    try {
      const compressed = await compressImage(buffer, { folder, isVideo: false });
      finalBuffer = compressed.buffer;
    } catch (compErr) {
      console.warn('⚠️  Cloudinary compression skipped, using raw buffer:', compErr.message);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      // Extract upload options
      const uploadOptions = {
        resource_type: options.resource_type || 'auto',
        folder: options.folder || 'uploads'
      };

      // Copy other options (excluding folder and resource_type which are already set)
      Object.keys(options).forEach(key => {
        if (key !== 'folder' && key !== 'resource_type') {
          uploadOptions[key] = options[key];
        }
      });

      console.log('📤 Cloudinary upload options:', {
        folder: uploadOptions.folder,
        resource_type: uploadOptions.resource_type,
        bufferSize: finalBuffer.length
      });

      // Use upload_stream method which is more efficient for buffers
      // Create a readable stream from buffer
      const stream = Readable.from(finalBuffer);

      // Create upload stream
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', {
              message: error.message,
              http_code: error.http_code,
              name: error.name,
              stack: error.stack
            });
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Upload failed: No result returned from Cloudinary'));
          }
          console.log('✅ Cloudinary upload successful:', {
            publicId: result.public_id,
            url: result.secure_url,
            resourceType: result.resource_type
          });
          resolve(result);
        }
      );

      // Handle stream errors
      uploadStream.on('error', (streamError) => {
        console.error('❌ Cloudinary upload stream error event:', streamError);
        reject(streamError);
      });

      // Pipe buffer stream to upload stream
      stream.pipe(uploadStream);
    } catch (error) {
      console.error('❌ Error in uploadToCloudinary:', error);
      reject(error);
    }
  });
}

/**
 * Delete a file from Cloudinary by public ID
 * @param {string} publicId - Cloudinary public ID or local path
 * @returns {Promise<Object>} Cloudinary deletion result
 */
export function deleteFromCloudinary(publicId) {
  return new Promise((resolve, reject) => {
    if (!publicId) return resolve({ result: 'ok' });

    if (process.env.USE_LOCAL_STORAGE === 'true' || publicId.startsWith('/uploads') || publicId.startsWith('uploads/') || publicId.includes('/')) {
      try {
        const cleanPath = publicId.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
        const localPath = path.join(backendDir, 'public', 'uploads', cleanPath);
        const dir = path.dirname(localPath);
        const base = path.basename(localPath);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          const matched = files.filter(f => f.startsWith(base));
          for (const f of matched) {
            fs.unlinkSync(path.join(dir, f));
            console.log(`🗑️ Deleted local file: ${path.join(dir, f)}`);
          }
        }
        return resolve({ result: 'ok' });
      } catch (err) {
        console.error('❌ Error deleting local file:', err);
        return resolve({ result: 'error', error: err.message });
      }
    }

    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

