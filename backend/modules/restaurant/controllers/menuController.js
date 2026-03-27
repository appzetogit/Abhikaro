import Menu from '../models/Menu.js';
import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';
import { getCache, setCache, generateCacheKey, CACHE_TTL, invalidateCachePattern } from '../../../shared/utils/cache.js';

// Get menu for a restaurant
export const getMenu = asyncHandler(async (req, res) => {
  // Restaurant is attached by authenticate middleware
  const restaurantId = req.restaurant._id;

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    // Create empty menu
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      isActive: true,
    });
    await menu.save();
  }

  return successResponse(res, 200, 'Menu retrieved successfully', {
    menu: {
      sections: menu.sections || [],
      isActive: menu.isActive,
    },
  });
});

// Update menu (upsert)
export const updateMenu = asyncHandler(async (req, res) => {
  // Restaurant is attached by authenticate middleware
  const restaurantId = req.restaurant._id;
  const { sections, clearMenu } = req.body;
  
  console.log('=== UPDATE MENU REQUEST RECEIVED ===');
  console.log('Restaurant ID:', restaurantId);
  console.log('Sections count:', sections?.length || 0);
  
  // CRITICAL: Get existing menu FIRST to preserve approval status fields
  const existingMenu = await Menu.findOne({ restaurant: restaurantId });
  console.log('[UPDATE MENU] Existing menu found:', existingMenu ? 'Yes' : 'No');
  
  if (existingMenu) {
    console.log('[UPDATE MENU] Existing sections count:', existingMenu.sections?.length || 0);
  }

  // SAFETY GUARD:
  // Many restaurant apps send a second \"cleanup\" update with sections = []
  // immediately after a successful save. Without this guard, that empty payload
  // would wipe the entire menu. We only allow a full clear when the client
  // explicitly asks for it via clearMenu=true.
  if (
    existingMenu &&
    (!Array.isArray(sections) || sections.length === 0) &&
    !clearMenu
  ) {
    console.warn('[UPDATE MENU] Empty sections payload detected for restaurant', restaurantId.toString(), '- preserving existing menu (use clearMenu=true to wipe).');

    return successResponse(res, 200, 'Menu unchanged (empty update ignored)', {
      menu: {
        sections: existingMenu.sections || [],
        isActive: existingMenu.isActive,
      },
      ignoredEmptyUpdate: true,
    });
  }
  
  // Debug: Log incoming images data
  if (sections && Array.isArray(sections)) {
    sections.forEach((section, sIdx) => {
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach((item, iIdx) => {
          console.log(`[INCOMING] Section ${sIdx}, Item ${iIdx} (${item.name || 'unnamed'}):`);
          console.log(`  - images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
          console.log(`  - images length: ${Array.isArray(item.images) ? item.images.length : 'N/A'}`);
          console.log(`  - images value:`, item.images);
          console.log(`  - photoCount: ${item.photoCount}`);
        });
      }
      // Also check subsections
      if (section.subsections && Array.isArray(section.subsections)) {
        section.subsections.forEach((subsection, ssIdx) => {
          if (subsection.items && Array.isArray(subsection.items)) {
            subsection.items.forEach((item, iIdx) => {
              console.log(`[INCOMING] Section ${sIdx}, Subsection ${ssIdx}, Item ${iIdx} (${item.name || 'unnamed'}):`);
              console.log(`  - images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
              console.log(`  - images length: ${Array.isArray(item.images) ? item.images.length : 'N/A'}`);
              console.log(`  - images value:`, item.images);
              console.log(`  - photoCount: ${item.photoCount}`);
            });
          }
        });
      }
    });
  }

  // Normalize and validate sections
  const normalizedSections = Array.isArray(sections) ? sections.map((section, index) => {
    // Find existing section to preserve approval status
    const existingSection = existingMenu?.sections?.find(s => s.id === section.id);
    
    return {
      id: section.id || `section-${index}`,
      name: section.name || "Unnamed Section",
      items: Array.isArray(section.items) ? section.items.map(item => {
        // CRITICAL: Find existing item to preserve approval status fields
        const existingItem = existingSection?.items?.find(i => String(i.id) === String(item.id));
        
        // CRITICAL: Log the incoming item data to debug update issues
        console.log(`[NORMALIZE] Processing item "${item.name}" (ID: ${item.id}):`);
        console.log(`  - name: "${item.name}"`);
        console.log(`  - description: "${item.description}"`);
        console.log(`  - price: ${item.price}`);
        console.log(`  - preparationTime: "${item.preparationTime}"`);
        
        return {
      id: String(item.id || Date.now() + Math.random()),
      // CRITICAL: Use item.name directly, only fallback if undefined/null (not empty string)
      name: item.name !== undefined && item.name !== null ? item.name : "Unnamed Item",
      nameArabic: item.nameArabic !== undefined && item.nameArabic !== null ? item.nameArabic : "",
      image: item.image !== undefined && item.image !== null ? item.image : "",
      category: item.category !== undefined && item.category !== null ? item.category : section.name,
      // Preserve rating and reviews from existing item (these are user-generated, not restaurant-editable)
      rating: existingItem?.rating ?? item.rating ?? 0.0,
      reviews: existingItem?.reviews ?? item.reviews ?? 0,
      // CRITICAL: Use item.price directly, handle 0 as valid value
      price: item.price !== undefined && item.price !== null ? Number(item.price) : 0,
      stock: item.stock !== undefined && item.stock !== null ? item.stock : "Unlimited",
      discount: item.discount !== undefined ? item.discount : null,
      originalPrice: item.originalPrice !== undefined ? item.originalPrice : null,
      foodType: item.foodType !== undefined && item.foodType !== null ? item.foodType : "Non-Veg",
      availabilityTimeStart: item.availabilityTimeStart !== undefined && item.availabilityTimeStart !== null ? item.availabilityTimeStart : "12:01 AM",
      availabilityTimeEnd: item.availabilityTimeEnd !== undefined && item.availabilityTimeEnd !== null ? item.availabilityTimeEnd : "11:57 PM",
      // CRITICAL: Use item.description directly, allow empty strings
      description: item.description !== undefined && item.description !== null ? item.description : "",
      discountType: item.discountType !== undefined && item.discountType !== null ? item.discountType : "Percent",
      discountAmount: item.discountAmount !== undefined && item.discountAmount !== null ? Number(item.discountAmount) : 0.0,
      isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
      isRecommended: item.isRecommended !== undefined ? item.isRecommended : false,
      variations: Array.isArray(item.variations) ? item.variations.map(v => ({
        id: String(v.id || Date.now() + Math.random()),
        name: v.name !== undefined && v.name !== null ? v.name : "",
        price: v.price !== undefined && v.price !== null ? Number(v.price) : 0,
        stock: v.stock !== undefined && v.stock !== null ? v.stock : "Unlimited",
      })) : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
      allergies: Array.isArray(item.allergies) ? item.allergies : [],
      photoCount: item.photoCount !== undefined && item.photoCount !== null ? Number(item.photoCount) : 1,
      // Additional fields for complete item details - USE NEW VALUES FROM ITEM (not existingItem)
      subCategory: item.subCategory !== undefined && item.subCategory !== null ? item.subCategory : "",
      servesInfo: item.servesInfo !== undefined && item.servesInfo !== null ? item.servesInfo : "",
      itemSize: item.itemSize !== undefined && item.itemSize !== null ? item.itemSize : "",
      itemSizeQuantity: item.itemSizeQuantity !== undefined && item.itemSizeQuantity !== null ? item.itemSizeQuantity : "",
      itemSizeUnit: item.itemSizeUnit !== undefined && item.itemSizeUnit !== null ? item.itemSizeUnit : "piece",
      gst: item.gst !== undefined && item.gst !== null ? Number(item.gst) : 0,
      // CRITICAL: Use NEW preparationTime from item, fallback to existing only if new is undefined/null
      preparationTime: item.preparationTime !== undefined && item.preparationTime !== null ? item.preparationTime : (existingItem?.preparationTime || ""),
      images: (() => {
        // Ensure images array is properly handled - CRITICAL: Preserve all images
        console.log(`[NORMALIZE] Item "${item.name || 'unnamed'}": Processing images...`);
        console.log(`  - item.images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
        console.log(`  - item.images value:`, item.images);
        console.log(`  - item.image value:`, item.image);
        console.log(`  - item.photoCount:`, item.photoCount);
        
        if (Array.isArray(item.images)) {
          const filteredImages = item.images.filter(img => {
            const isValid = img && typeof img === 'string' && img.trim() !== '';
            if (!isValid) {
              console.log(`  - Filtering out invalid image:`, img);
            }
            return isValid;
          });
          console.log(`  - Input images: ${item.images.length}, Filtered images: ${filteredImages.length}`);
          console.log(`  - Final images array:`, filteredImages);
          if (filteredImages.length !== item.images.length) {
            console.warn(`  - WARNING: Some images were filtered out! Original: ${item.images.length}, Filtered: ${filteredImages.length}`);
          }
          return filteredImages;
        } else if (item.image && typeof item.image === 'string' && item.image.trim() !== '') {
          console.log(`  - No images array, using single image field:`, item.image);
          return [item.image];
        } else {
          console.log(`  - No images found, returning empty array`);
          return [];
        }
      })(),
      // CRITICAL: Preserve approval status fields from existing item.
      // NEW items from restaurant app should go for admin approval,
      // so default to 'pending' when there is no existing status.
      approvalStatus: existingItem?.approvalStatus || item.approvalStatus || 'pending',
      rejectionReason: existingItem?.rejectionReason || item.rejectionReason || '',
      requestedAt: existingItem?.requestedAt || item.requestedAt || (item.approvalStatus ? new Date(item.requestedAt || Date.now()) : new Date()),
      approvedAt: existingItem?.approvedAt || item.approvedAt,
      approvedBy: existingItem?.approvedBy || item.approvedBy,
      rejectedAt: existingItem?.rejectedAt || item.rejectedAt,
    };
      }) : [],
    subsections: Array.isArray(section.subsections) ? section.subsections.map(subsection => {
      // Find existing subsection to preserve approval status
      const existingSubsection = existingSection?.subsections?.find(s => s.id === subsection.id);
      
      return {
        id: subsection.id || `subsection-${Date.now()}`,
        name: subsection.name || "Unnamed Subsection",
        items: Array.isArray(subsection.items) ? subsection.items.map(item => {
          // CRITICAL: Find existing item to preserve approval status fields
          const existingItem = existingSubsection?.items?.find(i => String(i.id) === String(item.id));
          
          // CRITICAL: Log the incoming item data to debug update issues
          console.log(`[NORMALIZE] Processing subsection item "${item.name}" (ID: ${item.id}):`);
          console.log(`  - name: "${item.name}"`);
          console.log(`  - description: "${item.description}"`);
          console.log(`  - price: ${item.price}`);
          console.log(`  - preparationTime: "${item.preparationTime}"`);
          
          return {
        id: String(item.id || Date.now() + Math.random()),
        // CRITICAL: Use item.name directly, only fallback if undefined/null (not empty string)
        name: item.name !== undefined && item.name !== null ? item.name : "Unnamed Item",
        nameArabic: item.nameArabic !== undefined && item.nameArabic !== null ? item.nameArabic : "",
        image: item.image !== undefined && item.image !== null ? item.image : "",
        category: item.category !== undefined && item.category !== null ? item.category : section.name,
        // Preserve rating and reviews from existing item (these are user-generated, not restaurant-editable)
        rating: existingItem?.rating ?? item.rating ?? 0.0,
        reviews: existingItem?.reviews ?? item.reviews ?? 0,
        // CRITICAL: Use item.price directly, handle 0 as valid value
        price: item.price !== undefined && item.price !== null ? Number(item.price) : 0,
        stock: item.stock !== undefined && item.stock !== null ? item.stock : "Unlimited",
        discount: item.discount !== undefined ? item.discount : null,
        originalPrice: item.originalPrice !== undefined ? item.originalPrice : null,
        foodType: item.foodType !== undefined && item.foodType !== null ? item.foodType : "Non-Veg",
        availabilityTimeStart: item.availabilityTimeStart !== undefined && item.availabilityTimeStart !== null ? item.availabilityTimeStart : "12:01 AM",
        availabilityTimeEnd: item.availabilityTimeEnd !== undefined && item.availabilityTimeEnd !== null ? item.availabilityTimeEnd : "11:57 PM",
        // CRITICAL: Use item.description directly, allow empty strings
        description: item.description !== undefined && item.description !== null ? item.description : "",
        discountType: item.discountType !== undefined && item.discountType !== null ? item.discountType : "Percent",
        discountAmount: item.discountAmount !== undefined && item.discountAmount !== null ? Number(item.discountAmount) : 0.0,
        isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
        isRecommended: item.isRecommended !== undefined ? item.isRecommended : false,
        variations: Array.isArray(item.variations) ? item.variations.map(v => ({
          id: String(v.id || Date.now() + Math.random()),
          name: v.name !== undefined && v.name !== null ? v.name : "",
          price: v.price !== undefined && v.price !== null ? Number(v.price) : 0,
          stock: v.stock !== undefined && v.stock !== null ? v.stock : "Unlimited",
        })) : [],
        tags: Array.isArray(item.tags) ? item.tags : [],
        nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
        allergies: Array.isArray(item.allergies) ? item.allergies : [],
        photoCount: item.photoCount !== undefined && item.photoCount !== null ? Number(item.photoCount) : 1,
        // Additional fields for complete item details - USE NEW VALUES FROM ITEM (not existingItem)
        subCategory: item.subCategory !== undefined && item.subCategory !== null ? item.subCategory : "",
        servesInfo: item.servesInfo !== undefined && item.servesInfo !== null ? item.servesInfo : "",
        itemSize: item.itemSize !== undefined && item.itemSize !== null ? item.itemSize : "",
        itemSizeQuantity: item.itemSizeQuantity !== undefined && item.itemSizeQuantity !== null ? item.itemSizeQuantity : "",
        itemSizeUnit: item.itemSizeUnit !== undefined && item.itemSizeUnit !== null ? item.itemSizeUnit : "piece",
        gst: item.gst !== undefined && item.gst !== null ? Number(item.gst) : 0,
        // CRITICAL: Use NEW preparationTime from item, fallback to existing only if new is undefined/null
        preparationTime: item.preparationTime !== undefined && item.preparationTime !== null ? item.preparationTime : (existingItem?.preparationTime || ""),
        images: (() => {
          // Ensure images array is properly handled
          if (Array.isArray(item.images) && item.images.length > 0) {
            const filteredImages = item.images.filter(img => img && typeof img === 'string' && img.trim() !== '');
            console.log(`[NORMALIZE] Subsection Item "${item.name}": Processing ${item.images.length} images, filtered to ${filteredImages.length} valid images`);
            return filteredImages;
          } else if (item.image && item.image.trim() !== '') {
            console.log(`[NORMALIZE] Subsection Item "${item.name}": No images array, using single image field`);
            return [item.image];
          } else {
            console.log(`[NORMALIZE] Subsection Item "${item.name}": No images found, returning empty array`);
            return [];
          }
        })(),
        // CRITICAL: Preserve approval status fields from existing item.
        // NEW items from restaurant app should go for admin approval,
        // so default to 'pending' when there is no existing status.
        approvalStatus: existingItem?.approvalStatus || item.approvalStatus || 'pending',
        rejectionReason: existingItem?.rejectionReason || item.rejectionReason || '',
        requestedAt: existingItem?.requestedAt || item.requestedAt || (item.approvalStatus ? new Date(item.requestedAt || Date.now()) : new Date()),
        approvedAt: existingItem?.approvedAt || item.approvedAt,
        approvedBy: existingItem?.approvedBy || item.approvedBy,
        rejectedAt: existingItem?.rejectedAt || item.rejectedAt,
      };
        }) : [],
      };
    }) : [],
    isEnabled: section.isEnabled !== undefined ? section.isEnabled : true,
    order: section.order !== undefined ? section.order : index,
  };
  }) : [];

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });
  
  // Debug: Log normalized sections before saving - CRITICAL for debugging updates
  console.log('[UPDATE MENU] Normalized sections before save:');
  normalizedSections.forEach((section, sIdx) => {
    if (section.items && Array.isArray(section.items)) {
      section.items.forEach((item, iIdx) => {
        console.log(`[UPDATE MENU] Section ${sIdx}, Item ${iIdx} (${item.name}):`);
        console.log(`  - name: "${item.name}"`);
        console.log(`  - description: "${item.description}"`);
        console.log(`  - price: ${item.price}`);
        console.log(`  - preparationTime: "${item.preparationTime}"`);
        console.log(`  - images array length = ${item.images?.length || 0}`);
      });
    }
  });
  
  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: normalizedSections,
      isActive: true,
    });
    console.log('[UPDATE MENU] Creating new menu');
    await menu.save();
    console.log('[UPDATE MENU] New menu saved successfully');
  } else {
    console.log('[UPDATE MENU] Updating existing menu');
    
    // CRITICAL: Use findOneAndUpdate with $set for nested arrays - more reliable than save()
    // This ensures Mongoose properly updates nested arrays in the database
    const updateResult = await Menu.findOneAndUpdate(
      { restaurant: restaurantId },
      { 
        $set: { 
          sections: normalizedSections,
          updatedAt: new Date()
        } 
      },
      { 
        new: true, // Return updated document
        runValidators: true, // Run schema validators
        upsert: false // Don't create if doesn't exist
      }
    );
    
    if (!updateResult) {
      console.error('[UPDATE MENU] Failed to update menu - findOneAndUpdate returned null');
      throw new Error('Failed to update menu in database');
    }
    
    menu = updateResult;
    console.log('[UPDATE MENU] Menu updated successfully using findOneAndUpdate');
    
    // Also try the save method as fallback (though findOneAndUpdate should work)
    // menu.set('sections', normalizedSections);
    // menu.markModified('sections');
    // menu.isNew = false;
    // await menu.save();
  }
  
  // Invalidate menu cache for this restaurant
  await invalidateCachePattern(`menu:${restaurantId}*`);
  
  // Debug: Verify what was saved - reload from database
  const savedMenu = await Menu.findOne({ restaurant: restaurantId }).lean();
  if (savedMenu && savedMenu.sections) {
    console.log('[UPDATE MENU] === VERIFICATION AFTER SAVE ===');
    savedMenu.sections.forEach((section, sIdx) => {
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach((item, iIdx) => {
          console.log(`[VERIFY] Section ${sIdx}, Item ${iIdx} (${item.name}):`);
          console.log(`  - images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
          console.log(`  - images length: ${item.images?.length || 0}`);
          console.log(`  - images value:`, item.images);
          console.log(`  - photoCount: ${item.photoCount}`);
          if (item.images && item.images.length === 1 && item.photoCount > 1) {
            console.error(`  - ERROR: Only 1 image saved but photoCount is ${item.photoCount}!`);
          }
        });
      }
    });
    console.log('[UPDATE MENU] === END VERIFICATION ===');
  }

  return successResponse(res, 200, 'Menu updated successfully', {
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a new section (category)
export const addSection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Section name is required');
  }

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      isActive: true,
    });
  }

  // Check if section with same name already exists
  const existingSection = menu.sections.find(
    s => s.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (existingSection) {
    return errorResponse(res, 400, 'Section with this name already exists');
  }

  // Create new section
  const newSection = {
    id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    items: [],
    subsections: [],
    isEnabled: true,
    order: menu.sections.length,
  };

  menu.sections.push(newSection);
  await menu.save();

  return successResponse(res, 201, 'Section added successfully', {
    section: newSection,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a new item to a section
export const addItemToSection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, item } = req.body;

  if (!sectionId) {
    return errorResponse(res, 400, 'Section ID is required');
  }

  if (!item || !item.name || item.price === undefined) {
    return errorResponse(res, 400, 'Item name and price are required');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find section
  const section = menu.sections.find(s => s.id === sectionId);
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Normalize item data
  const newItem = {
    id: String(item.id || Date.now() + Math.random()),
    name: item.name.trim(),
    nameArabic: item.nameArabic || "",
    image: item.image || "",
    category: item.category || section.name,
    rating: item.rating ?? 0.0,
    reviews: item.reviews ?? 0,
    price: Number(item.price) || 0,
    stock: item.stock || "Unlimited",
    discount: item.discount || null,
    originalPrice: item.originalPrice || null,
    foodType: item.foodType || "Non-Veg",
    availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
    availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
    description: item.description || "",
    discountType: item.discountType || "Percent",
    discountAmount: item.discountAmount ?? 0.0,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isRecommended: item.isRecommended || false,
    variations: Array.isArray(item.variations) ? item.variations.map(v => ({
      id: String(v.id || Date.now() + Math.random()),
      name: v.name || "",
      price: Number(v.price) || 0,
      stock: v.stock || "Unlimited",
    })) : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
    allergies: Array.isArray(item.allergies) ? item.allergies : [],
    photoCount: item.photoCount ?? 1,
    // Additional fields for complete item details
    subCategory: item.subCategory || "",
    servesInfo: item.servesInfo || "",
    itemSize: item.itemSize || "",
    itemSizeQuantity: item.itemSizeQuantity || "",
    itemSizeUnit: item.itemSizeUnit || "piece",
    gst: item.gst ?? 0,
    images: Array.isArray(item.images) && item.images.length > 0 
      ? item.images.filter(img => img && typeof img === 'string' && img.trim() !== '')
      : (item.image && item.image.trim() !== '' ? [item.image] : []),
    preparationTime: item.preparationTime || "",
    // New items require admin approval
    approvalStatus: 'pending',
    requestedAt: new Date(),
  };

  section.items.push(newItem);
  await menu.save();

  return successResponse(res, 201, 'Item added successfully', {
    item: newItem,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a subsection to a section
export const addSubsectionToSection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, name } = req.body;

  if (!sectionId) {
    return errorResponse(res, 400, 'Section ID is required');
  }

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Subsection name is required');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find section
  const section = menu.sections.find(s => s.id === sectionId);
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Check if subsection with same name already exists
  const existingSubsection = section.subsections.find(
    sub => sub.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (existingSubsection) {
    return errorResponse(res, 400, 'Subsection with this name already exists');
  }

  // Create new subsection
  const newSubsection = {
    id: `subsection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    items: [],
  };

  section.subsections.push(newSubsection);
  await menu.save();

  return successResponse(res, 201, 'Subsection added successfully', {
    subsection: newSubsection,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a new item to a subsection
export const addItemToSubsection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, subsectionId, item } = req.body;

  if (!sectionId || !subsectionId) {
    return errorResponse(res, 400, 'Section ID and Subsection ID are required');
  }

  if (!item || !item.name || item.price === undefined) {
    return errorResponse(res, 400, 'Item name and price are required');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find section
  const section = menu.sections.find(s => s.id === sectionId);
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Find subsection
  const subsection = section.subsections.find(sub => sub.id === subsectionId);
  if (!subsection) {
    return errorResponse(res, 404, 'Subsection not found');
  }

  // Normalize item data
  const newItem = {
    id: String(item.id || Date.now() + Math.random()),
    name: item.name.trim(),
    nameArabic: item.nameArabic || "",
    image: item.image || "",
    category: item.category || section.name,
    rating: item.rating ?? 0.0,
    reviews: item.reviews ?? 0,
    price: Number(item.price) || 0,
    stock: item.stock || "Unlimited",
    discount: item.discount || null,
    originalPrice: item.originalPrice || null,
    foodType: item.foodType || "Non-Veg",
    availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
    availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
    description: item.description || "",
    discountType: item.discountType || "Percent",
    discountAmount: item.discountAmount ?? 0.0,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isRecommended: item.isRecommended || false,
    variations: Array.isArray(item.variations) ? item.variations.map(v => ({
      id: String(v.id || Date.now() + Math.random()),
      name: v.name || "",
      price: Number(v.price) || 0,
      stock: v.stock || "Unlimited",
    })) : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
    allergies: Array.isArray(item.allergies) ? item.allergies : [],
    photoCount: item.photoCount ?? 1,
    gst: item.gst ?? 0,
    images: Array.isArray(item.images) && item.images.length > 0 
      ? item.images.filter(img => img && typeof img === 'string' && img.trim() !== '')
      : (item.image && item.image.trim() !== '' ? [item.image] : []),
    preparationTime: item.preparationTime || "",
    // New items require admin approval
    approvalStatus: 'pending',
    requestedAt: new Date(),
  };

  subsection.items.push(newItem);
  await menu.save();

  return successResponse(res, 201, 'Item added to subsection successfully', {
    item: newItem,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Delete a menu item (from section and all subsections)
export const deleteMenuItem = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, itemId } = req.params;

  if (!sectionId || !itemId) {
    return errorResponse(res, 400, 'Section ID and Item ID are required');
  }

  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  const section = menu.sections.find(s => String(s.id) === String(sectionId));
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Remove from top-level items
  const initialItemsLength = (section.items || []).length;
  section.items = (section.items || []).filter(item => String(item.id) !== String(itemId));

  // Remove from all subsections
  let removedFromSubsections = 0;
  section.subsections = (section.subsections || []).map(subsection => {
    const before = (subsection.items || []).length;
    const filteredItems = (subsection.items || []).filter(item => String(item.id) !== String(itemId));
    if (before !== filteredItems.length) {
      removedFromSubsections += before - filteredItems.length;
    }
    return {
      ...subsection,
      items: filteredItems,
    };
  });

  const removedFromItems = initialItemsLength - (section.items || []).length;

  if (removedFromItems === 0 && removedFromSubsections === 0) {
    return errorResponse(res, 404, 'Item not found in this section');
  }

  menu.markModified('sections');
  await menu.save();

  // Invalidate menu cache for this restaurant
  await invalidateCachePattern(`menu:${restaurantId}*`);

  return successResponse(res, 200, 'Menu item deleted successfully', {
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Get menu by restaurant ID (public - for user module)
export const getMenuByRestaurantId = async (req, res) => {
  try {
    const { id } = req.params;

    // Generate cache key
    const cacheKey = generateCacheKey('menu', id);

    // Try to get from cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return successResponse(res, 200, 'Menu retrieved successfully (cached)', cached);
    }
    
    // Find restaurant by ID, slug, or restaurantId
    const restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: id },
        { slug: id },
        ...(mongoose.Types.ObjectId.isValid(id) && id.length === 24 
          ? [{ _id: new mongoose.Types.ObjectId(id) }] 
          : []),
      ],
      isActive: true,
    }).lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Find menu
    const menu = await Menu.findOne({ 
      restaurant: restaurant._id,
      isActive: true,
    }).lean();

    if (!menu) {
      // Return empty menu if not found
      return successResponse(res, 200, 'Menu retrieved successfully', {
        menu: {
          sections: [],
          isActive: true,
        },
      });
    }

    console.log('[USER MENU] Processing menu for restaurant:', restaurant._id);
    console.log('[USER MENU] Total sections:', menu.sections?.length || 0);
    
    // Filter menu for user side: only show enabled sections and available items
    const filteredSections = (menu.sections || [])
      .filter(section => {
        // Only show sections where isEnabled is not explicitly false
        // If isEnabled is undefined/null, treat as enabled (default true)
        const isEnabled = section.isEnabled !== false;
        if (!isEnabled) {
          console.log(`[USER MENU] Filtering out disabled section: "${section.name}"`);
        }
        return isEnabled;
      })
      .map(section => {
        console.log(`[USER MENU] Processing section: "${section.name}", items: ${section.items?.length || 0}`);
        // Filter direct items - only show available AND approved items
        // Items where isAvailable is not explicitly false AND approvalStatus is 'approved' should be shown
        const availableItems = (section.items || []).filter(item => {
          const isAvailable = item.isAvailable !== false;
          const isApproved = item.approvalStatus === 'approved' || !item.approvalStatus; // Include approved or legacy items without approvalStatus
          const shouldShow = isAvailable && isApproved;
          
          // Debug logging for filtered items
          if (!shouldShow) {
            console.log(`[USER MENU] Filtering out item "${item.name}": isAvailable=${item.isAvailable}, approvalStatus=${item.approvalStatus}`);
          }
          
          // Debug logging for preparationTime - log ALL items to see what's in the data
          if (shouldShow) {
            console.log(`[USER MENU] Item "${item.name}": preparationTime="${item.preparationTime}" (type: ${typeof item.preparationTime}, exists: ${item.hasOwnProperty('preparationTime')})`);
          }
          
          return shouldShow;
        });
        
        // Filter subsections and their items
        const availableSubsections = (section.subsections || [])
          .map(subsection => {
            const availableSubsectionItems = (subsection.items || []).filter(item => {
              const isAvailable = item.isAvailable !== false;
              const isApproved = item.approvalStatus === 'approved' || !item.approvalStatus; // Include approved or legacy items without approvalStatus
              const shouldShow = isAvailable && isApproved;
              
              // Debug logging for filtered items
              if (!shouldShow) {
                console.log(`[USER MENU] Filtering out subsection item "${item.name}": isAvailable=${item.isAvailable}, approvalStatus=${item.approvalStatus}`);
              }
              
              // Debug logging for preparationTime - log ALL items to see what's in the data
              if (shouldShow) {
                console.log(`[USER MENU] Subsection item "${item.name}": preparationTime="${item.preparationTime}" (type: ${typeof item.preparationTime}, exists: ${item.hasOwnProperty('preparationTime')})`);
              }
              
              return shouldShow;
            });
            // Only include subsection if it has available items
            if (availableSubsectionItems.length > 0) {
              return {
                ...subsection,
                items: availableSubsectionItems,
              };
            }
            return null;
          })
          .filter(subsection => subsection !== null); // Remove null subsections
        
        // Include section if it has at least one available item OR at least one subsection with available items
        // This ensures category remains visible even if some items are unavailable
        if (availableItems.length > 0 || availableSubsections.length > 0) {
          console.log(`[USER MENU] Section "${section.name}" included with ${availableItems.length} items and ${availableSubsections.length} subsections`);
          return {
            ...section,
            name: section.name || "Unnamed Section", // Ensure name is always present
            items: availableItems,
            subsections: availableSubsections,
          };
        }
        // Return null only if section has no available items AND no subsections with available items
        console.log(`[USER MENU] Section "${section.name}" excluded - no available/approved items`);
        return null;
      })
      .filter(section => section !== null); // Remove null sections (sections with no available items)

    console.log('[USER MENU] Final filtered sections count:', filteredSections.length);
    const totalItems = filteredSections.reduce((sum, section) => {
      const sectionItems = (section.items || []).length;
      const subsectionItems = (section.subsections || []).reduce((subSum, sub) => subSum + (sub.items || []).length, 0);
      return sum + sectionItems + subsectionItems;
    }, 0);
    console.log('[USER MENU] Total items shown to user:', totalItems);

    const responseData = {
      menu: {
        sections: filteredSections,
        isActive: menu.isActive,
      },
    };

    // Cache the response
    await setCache(cacheKey, responseData, CACHE_TTL.MENU_ITEMS);

    return successResponse(res, 200, 'Menu retrieved successfully', responseData);
  } catch (error) {
    console.error('Error fetching menu by restaurant ID:', error);
    return errorResponse(res, 500, 'Failed to fetch menu');
  }
};

// Add a new add-on
export const addAddon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { name, description, price, image, images } = req.body;

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Add-on name is required');
  }

  if (price === undefined || price === null || price < 0) {
    return errorResponse(res, 400, 'Add-on price is required and must be non-negative');
  }

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      addons: [],
      isActive: true,
    });
  }

  // Normalize images array
  const normalizedImages = Array.isArray(images) && images.length > 0
    ? images.filter(img => img && typeof img === 'string' && img.trim() !== '')
    : (image && image.trim() !== '' ? [image] : []);

  // Create new add-on
  const newAddon = {
    id: `addon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    description: description || '',
    price: Number(price) || 0,
    image: normalizedImages.length > 0 ? normalizedImages[0] : '',
    images: normalizedImages,
    isAvailable: true,
    approvalStatus: 'pending', // New add-ons require admin approval
    requestedAt: new Date(),
  };

  menu.addons.push(newAddon);
  // Mark addons array as modified to ensure Mongoose properly saves nested array changes
  // This is CRITICAL for nested arrays in Mongoose, especially with Date objects
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 201, 'Add-on added successfully. Pending admin approval.', {
    addon: newAddon,
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

// Get add-ons for restaurant (filtered by approval status)
export const getAddons = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { includePending = false } = req.query;

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    return successResponse(res, 200, 'No add-ons found', {
      addons: [],
    });
  }

  // Filter add-ons based on approval status
  let addons = menu.addons || [];
  
  if (!includePending) {
    // For restaurant view, show all add-ons (including pending for their reference)
    // For public view, only show approved add-ons
    addons = addons; // Show all for restaurant admin
  } else {
    // Show all add-ons including pending
    addons = addons;
  }

  return successResponse(res, 200, 'Add-ons retrieved successfully', {
    addons,
  });
});

// Get addons by restaurant ID (public - for user module)
export const getAddonsByRestaurantId = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[ADDONS] Request received for ID: ${id}`);
    console.log(`[ADDONS] ID type: ${typeof id}, length: ${id?.length}`);
    
    // Find restaurant by ID, slug, or restaurantId - don't filter by isActive
    let restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: id },
        { slug: id },
        ...(mongoose.Types.ObjectId.isValid(id) && id.length === 24 
          ? [{ _id: new mongoose.Types.ObjectId(id) }] 
          : []),
      ],
    });

    if (!restaurant) {
      console.log(`[ADDONS] Restaurant not found for ID: ${id}`);
      return errorResponse(res, 404, 'Restaurant not found');
    }

    console.log(`[ADDONS] Restaurant found: ${restaurant._id}, name: ${restaurant.name}, isActive: ${restaurant.isActive}`);

    console.log(`[ADDONS] Restaurant found: ${restaurant._id}, name: ${restaurant.name}`);

    // Find menu - don't filter by isActive, just get the menu
    const menu = await Menu.findOne({ 
      restaurant: restaurant._id,
    });

    if (!menu) {
      console.log(`[ADDONS] No menu found for restaurant: ${restaurant._id}`);
      return successResponse(res, 200, 'No add-ons found', {
        addons: [],
      });
    }

    console.log(`[ADDONS] Menu found for restaurant: ${restaurant._id}`);
    console.log(`[ADDONS] Menu isActive: ${menu.isActive}`);
    console.log(`[ADDONS] Total addons in menu: ${(menu.addons || []).length}`);

    // Filter to show only approved and available addons for users
    const allAddons = menu.addons || [];
    const approvedAddons = allAddons.filter(addon => 
      addon.approvalStatus === 'approved' && addon.isAvailable !== false
    );
    
    // Log filtered addons for debugging
    console.log(`[ADDONS] Total addons: ${allAddons.length}, Approved addons: ${approvedAddons.length}`);
    if (approvedAddons.length > 0) {
      console.log(`[ADDONS] Approved addon details:`, approvedAddons.map(a => ({
        id: a.id,
        name: a.name,
        isAvailable: a.isAvailable,
        approvalStatus: a.approvalStatus,
        price: a.price
      })));
    } else {
      console.log(`[ADDONS] No approved addons found. Total addons: ${allAddons.length}`);
    }

    return successResponse(res, 200, 'Add-ons retrieved successfully', {
      addons: approvedAddons,
    });
  } catch (error) {
    console.error('Error fetching addons by restaurant ID:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, 'Failed to fetch add-ons');
  }
};

// Update an add-on
export const updateAddon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;
  const { name, description, price, image, images, isAvailable } = req.body;

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find add-on
  const addonIndex = menu.addons.findIndex(a => String(a.id) === String(id));
  if (addonIndex === -1) {
    return errorResponse(res, 404, 'Add-on not found');
  }

  const addon = menu.addons[addonIndex];

  // If isAvailable is provided, update it without requiring re-approval
  if (typeof isAvailable === 'boolean') {
    addon.isAvailable = isAvailable;
    menu.markModified(`addons.${addonIndex}`);
    menu.markModified('addons');
    await menu.save();

    return successResponse(res, 200, 'Add-on availability updated successfully', {
      addon: menu.addons[addonIndex],
      menu: {
        addons: menu.addons,
        isActive: menu.isActive,
      },
    });
  }

  // For other updates, require name and price
  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Add-on name is required');
  }

  if (price === undefined || price === null || price < 0) {
    return errorResponse(res, 400, 'Add-on price is required and must be non-negative');
  }

  // Normalize images array
  const normalizedImages = Array.isArray(images) && images.length > 0
    ? images.filter(img => img && typeof img === 'string' && img.trim() !== '')
    : (image && image.trim() !== '' ? [image] : []);

  // Update add-on (preserve approval status if already approved/rejected)
  addon.name = name.trim();
  addon.description = description || '';
  addon.price = Number(price) || 0;
  addon.image = normalizedImages.length > 0 ? normalizedImages[0] : '';
  addon.images = normalizedImages;

  // If editing an approved/rejected add-on, set status back to pending for re-approval
  if (addon.approvalStatus === 'approved' || addon.approvalStatus === 'rejected') {
    addon.approvalStatus = 'pending';
    addon.requestedAt = new Date();
    addon.approvedAt = null;
    addon.approvedBy = null;
    addon.rejectedAt = null;
    addon.rejectionReason = '';
  }

  menu.markModified(`addons.${addonIndex}`);
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 200, 'Add-on updated successfully. Pending admin approval if previously approved.', {
    addon: menu.addons[addonIndex],
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

// Delete an add-on
export const deleteAddon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find and remove add-on
  const addonIndex = menu.addons.findIndex(a => String(a.id) === String(id));
  if (addonIndex === -1) {
    return errorResponse(res, 404, 'Add-on not found');
  }

  menu.addons.splice(addonIndex, 1);
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 200, 'Add-on deleted successfully', {
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

/**
 * Get bulk menus for multiple restaurants (public - for user discovery)
 * Helps reduce the number of parallel requests from client (N+1 issue)
 */
export const getBulkMenus = asyncHandler(async (req, res) => {
  const { ids } = req.query; // Comma-separated list of restaurantIds/mongoIds

  if (!ids || typeof ids !== 'string' || ids.trim() === '') {
    return successResponse(res, 200, 'Empty bulk menus response', { menus: [] });
  }

  const restaurantIds = ids.split(',').filter(id => id.trim() !== '');
  
  // Use a map to store menus by restaurantId for efficiency
  const orConditions = restaurantIds.map(id => {
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      return { restaurant: new mongoose.Types.ObjectId(id) };
    }
    return { restaurantId: id }; // Handle legacy restaurantId field
  });

  // Find all menus for these restaurants in one query
  const menus = await Menu.find({
    $or: orConditions,
    isActive: true
  }).select('restaurant restaurantId sections.name sections.items.name sections.items.price sections.items.originalPrice sections.items.discountPercent sections.items.image sections.items.category sections.items.approvalStatus sections.items.isAvailable sections.subsections.name sections.subsections.items.name sections.subsections.items.price sections.subsections.items.image sections.subsections.items.category sections.subsections.items.approvalStatus sections.subsections.items.isAvailable')
  .lean();

  // Return limited data to keep response size manageable for bulk results
  return successResponse(res, 200, 'Bulk menus retrieved successfully', { 
    menus: menus.map(menu => ({
      restaurant: menu.restaurant,
      restaurantId: menu.restaurantId,
      sections: (menu.sections || []).map(section => ({
        name: section.name,
        items: (section.items || []).filter(i => i.isAvailable !== false && (i.approvalStatus === 'approved' || !i.approvalStatus)),
        subsections: (section.subsections || []).map(ss => ({
          name: ss.name,
          items: (ss.items || []).filter(i => i.isAvailable !== false && (i.approvalStatus === 'approved' || !i.approvalStatus))
        }))
      }))
    }))
  });
});

