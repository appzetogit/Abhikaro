import express from "express";
import { authenticate } from "../middleware/hotelAuth.js";
import {
  getHotelOrders,
  getOrderDetails,
  acceptOrder,
  rejectOrder,
  getOrderStats,
  collectPayment,
  getSettlementSummary,
  markOrderAsDelivered,
} from "../controllers/hotelOrdersController.js";

const router = express.Router();

// All routes require hotel authentication
router.get("/", authenticate, getHotelOrders);
router.get("/stats", authenticate, getOrderStats);
router.get("/settlement-summary", authenticate, getSettlementSummary);
router.get("/:orderId", authenticate, getOrderDetails);
router.post("/:orderId/accept", authenticate, acceptOrder);
router.post("/:orderId/reject", authenticate, rejectOrder);
router.post("/:orderId/collect-payment", authenticate, collectPayment);
router.post("/:orderId/deliver", authenticate, markOrderAsDelivered);

export default router;
