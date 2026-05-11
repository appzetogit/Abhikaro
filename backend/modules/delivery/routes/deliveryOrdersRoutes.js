import express from "express";
import {
  getOrders,
  getAvailableOrders,
  getOrderDetails,
  rejectOrder,
  acceptOrder,
  confirmReachedPickup,
  confirmOrderId,
  confirmReachedDrop,
  completeDelivery,
  markHotelCashSettled,
} from "../controllers/deliveryOrdersController.js";
import { getTripHistory } from "../controllers/deliveryTripHistoryController.js";
import { authenticate } from "../middleware/deliveryAuth.js";

const router = express.Router();

// Orders routes
router.get("/available-orders", authenticate, getAvailableOrders);
router.get("/orders", authenticate, getOrders);
router.get("/orders/:orderId", authenticate, getOrderDetails);
router.patch("/orders/:orderId/reject", authenticate, rejectOrder);
router.patch("/orders/:orderId/accept", authenticate, acceptOrder);
router.patch("/orders/:orderId/reached-pickup", authenticate, confirmReachedPickup);
router.patch("/orders/:orderId/confirm-order-id", authenticate, confirmOrderId);
router.patch("/orders/:orderId/reached-drop", authenticate, confirmReachedDrop);
router.patch("/orders/:orderId/complete-delivery", authenticate, completeDelivery);
router.patch("/orders/:orderId/hotel-cash-settled", authenticate, markHotelCashSettled);

// Trip History route
router.get("/trip-history", authenticate, getTripHistory);

export default router;
