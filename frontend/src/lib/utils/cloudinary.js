/**
 * Cloudinary Upload Utility
 * Wrapper around uploadAPI.uploadMedia for easier usage
 */

import { uploadAPI } from "@/lib/api"

/**
 * Upload a file to Cloudinary via backend
 * @param {File} file - Browser File object
 * @param {Object} options - Optional upload options (folder, etc.)
 * @returns {Promise<Object>} - Returns object with url and publicId
 */
export async function uploadToCloudinary(file, options = {}) {
  if (!file) {
    throw new Error("File is required")
  }

  try {
    const response = await uploadAPI.uploadMedia(file, options)
    
    // Handle different response structures
    const data = response?.data?.data || response?.data
    
    if (!data) {
      throw new Error("No data returned from upload")
    }

    // Return in the format expected by the components
    // Ensure we always return url and publicId
    const url = data.url || data.secure_url
    const publicId = data.publicId || data.public_id || null
    
    if (!url) {
      throw new Error("No URL returned from upload service")
    }

    return {
      url,
      publicId,
      ...data
    }
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error)
    throw error
  }
}
