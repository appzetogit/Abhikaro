import express from "express";
import { getHotelTermsPublic } from "../controllers/hotelTermsAndConditionController.js";

const router = express.Router();

// Public route for Hotel Terms and Conditions
router.get("/hotel-terms/public", getHotelTermsPublic);

export default router;

