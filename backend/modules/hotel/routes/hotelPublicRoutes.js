import express from "express";
import { getHotelByHotelId } from "../controllers/hotelPublicController.js";

const router = express.Router();

// Public route - no authentication required
router.get("/:hotelId", getHotelByHotelId);

export default router;
