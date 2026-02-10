import express from "express";
import Joi from "joi";
import { validate } from "../../../shared/middleware/validate.js";
import { authenticate } from "../middleware/hotelAuth.js";
import {
  getHotelProfile,
  updateHotelProfile,
  getHotelQRCode,
} from "../controllers/hotelProfileController.js";

const router = express.Router();

const imageSchema = Joi.object({
  url: Joi.string().uri().required(),
  publicId: Joi.string().optional(),
}).unknown(true);

const updateProfileSchema = Joi.object({
  hotelName: Joi.string().min(2).max(120).optional(),
  email: Joi.string().email().optional(),
  address: Joi.string().min(2).max(500).optional(),
  profileImage: imageSchema.optional().allow(null),
  isActive: Joi.boolean().optional(),

  // Keep these optional to support editing docs later
  aadharCardImage: imageSchema.optional().allow(null),
  hotelRentProofImage: imageSchema.optional().allow(null),
  cancelledCheckImages: Joi.array().items(imageSchema).optional(),
});

router.get("/", authenticate, getHotelProfile);
router.put("/", authenticate, validate(updateProfileSchema), updateHotelProfile);
router.get("/qr-code", authenticate, getHotelQRCode);

export default router;

