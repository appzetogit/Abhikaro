import express from "express";
import {
  getActivePublicPromoCodes,
  validatePromoCode,
} from "../controllers/promoCodeController.js";

const router = express.Router();

// Public / User routes
router.get("/promo-codes/public/active", getActivePublicPromoCodes);
router.post("/promo-codes/validate", validatePromoCode);

export default router;
