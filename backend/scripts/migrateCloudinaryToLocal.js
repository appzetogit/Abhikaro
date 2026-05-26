import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { initializeCloudinary } from '../config/cloudinary.js';

dotenv.config();

// Helper to download a stream to a local path
const downloadFile = async (url, targetPath) => {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const writer = fs.createWriteStream(targetPath);
  
  let downloadTimer = null;
  const cleanup = () => {
    if (downloadTimer) {
      clearTimeout(downloadTimer);
      downloadTimer = null;
    }
  };

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 15000 // 15s connection timeout
    });
    
    // Set a total download timeout of 25 seconds
    downloadTimer = setTimeout(() => {
      response.data.destroy(new Error('Download stream timeout'));
      writer.destroy(new Error('Download stream timeout'));
    }, 25000);

    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        cleanup();
        resolve();
      });
      writer.on('error', (err) => {
        cleanup();
        reject(err);
      });
      response.data.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });
  } catch (err) {
    cleanup();
    throw err;
  }
};

// Helper to parse Cloudinary URL and extract clean folder path + filename
const parseCloudinaryUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    // Find index of 'upload' or similar Cloudinary action
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex === -1) return null;
    
    // Extract everything after /upload/
    let remainingParts = pathParts.slice(uploadIndex + 1);
    
    // Filter out version strings (v1234567) and transformation parameters (w_200,c_fill,etc.)
    remainingParts = remainingParts.filter(part => {
      // Version regex: v followed by exactly digits
      if (part.startsWith('v') && /^\d+$/.test(part.substring(1))) {
        return false;
      }
      // Transformation parameters often contain commas or specific abbreviations
      if (
        part.includes(',') || 
        part.includes('w_') || 
        part.includes('h_') || 
        part.includes('q_') || 
        part.includes('f_') || 
        part.includes('c_')
      ) {
        return false;
      }
      return true;
    });
    
    const relativePath = remainingParts.join('/');
    return relativePath;
  } catch (error) {
    console.error(`Error parsing URL ${url}:`, error.message);
    return null;
  }
};

// Main function to check and download Cloudinary URL, returning the local relative path
const ensureDownloadedAndGetLocalPath = async (url) => {
  const relPath = parseCloudinaryUrl(url);
  if (!relPath) return null;
  
  const targetPath = path.join(process.cwd(), 'public', 'uploads', relPath);
  const localUrl = `/uploads/${relPath}`;
  
  if (fs.existsSync(targetPath)) {
    return localUrl; // Already downloaded
  }
  
  console.log(`📥 Downloading ${url} -> ${localUrl}...`);
  try {
    await downloadFile(url, targetPath);
    console.log(`   ✅ Downloaded successfully!`);
    return localUrl;
  } catch (error) {
    console.error(`   ❌ Failed to download ${url}:`, error.message);
    return null;
  }
};

// Dynamic model importer to scan the modules directory and load all models
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
        // Suppress warning if not a real schema or already loaded
      }
    }
  }
};

