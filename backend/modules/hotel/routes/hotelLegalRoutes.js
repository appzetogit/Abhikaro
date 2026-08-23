import express from "express";
import {
  getHotelTermsAcceptanceStatus,
  acceptHotelTerms,
} from "../controllers/hotelLegalController.js";

const router = express.Router();

// Authenticated hotel legal routes
router.get("/terms-status", getHotelTermsAcceptanceStatus);
router.post("/accept-terms", acceptHotelTerms);

export default router;
