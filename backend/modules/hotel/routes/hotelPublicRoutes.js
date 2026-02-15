import express from "express";
import {
  getHotelByHotelId,
  getAllHotels,
} from "../controllers/hotelPublicController.js";
import { getHotelByQR } from "../controllers/hotelQRController.js";

const router = express.Router();

// Public routes - no authentication required
router.get("/all", getAllHotels);
router.get("/qr/:hotelRef", getHotelByQR);
router.get("/:hotelId", getHotelByHotelId);

export default router;
