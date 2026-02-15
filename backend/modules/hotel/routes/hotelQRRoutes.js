import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import {
  generateHotelQR,
  getHotelQR,
} from "../controllers/hotelQRController.js";

const router = express.Router();

// Protected routes (require hotel authentication)
router.post("/generate", authenticate, generateHotelQR);
router.get("/", authenticate, getHotelQR);

export default router;
