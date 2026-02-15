import express from "express";
import {
  getChatMessages,
  sendMessage,
  markAsRead,
} from "../controllers/chatController.js";
import jwtService from "../../auth/services/jwtService.js";
import User from "../../auth/models/User.js";
import Delivery from "../../delivery/models/Delivery.js";
import { errorResponse } from "../../../shared/utils/response.js";

const router = express.Router();

// Middleware to handle both user and delivery authentication
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, 401, "No token provided");
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Check if it's a delivery token
    if (decoded.role === "delivery") {
      const delivery = await Delivery.findById(decoded.userId).select("-password -refreshToken");
      
      if (!delivery) {
        return errorResponse(res, 401, "Delivery boy not found");
      }

      if (!delivery.isActive && delivery.status !== "blocked" && delivery.status !== "pending") {
        return errorResponse(res, 401, "Delivery boy account is inactive");
      }

      // Attach delivery to request
      req.delivery = delivery;
      req.token = decoded;
      return next();
    }

    // Otherwise, treat as user token
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return errorResponse(res, 401, "User not found");
    }

    if (!user.isActive) {
      return errorResponse(res, 401, "User account is inactive");
    }

    // Attach user to request
    req.user = user;
    req.token = decoded;
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || "Invalid token");
  }
};

// Get chat messages for an order (both user and delivery can access)
router.get("/order/:orderId", authMiddleware, getChatMessages);

// Send a message (both user and delivery can send)
router.post("/send", authMiddleware, sendMessage);

// Mark messages as read
router.put("/order/:orderId/read", authMiddleware, markAsRead);

export default router;
