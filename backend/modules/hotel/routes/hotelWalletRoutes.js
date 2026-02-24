import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import {
  getHotelWallet,
  createHotelWithdrawalRequest,
} from "../controllers/hotelWalletController.js";

const router = express.Router();

// Wallet routes (protected)
router.get("/", authenticate, getHotelWallet);
router.post("/withdraw", authenticate, createHotelWithdrawalRequest);

export default router;
