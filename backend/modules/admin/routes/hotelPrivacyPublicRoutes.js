import express from "express";
import { getHotelPrivacyPublic } from "../controllers/hotelPrivacyPolicyController.js";

const router = express.Router();

// Public route for Hotel Privacy Policy
router.get("/hotel-privacy/public", getHotelPrivacyPublic);

export default router;