const runMigration = async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    console.log("🔍 Scanning and registering Mongoose models...");
    const modulesPath = path.join(process.cwd(), 'modules');
    await scanAndImportModels(modulesPath);
    console.log("✅ Models registered successfully");

    // Initialize Cloudinary to fetch assets directly
    let cloudinaryAssets = [];
    try {
      console.log("🔧 Initializing Cloudinary API...");
      await initializeCloudinary();
      console.log("✅ Cloudinary initialized successfully");
      
      console.log("📦 Fetching list of all resources from Cloudinary (image)...");
      let nextCursor = null;
      do {
        const result = await cloudinary.api.resources({
          resource_type: 'image',
          max_results: 500,
          next_cursor: nextCursor
        });
        if (result && result.resources) {
          cloudinaryAssets = cloudinaryAssets.concat(result.resources);
          nextCursor = result.next_cursor;
        }
      } while (nextCursor);

      console.log(`✅ Found ${cloudinaryAssets.length} image assets in Cloudinary`);

      console.log("📦 Fetching list of all resources from Cloudinary (video)...");
      nextCursor = null;
      do {
        try {
          const result = await cloudinary.api.resources({
            resource_type: 'video',
            max_results: 500,
            next_cursor: nextCursor
          });
          if (result && result.resources) {
            cloudinaryAssets = cloudinaryAssets.concat(result.resources);
            nextCursor = result.next_cursor;
          }
        } catch (videoError) {
          break; // Suppress errors if no video resources exist or API fails for videos
        }
      } while (nextCursor);

      console.log(`✅ Total Cloudinary assets fetched: ${cloudinaryAssets.length}`);
    } catch (cloudinaryInitError) {
      console.warn("⚠️ Warning: Could not fetch resources from Cloudinary directly:", cloudinaryInitError.message);
      console.log("💡 Migration will fall back to dynamic database parsing and downloading.");
    }

    // First download all known assets from the fetched Cloudinary list
    if (cloudinaryAssets.length > 0) {
      console.log("📥 Downloading assets listed in Cloudinary...");
      let successCount = 0;
      for (const asset of cloudinaryAssets) {
        const url = asset.secure_url;
        const localUrl = await ensureDownloadedAndGetLocalPath(url);
        if (localUrl) successCount++;
      }
      console.log(`✅ Pre-downloaded ${successCount}/${cloudinaryAssets.length} assets`);
    }

    console.log("🔍 Scanning MongoDB collections for Cloudinary URLs...");
    const modelNames = mongoose.modelNames();
    console.log(`📋 Models to scan: ${modelNames.join(', ')}`);

    let totalUpdated = 0;

    for (const modelName of modelNames) {
      try {
        const Model = mongoose.model(modelName);
        const docs = await Model.find({});
        
        console.log(`   🔎 Scanning Model '${modelName}' (${docs.length} documents)...`);
        
        for (const doc of docs) {
          const docObj = doc.toObject();
          let modified = false;

          // Recursive function to search for Cloudinary URLs in nested fields
          const scanObject = async (obj) => {
            let changed = false;
            if (!obj || typeof obj !== 'object') return false;

            for (const [key, value] of Object.entries(obj)) {
              if (typeof value === 'string' && value.includes('res.cloudinary.com')) {
                const localUrl = await ensureDownloadedAndGetLocalPath(value);
                if (localUrl) {
                  obj[key] = localUrl;
                  changed = true;
                  modified = true;
                }
              } else if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                  if (typeof value[i] === 'string' && value[i].includes('res.cloudinary.com')) {
                    const localUrl = await ensureDownloadedAndGetLocalPath(value[i]);
                    if (localUrl) {
                      value[i] = localUrl;
                      changed = true;
                      modified = true;
                    }
                  } else if (value[i] && typeof value[i] === 'object') {
                    const arrayElemChanged = await scanObject(value[i]);
                    if (arrayElemChanged) {
                      changed = true;
                      modified = true;
                    }
                  }
                }
              } else if (value && typeof value === 'object') {
                const childChanged = await scanObject(value);
                if (childChanged) {
                  changed = true;
                  modified = true;
                }
              }
            }
            return changed;
          };

          await scanObject(docObj);

          if (modified) {
            // Bypass validation and pre-save hooks to write direct updates
            await Model.updateOne({ _id: doc._id }, { $set: docObj });
            console.log(`      ✅ Updated ${modelName} ID: ${doc._id}`);
            totalUpdated++;
          }
        }
      } catch (modelError) {
        console.error(`❌ Error scanning model '${modelName}':`, modelError.message);
      }
    }

    console.log(`🎉 Migration Completed! Total documents updated in database: ${totalUpdated}`);

  } catch (error) {
    console.error("❌ Critical migration error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
    process.exit();
  }
};

runMigration();
