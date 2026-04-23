import express from "express";
import {
  getRestaurantTermsPublic,
} from "../../admin/controllers/restaurantTermsAndConditionController.js";
import {
  getRestaurantPrivacyPublic,
} from "../../admin/controllers/restaurantPrivacyPolicyController.js";

const router = express.Router();

// Public legal pages for restaurant app
router.get("/terms", getRestaurantTermsPublic);
router.get("/privacy", getRestaurantPrivacyPublic);

export default router;

