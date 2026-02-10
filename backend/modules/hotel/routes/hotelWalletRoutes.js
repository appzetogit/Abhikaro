import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import { getHotelWallet } from "../controllers/hotelWalletController.js";

const router = express.Router();

// Wallet routes (protected)
router.get("/", authenticate, getHotelWallet);

export default router;

