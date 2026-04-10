import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import AdvertiseBanner from "../models/AdvertiseBanner.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../../../shared/utils/cloudinaryService.js";

function isWithinWindow(banner, now = new Date()) {
  if (!banner) return false;
  if (!banner.isActive) return false;
  if (banner.startAt && now < new Date(banner.startAt)) return false;
  if (banner.endAt && now > new Date(banner.endAt)) return false;
  return true;
}

function parseDateOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/**
 * Public: Get active banner (first match by order)
 * GET /api/advertise-banners/public?placement=order_placed
 */
export const getPublicAdvertiseBanner = asyncHandler(async (req, res) => {
  const placement = (req.query.placement || "order_placed").toString();
  if (!["order_placed"].includes(placement)) {
    return successResponse(res, 200, "No active banner", { banner: null });
  }

  const now = new Date();
  const banners = await AdvertiseBanner.find({ placement, isActive: true })
    .sort({ order: 1, updatedAt: -1 })
    .lean();

  const banner = banners.find((b) => isWithinWindow(b, now)) || null;
  if (!banner) {
    return successResponse(res, 200, "No active banner", { banner: null });
  }

  return successResponse(res, 200, "Advertise banner", {
    banner: {
      _id: banner._id,
      placement: banner.placement,
      imageUrl: banner.imageUrl || null,
      startAt: banner.startAt || null,
      endAt: banner.endAt || null,
      isActive: !!banner.isActive,
      order: banner.order || 0,
      updatedAt: banner.updatedAt || null,
    },
  });
});

/**
 * Admin: List banners
 * GET /api/admin/advertise-banners?placement=order_placed
 */
export const listAdminAdvertiseBanners = asyncHandler(async (req, res) => {
  const placement = (req.query.placement || "order_placed").toString();
  if (!["order_placed"].includes(placement)) {
    return errorResponse(res, 400, "Invalid placement");
  }

  const banners = await AdvertiseBanner.find({ placement })
    .sort({ order: 1, createdAt: -1 })
    .lean();

  return successResponse(res, 200, "Advertise banners", { banners });
});

/**
 * Admin: Create banner
 * POST /api/admin/advertise-banners
 * multipart/form-data: placement, order?, isActive?, startAt?, endAt?, image (required)
 */
export const createAdminAdvertiseBanner = asyncHandler(async (req, res) => {
  const placement = (req.body.placement || "order_placed").toString();
  if (!["order_placed"].includes(placement)) {
    return errorResponse(res, 400, "Invalid placement");
  }

  if (!req.file?.buffer) {
    return errorResponse(res, 400, "Banner image is required");
  }

  const startAt = parseDateOrNull(req.body.startAt);
  const endAt = parseDateOrNull(req.body.endAt);
  if (startAt === "invalid") return errorResponse(res, 400, "Invalid startAt");
  if (endAt === "invalid") return errorResponse(res, 400, "Invalid endAt");
  if (startAt && endAt && startAt > endAt) {
    return errorResponse(res, 400, "startAt cannot be after endAt");
  }

  const isActive =
    req.body.isActive === true ||
    req.body.isActive === "true" ||
    req.body.isActive === 1 ||
    req.body.isActive === "1";

  const orderRaw = req.body.order;
  const order = orderRaw == null || orderRaw === "" ? 0 : Number(orderRaw);
  const safeOrder = Number.isFinite(order) ? order : 0;

  const upload = await uploadToCloudinary(req.file.buffer, {
    folder: "advertise-banners",
    resource_type: "image",
  });

  const created = await AdvertiseBanner.create({
    placement,
    order: safeOrder,
    isActive,
    startAt: startAt || null,
    endAt: endAt || null,
    imageUrl: upload.secure_url,
    cloudinaryPublicId: upload.public_id,
    updatedBy: req.admin?._id || null,
  });

  return successResponse(res, 201, "Advertise banner created", { banner: created });
});

/**
 * Admin: Update banner fields, optionally replace image
 * PATCH /api/admin/advertise-banners/:id
 * multipart/form-data optional: order, isActive, startAt, endAt, image
 */
export const updateAdminAdvertiseBanner = asyncHandler(async (req, res) => {
  const id = req.params.id?.toString();
  const existing = await AdvertiseBanner.findById(id);
  if (!existing) return errorResponse(res, 404, "Banner not found");

  const startAt = parseDateOrNull(req.body.startAt);
  const endAt = parseDateOrNull(req.body.endAt);
  if (startAt === "invalid") return errorResponse(res, 400, "Invalid startAt");
  if (endAt === "invalid") return errorResponse(res, 400, "Invalid endAt");
  const nextStartAt = startAt === null ? null : startAt;
  const nextEndAt = endAt === null ? null : endAt;
  if (nextStartAt && nextEndAt && nextStartAt > nextEndAt) {
    return errorResponse(res, 400, "startAt cannot be after endAt");
  }

  if (req.body.isActive != null) {
    existing.isActive =
      req.body.isActive === true ||
      req.body.isActive === "true" ||
      req.body.isActive === 1 ||
      req.body.isActive === "1";
  }

  if (req.body.order != null && String(req.body.order).trim() !== "") {
    const n = Number(req.body.order);
    existing.order = Number.isFinite(n) ? n : existing.order;
  }

  if (req.body.startAt != null) existing.startAt = nextStartAt;
  if (req.body.endAt != null) existing.endAt = nextEndAt;

  if (req.file?.buffer) {
    const upload = await uploadToCloudinary(req.file.buffer, {
      folder: "advertise-banners",
      resource_type: "image",
    });
    const oldPublicId = existing.cloudinaryPublicId;
    existing.imageUrl = upload.secure_url;
    existing.cloudinaryPublicId = upload.public_id;
    if (oldPublicId && oldPublicId !== existing.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(oldPublicId);
      } catch (e) {
        console.warn("⚠️ Failed deleting old banner image:", e?.message || e);
      }
    }
  }

  existing.updatedBy = req.admin?._id || null;
  await existing.save();

  return successResponse(res, 200, "Advertise banner updated", { banner: existing });
});

/**
 * Admin: Delete banner
 * DELETE /api/admin/advertise-banners/:id
 */
export const deleteAdminAdvertiseBanner = asyncHandler(async (req, res) => {
  const id = req.params.id?.toString();
  const existing = await AdvertiseBanner.findById(id);
  if (!existing) return errorResponse(res, 404, "Banner not found");

  const publicId = existing.cloudinaryPublicId;
  await existing.deleteOne();

  if (publicId) {
    try {
      await deleteFromCloudinary(publicId);
    } catch (e) {
      console.warn("⚠️ Failed deleting banner image:", e?.message || e);
    }
  }

  return successResponse(res, 200, "Advertise banner deleted", { deleted: true });
});

/**
 * Admin: Toggle active status
 * PATCH /api/admin/advertise-banners/:id/status
 */
export const toggleAdminAdvertiseBannerStatus = asyncHandler(async (req, res) => {
  const id = req.params.id?.toString();
  const existing = await AdvertiseBanner.findById(id);
  if (!existing) return errorResponse(res, 404, "Banner not found");

  existing.isActive = !existing.isActive;
  existing.updatedBy = req.admin?._id || null;
  await existing.save();

  return successResponse(res, 200, "Status updated", { banner: existing });
});

