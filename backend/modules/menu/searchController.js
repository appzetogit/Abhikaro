import mongoose from 'mongoose';
import Menu from '../restaurant/models/Menu.js';
import Restaurant from '../restaurant/models/Restaurant.js';
import RestaurantCategory from '../restaurant/models/RestaurantCategory.js';
import Zone from '../admin/models/Zone.js';

/**
 * Normalize and validate the query string
 */
function getNormalizedQuery(qRaw) {
  if (typeof qRaw !== 'string') return '';
  return qRaw.trim().toLowerCase();
}

/**
 * Build a safe case-insensitive regex for contains match.
 * Falls back to plain substring filtering in JS if regex fails.
 */
function buildSafeRegexContains(qNorm) {
  try {
    const escaped = qNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  } catch {
    return null;
  }
}

/**
 * Suggest endpoint: returns grouped suggestions across foods, restaurants, categories
 * GET /api/menu/search/suggest?q=<term>&limit=5
 */
export async function suggestUnifiedSearch(req, res, next) {
  try {
    const qNorm = getNormalizedQuery(req.query.q || req.query.query || '');
    const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10) || 5, 1), 10);
    const zoneIdRaw = req.query.zoneId || req.query.zone || null;
    if (qNorm.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query must be at least 2 characters',
      });
    }

    const rx = buildSafeRegexContains(qNorm);

    // Zone scoping: if zoneId is provided, restrict all suggestions to restaurants in that zone.
    // This prevents showing dishes/restaurants from other zones in typeahead.
    let allowedRestaurantIds = null;
    if (zoneIdRaw) {
      const zoneId = String(zoneIdRaw).trim();
      if (mongoose.Types.ObjectId.isValid(zoneId)) {
        try {
          const z = await Zone.findById(zoneId).select('_id isActive').lean();
          if (!z || z.isActive === false) {
            return res.status(200).json({
              success: true,
              data: { foods: [], restaurants: [], categories: [] },
            });
          }
        } catch {
          return res.status(200).json({
            success: true,
            data: { foods: [], restaurants: [], categories: [] },
          });
        }
      }

      // Restaurant.zoneId might be stored as ObjectId or string (legacy).
      const zoneCandidates = [
        mongoose.Types.ObjectId.isValid(zoneId) ? new mongoose.Types.ObjectId(zoneId) : null,
        zoneId,
      ].filter(Boolean);

      const inZoneRestaurants = await Restaurant.find(
        {
          zoneId: { $in: zoneCandidates },
          isActive: true,
          isAcceptingOrders: true,
          approvedAt: { $exists: true, $ne: null },
        },
        { _id: 1 }
      ).lean();
      allowedRestaurantIds = inZoneRestaurants.map((r) => String(r._id));

      if (!allowedRestaurantIds.length) {
        return res.status(200).json({
          success: true,
          data: { foods: [], restaurants: [], categories: [] },
        });
      }
    }

    // Query restaurants
    const restaurantQuery = rx ? {
      $or: [
        { name: { $regex: rx } },
        { cuisines: { $elemMatch: { $regex: rx } } },
      ],
      isActive: true,
      isAcceptingOrders: true,
      approvedAt: { $exists: true, $ne: null },
    } : { 
      isActive: true,
      approvedAt: { $exists: true, $ne: null },
    };

    const restaurants = await Restaurant.find(
      {
        ...restaurantQuery,
        // Ensure closed/offline restaurants do not appear in search surfaces.
        isAcceptingOrders: true,
        ...(allowedRestaurantIds ? { _id: { $in: allowedRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {}),
      },
      {
      name: 1,
      slug: 1,
      profileImage: 1,
      onboarding: 1,
    })
      .limit(limit)
      .lean();

    const resolveRestaurantName = (r) =>
      r?.onboarding?.step1?.restaurantName || r?.name || null;

    const restaurantsOut = restaurants.map(r => ({
      id: String(r._id),
      label: resolveRestaurantName(r),
      type: 'restaurant',
      imageUrl: r?.profileImage?.url || null,
      slug: r?.slug || null,
    }));

    // Query categories (restaurant-specific defined categories)
    const categories = await RestaurantCategory.aggregate([
      {
        $match: {
          ...(rx ? { name: { $regex: rx } } : {}),
          isActive: true,
          ...(allowedRestaurantIds
            ? { restaurant: { $in: allowedRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) } }
            : {}),
        },
      },
      { $sort: { itemCount: -1, name: 1 } },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          name: 1,
          restaurant: 1,
        },
      },
    ]);

    const categoriesOut = categories.map(c => ({
      id: String(c._id),
      label: c.name,
      type: 'category',
      restaurantId: c.restaurant ? String(c.restaurant) : null,
    }));

    // Query foods from Menu items (search both sections.items and subsections.items)
    // 1) Sections.items
    const itemsFromSections = await Menu.aggregate([
      { $match: { isActive: true, ...(allowedRestaurantIds ? { restaurant: { $in: allowedRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {}) } },
      { $unwind: '$sections' },
      { $unwind: '$sections.items' },
      ...(rx ? [{ $match: { 'sections.items.name': { $regex: rx } } }] : []),
      {
        $project: {
          _id: 0,
          restaurant: 1,
          item: '$sections.items',
        },
      },
      { $limit: limit * 2 }, // fetch extra to dedupe later
    ]);

    // 2) Sections.subsections.items
    const itemsFromSubsections = await Menu.aggregate([
      { $match: { isActive: true, ...(allowedRestaurantIds ? { restaurant: { $in: allowedRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {}) } },
      { $unwind: '$sections' },
      { $unwind: '$sections.subsections' },
      { $unwind: '$sections.subsections.items' },
      ...(rx ? [{ $match: { 'sections.subsections.items.name': { $regex: rx } } }] : []),
      {
        $project: {
          _id: 0,
          restaurant: 1,
          item: '$sections.subsections.items',
        },
      },
      { $limit: limit * 2 },
    ]);

    const foodsCombined = [...itemsFromSections, ...itemsFromSubsections];
    // Dedupe by lowercased name + restaurant
    const uniqueFoodMap = new Map();
    for (const rec of foodsCombined) {
      const name = (rec?.item?.name || '').trim();
      if (!name) continue;
      const key = `${String(rec.restaurant)}::${name.toLowerCase()}`;
      if (!uniqueFoodMap.has(key)) {
        uniqueFoodMap.set(key, rec);
      }
    }
    const dedupedFoods = Array.from(uniqueFoodMap.values()).slice(0, limit * 2);

    // Enrich foods with restaurant meta (name, slug, image)
    const restaurantIds = Array.from(
      new Set(dedupedFoods.map(f => String(f.restaurant)).filter(Boolean))
    );
    const rMeta = await Restaurant.find(
      {
        _id: { $in: restaurantIds.map(id => new mongoose.Types.ObjectId(id)) },
        isActive: true,
        isAcceptingOrders: true,
        approvedAt: { $exists: true, $ne: null },
        ...(allowedRestaurantIds ? { _id: { $in: allowedRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {}),
      },
      { name: 1, slug: 1, profileImage: 1, onboarding: 1, isActive: 1, isAcceptingOrders: 1 }
    ).lean();
    const rMetaById = new Map(rMeta.map(r => [String(r._id), r]));

    const foodsOut = dedupedFoods
      .map((f) => {
        const r = rMetaById.get(String(f.restaurant));
        if (!r || r.isActive !== true || r.isAcceptingOrders !== true) return null;
        return {
          id: String(f.item?.id || ''),
          label: String(f.item?.name || '').trim(),
          type: 'food',
          restaurantId: f.restaurant ? String(f.restaurant) : null,
          restaurantName: resolveRestaurantName(r),
          restaurantSlug: r?.slug || null,
          imageUrl:
            (Array.isArray(f.item?.images) && f.item.images[0]) ||
            f.item?.image ||
            null,
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    return res.status(200).json({
      success: true,
      data: {
        foods: foodsOut,
        restaurants: restaurantsOut,
        categories: categoriesOut,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Legacy endpoint returning foods only, matching current frontend `/menu/search`
 * GET /api/menu/search?q=<term>&limit=24
 */
export async function legacyMenuSearch(req, res, next) {
  try {
    const qNorm = getNormalizedQuery(req.query.q || req.query.query || '');
    const limit = Math.min(Math.max(parseInt(req.query.limit || '24', 10) || 24, 1), 100);
    const zoneIdRaw = req.query.zoneId || req.query.zone || null;
    if (!qNorm) {
      return res.status(200).json({ success: true, items: [] });
    }
    const rx = buildSafeRegexContains(qNorm);

    let allowedRestaurantIds = null;
    if (zoneIdRaw) {
      const zoneId = String(zoneIdRaw).trim();
      const zoneCandidates = [
        mongoose.Types.ObjectId.isValid(zoneId) ? new mongoose.Types.ObjectId(zoneId) : null,
        zoneId,
      ].filter(Boolean);
      const inZoneRestaurants = await Restaurant.find(
        { zoneId: { $in: zoneCandidates }, isActive: true, isAcceptingOrders: true, approvedAt: { $exists: true, $ne: null } },
        { _id: 1 }
      ).lean();
      allowedRestaurantIds = inZoneRestaurants.map((r) => new mongoose.Types.ObjectId(String(r._id)));
      if (!allowedRestaurantIds.length) {
        return res.status(200).json({ success: true, items: [] });
      }
    }

    // Search both sections.items and subsections.items
    const fromSections = await Menu.aggregate([
      { $match: { isActive: true, ...(allowedRestaurantIds ? { restaurant: { $in: allowedRestaurantIds } } : {}) } },
      { $unwind: '$sections' },
      { $unwind: '$sections.items' },
      ...(rx ? [{ $match: { 'sections.items.name': { $regex: rx } } }] : []),
      {
        $project: {
          _id: 0,
          restaurant: 1,
          item: '$sections.items',
        },
      },
      { $limit: limit * 2 },
    ]);

    const fromSubsections = await Menu.aggregate([
      { $match: { isActive: true, ...(allowedRestaurantIds ? { restaurant: { $in: allowedRestaurantIds } } : {}) } },
      { $unwind: '$sections' },
      { $unwind: '$sections.subsections' },
      { $unwind: '$sections.subsections.items' },
      ...(rx ? [{ $match: { 'sections.subsections.items.name': { $regex: rx } } }] : []),
      {
        $project: {
          _id: 0,
          restaurant: 1,
          item: '$sections.subsections.items',
        },
      },
      { $limit: limit * 2 },
    ]);

    const combined = [...fromSections, ...fromSubsections];
    const seen = new Map();
    const unique = [];
    for (const rec of combined) {
      const name = (rec?.item?.name || '').trim();
      if (!name) continue;
      const key = `${String(rec.restaurant)}::${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.set(key, true);
      unique.push({
        id: rec.item?.id || undefined,
        name,
        image: (Array.isArray(rec.item?.images) && rec.item.images[0]) || rec.item?.image || null,
        restaurantId: rec.restaurant ? String(rec.restaurant) : null,
      });
      if (unique.length >= limit * 2) break;
    }

    const uniqueRestaurantIds = Array.from(
      new Set(unique.map((x) => x.restaurantId).filter(Boolean))
    );
    const allowedRestaurants = await Restaurant.find(
      {
        _id: { $in: uniqueRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isActive: true,
        isAcceptingOrders: true,
        approvedAt: { $exists: true, $ne: null },
      },
      { _id: 1 }
    ).lean();
    const allowedSet = new Set(allowedRestaurants.map((r) => String(r._id)));

    const out = unique
      .filter((x) => x.restaurantId && allowedSet.has(String(x.restaurantId)))
      .slice(0, limit);

    return res.status(200).json({
      success: true,
      data: { items: out },
    });
  } catch (error) {
    next(error);
  }
}

