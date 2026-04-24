import express from "express";
import { getDeliveryPrivacyPublic } from "../controllers/deliveryPrivacyPolicyController.js";

const router = express.Router();

// Public route for Delivery Privacy Policy
router.get("/delivery-privacy/public", getDeliveryPrivacyPublic);

export default router;

