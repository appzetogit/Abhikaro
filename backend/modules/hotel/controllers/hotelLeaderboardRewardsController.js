import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse } from "../../../shared/utils/response.js";
import HotelLeaderboardRewards from "../../admin/models/HotelLeaderboardRewards.js";

function normalizeGifts(input, allowedPositions) {
  const map = new Map();
  (Array.isArray(input) ? input : []).forEach((g) => {
    const pos = Number(g?.position);
    if (!allowedPositions.includes(pos)) return;
    map.set(pos, {
      position: pos,
      name: typeof g?.name === "string" ? g.name.trim() : "",
      image: {
        url: typeof g?.image?.url === "string" ? g.image.url : "",
        publicId: typeof g?.image?.publicId === "string" ? g.image.publicId : "",
      },
    });
  });
  return allowedPositions.map((pos) => map.get(pos) || { position: pos, name: "", image: { url: "", publicId: "" } });
}

function normalizeDiscounts(input, allowedPositions) {
  const map = new Map();
  (Array.isArray(input) ? input : []).forEach((d) => {
    const pos = Number(d?.position);
    if (!allowedPositions.includes(pos)) return;
    const amt = Number(d?.rupeesOff);
    map.set(pos, {
      position: pos,
      rupeesOff: Number.isFinite(amt) && amt > 0 ? amt : 0,
    });
  });
  return allowedPositions.map((pos) => map.get(pos) || { position: pos, rupeesOff: 0 });
}

function normalizeBanner(input) {
  return {
    url: typeof input?.url === "string" ? input.url : "",
    publicId: typeof input?.publicId === "string" ? input.publicId : "",
  };
}

function normalizeBanners(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  arr.forEach((b) => {
    const url = typeof b?.url === "string" ? b.url : "";
    if (!url.trim()) return;
    out.push({
      url,
      publicId: typeof b?.publicId === "string" ? b.publicId : "",
    });
  });
  return out;
}

/**
 * Get leaderboard rewards configuration (hotel app, read-only)
 * GET /api/hotel/leaderboard-rewards
 * @access Private (Hotel Admin)
 */
export const getHotelLeaderboardRewards = asyncHandler(async (req, res) => {
  const doc = await HotelLeaderboardRewards.getSettings();
  const payload = doc?.toObject ? doc.toObject() : doc;

  const normalized = {
    banners: normalizeBanners(payload?.banners?.length ? payload.banners : (payload?.banner?.url ? [payload.banner] : [])),
    monthly: {
      gifts: normalizeGifts(payload?.monthly?.gifts, [1, 2, 3, 4, 5]),
      discounts: normalizeDiscounts(payload?.monthly?.discounts, [6, 7, 8, 9, 10]),
    },
    sixMonths: {
      gifts: normalizeGifts(payload?.sixMonths?.gifts, [1, 2, 3]),
    },
    updatedAt: payload?.updatedAt || null,
  };

  return successResponse(res, 200, "Hotel leaderboard rewards fetched successfully", normalized);
});

