import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import { getHotelLeaderboardHistory } from "../controllers/hotelLeaderboardHistoryController.js";

const router = express.Router();

// GET /api/hotel/leaderboard-history?key=YYYY-MM
router.get("/", authenticate, getHotelLeaderboardHistory);

export default router;

