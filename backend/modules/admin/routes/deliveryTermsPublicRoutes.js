import express from "express";
import { getDeliveryTermsPublic } from "../controllers/deliveryTermsAndConditionController.js";

const router = express.Router();

// Public route for Delivery Terms and Conditions
router.get("/delivery-terms/public", getDeliveryTermsPublic);

export default router;

