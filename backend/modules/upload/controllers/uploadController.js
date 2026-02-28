import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { initializeCloudinary } from '../../../config/cloudinary.js';

export const uploadSingleMedia = async (req, res) => {
  try {
    // Initialize Cloudinary if not already initialized
    await initializeCloudinary();

    if (!req.file) {
      return errorResponse(res, 400, 'No file provided');
    }

    // Validate file buffer
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 400, 'File buffer is empty or invalid');
    }

    const folder = req.body.folder || 'appzeto/uploads';

    console.log('📤 Uploading file to Cloudinary:', {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer.length,
      folder
    });

    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'auto',
      // Pass mimetype if available for better Cloudinary detection
      ...(req.file.mimetype && { context: { alt: req.file.originalname, caption: req.file.originalname } })
    });

    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed: No secure_url in response');
    }

    console.log('✅ File uploaded successfully:', {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type
    });

    return successResponse(res, 200, 'File uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      bytes: result.bytes,
      format: result.format
    });
  } catch (error) {
    console.error('❌ Cloudinary upload error:', {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      bufferSize: req.file?.buffer?.length
    });
    
    // Provide more detailed error message
    const errorMessage = error.message || 'Failed to upload file';
    return errorResponse(res, 500, `File upload failed: ${errorMessage}`);
  }
};

/**
 * Upload image from base64 string (for Flutter app)
 * Accepts base64 string, converts to buffer, and uploads to Cloudinary
 */
export const uploadBase64Media = async (req, res) => {
  try {
    // Initialize Cloudinary if not already initialized
    await initializeCloudinary();

    const { base64, mimeType, fileName, folder } = req.body;

    if (!base64) {
      return errorResponse(res, 400, 'Base64 string is required');
    }

    // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    
    // Convert base64 to buffer
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      return errorResponse(res, 400, 'Invalid base64 string');
    }

    if (buffer.length === 0) {
      return errorResponse(res, 400, 'Base64 string is empty or invalid');
    }

    const uploadFolder = folder || 'appzeto/uploads';
    const fileMimeType = mimeType || 'image/jpeg';
    const fileOriginalName = fileName || `image_${Date.now()}.jpg`;

    console.log('📤 Uploading base64 image to Cloudinary:', {
      fileName: fileOriginalName,
      mimeType: fileMimeType,
      bufferSize: buffer.length,
      folder: uploadFolder
    });

    const result = await uploadToCloudinary(buffer, {
      folder: uploadFolder,
      resource_type: 'auto',
      context: { alt: fileOriginalName, caption: fileOriginalName }
    });

    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed: No secure_url in response');
    }

    console.log('✅ Base64 image uploaded successfully:', {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type
    });

    return successResponse(res, 200, 'Image uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      bytes: result.bytes,
      format: result.format
    });
  } catch (error) {
    console.error('❌ Base64 upload error:', {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name
    });
    
    const errorMessage = error.message || 'Failed to upload image';
    return errorResponse(res, 500, `Image upload failed: ${errorMessage}`);
  }
};


