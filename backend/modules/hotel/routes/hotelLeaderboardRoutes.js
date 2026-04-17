import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import { getHotelLeaderboard } from "../controllers/hotelLeaderboardController.js";

const router = express.Router();

// GET /api/hotel/leaderboard?period=month|6months
router.get("/", authenticate, getHotelLeaderboard);

export default router;

