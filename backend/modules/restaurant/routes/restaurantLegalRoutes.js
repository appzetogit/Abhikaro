import express from "express";
import {
  getTermsAcceptanceStatus,
  acceptTerms,
} from "../controllers/restaurantLegalController.js";

const router = express.Router();

// Authenticated restaurant legal routes
router.get("/terms-status", getTermsAcceptanceStatus);
router.post("/accept-terms", acceptTerms);

export default router;
