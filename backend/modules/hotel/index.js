// Hotel module
import express from "express";
import { authenticate } from "./middleware/hotelAuth.js";
import hotelAuthRoutes from "./routes/hotelAuthRoutes.js";
import hotelRequestsRoutes from "./routes/hotelRequestsRoutes.js";
import hotelProfileRoutes from "./routes/hotelProfileRoutes.js";
import hotelWalletRoutes from "./routes/hotelWalletRoutes.js";
import hotelPublicRoutes from "./routes/hotelPublicRoutes.js";
import hotelQRRoutes from "./routes/hotelQRRoutes.js";
import hotelOrderRoutes from "./routes/hotelOrderRoutes.js";
import hotelLeaderboardRoutes from "./routes/hotelLeaderboardRoutes.js";
import hotelLeaderboardRewardsRoutes from "./routes/hotelLeaderboardRewardsRoutes.js";
import hotelLeaderboardHistoryRoutes from "./routes/hotelLeaderboardHistoryRoutes.js";
import hotelLegalRoutes from "./routes/hotelLegalRoutes.js";

const router = express.Router();

// Auth routes (public and protected)
router.use("/auth", hotelAuthRoutes);

// Public routes (no authentication required)
router.use("/public", hotelPublicRoutes);

// Legal routes (require authentication)
router.use("/legal", authenticate, hotelLegalRoutes);

// Protected routes (require authentication)
router.use("/requests", hotelRequestsRoutes);
router.use("/profile", hotelProfileRoutes);
router.use("/wallet", hotelWalletRoutes);
router.use("/qr", hotelQRRoutes);
router.use("/orders", hotelOrderRoutes);
router.use("/leaderboard", hotelLeaderboardRoutes);
router.use("/leaderboard-rewards", hotelLeaderboardRewardsRoutes);
router.use("/leaderboard-history", hotelLeaderboardHistoryRoutes);

export default router;
