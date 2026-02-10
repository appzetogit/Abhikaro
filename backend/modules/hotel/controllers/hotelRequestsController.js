import { successResponse, errorResponse } from "../../../shared/utils/response.js";

/**
 * Hotel Requests Controller
 *
 * NOTE: Backend order-request model/service isn't implemented in this repo yet.
 * For now we return empty arrays and zero stats so frontend pages work end-to-end
 * without 404s. Later we can wire this to a real model (e.g. HotelRequest/Order).
 */

export const getHotelRequests = async (req, res) => {
  try {
    // Future: read req.query.status, pagination, etc. and query DB
    return successResponse(res, 200, "Requests fetched successfully", {
      requests: [],
    });
  } catch (err) {
    return errorResponse(res, 500, err.message || "Failed to fetch requests");
  }
};

export const getHotelRequestStats = async (req, res) => {
  try {
    return successResponse(res, 200, "Request stats fetched successfully", {
      totalRequests: 0,
      pendingRequests: 0,
      completedRequests: 0,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message || "Failed to fetch request stats");
  }
};

export const getHotelRequestById = async (req, res) => {
  try {
    // Future: fetch by id and ensure it belongs to req.hotel._id
    return errorResponse(res, 404, "Request not found");
  } catch (err) {
    return errorResponse(res, 500, err.message || "Failed to fetch request");
  }
};

