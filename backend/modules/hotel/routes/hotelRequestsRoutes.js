import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import {
  getHotelRequests,
  getHotelRequestStats,
  getHotelRequestById,
} from "../controllers/hotelRequestsController.js";

const router = express.Router();

// All request routes are protected
router.get("/stats", authenticate, getHotelRequestStats);
router.get("/", authenticate, getHotelRequests);
router.get("/:id", authenticate, getHotelRequestById);

export default router;

