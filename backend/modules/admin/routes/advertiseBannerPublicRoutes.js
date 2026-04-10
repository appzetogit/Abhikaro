import express from "express";
import { redisCache } from "../../../shared/middleware/cacheMiddleware.js";
import { getPublicAdvertiseBanner } from "../controllers/advertiseBannersController.js";

const router = express.Router();

// Public route (cached)
router.get("/advertise-banners/public", redisCache({ ttl: 60 }), getPublicAdvertiseBanner);

export default router;

