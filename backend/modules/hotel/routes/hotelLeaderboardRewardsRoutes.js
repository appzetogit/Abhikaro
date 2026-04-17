import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import { getHotelLeaderboardRewards } from "../controllers/hotelLeaderboardRewardsController.js";

const router = express.Router();

// GET /api/hotel/leaderboard-rewards
router.get("/", authenticate, getHotelLeaderboardRewards);

export default router;

