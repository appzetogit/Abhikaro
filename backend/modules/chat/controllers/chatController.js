import Chat from "../models/Chat.js";
import Order from "../../order/models/Order.js";
import { getIO } from "../../../server.js";
import mongoose from "mongoose";

// Get chat messages for an order
export const getChatMessages = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id || req.delivery?._id || req.user?.id || req.delivery?.id;
    const userType = req.user ? "user" : "delivery";

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Find order by MongoDB _id or custom orderId string
    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findById(orderId).lean();
    }
    if (!order) {
      order = await Order.findOne({ orderId: orderId }).lean();
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Use MongoDB _id for order reference
    const orderMongoId = order._id;

    // Check if user/delivery boy is associated with this order
    const userIdStr = userId?.toString();
    if (userType === "user" && order.userId.toString() !== userIdStr) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this order",
      });
    }

    if (userType === "delivery" && order.deliveryPartnerId?.toString() !== userIdStr) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this order",
      });
    }

    // Get all messages for this order (use MongoDB _id)
    const messages = await Chat.find({ orderId: orderMongoId })
      .sort({ createdAt: 1 })
      .lean();

    // Mark messages as read for the current user
    const unreadMessageIds = messages
      .filter(
        (msg) =>
          msg.receiverId.toString() === userId &&
          msg.receiverType === userType &&
          !msg.isRead
      )
      .map((msg) => msg._id);

    if (unreadMessageIds.length > 0) {
      await Chat.updateMany(
        { _id: { $in: unreadMessageIds } },
        { isRead: true, readAt: new Date() }
      );
    }

    res.status(200).json({
      success: true,
      data: {
        messages,
        orderId: orderMongoId.toString(),
        orderIdString: order.orderId,
      },
    });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Send a chat message
export const sendMessage = async (req, res) => {
  try {
    const { orderId, message } = req.body;
    const userId = req.user?._id || req.delivery?._id || req.user?.id || req.delivery?.id;
    const userType = req.user ? "user" : "delivery";

    if (!orderId || !message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Order ID and message are required",
      });
    }

    // Find order by MongoDB _id or custom orderId string
    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findById(orderId)
        .populate("userId", "name phone")
        .populate("deliveryPartnerId", "name phone")
        .lean();
    }
    if (!order) {
      order = await Order.findOne({ orderId: orderId })
        .populate("userId", "name phone")
        .populate("deliveryPartnerId", "name phone")
        .lean();
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Use MongoDB _id for order reference
    const orderMongoId = order._id;

    // Determine receiver
    let receiverId, receiverType;
    if (userType === "user") {
      // User is sending, receiver is delivery boy
      if (!order.deliveryPartnerId) {
        return res.status(400).json({
          success: false,
          message: "No delivery partner assigned to this order",
        });
      }
      receiverId = order.deliveryPartnerId._id || order.deliveryPartnerId;
      receiverType = "delivery";
    } else {
      // Delivery boy is sending, receiver is user
      receiverId = order.userId._id || order.userId;
      receiverType = "user";
    }

    // Create chat message (use MongoDB _id for orderId)
    const chatMessage = new Chat({
      orderId: orderMongoId,
      senderId: userId,
      senderType: userType,
      receiverId,
      receiverType,
      message: message.trim(),
      isRead: false,
    });

    await chatMessage.save();

    // Populate sender info for real-time emission
    const populatedMessage = await Chat.findById(chatMessage._id).lean();

    // Return the created message in response
    res.status(201).json({
      success: true,
      data: {
        message: populatedMessage,
        orderId: orderMongoId.toString(),
      },
    });

    // Emit real-time message via Socket.IO
    const io = getIO();
    if (io) {
      // Emit to order room (both user and delivery boy are in this room)
      // Use both MongoDB _id and string orderId for compatibility
      const orderMongoIdStr = orderMongoId.toString();
      const orderIdStr = order.orderId;
      
      console.log("📤 Emitting message to Socket.IO rooms:", {
        orderMongoIdStr,
        orderIdStr,
        receiverType,
        receiverId: receiverId.toString()
      });
      
      // Emit to MongoDB _id room (primary room)
      io.to(`order:${orderMongoIdStr}`).emit("new-message", {
        message: populatedMessage,
        orderId: orderMongoIdStr,
      });
      console.log(`✅ Emitted to order:${orderMongoIdStr}`);
      
      // Also emit to string orderId room if different (for compatibility)
      if (orderIdStr && orderIdStr !== orderMongoIdStr) {
        io.to(`order:${orderIdStr}`).emit("new-message", {
          message: populatedMessage,
          orderId: orderMongoIdStr, // Keep MongoDB _id in response
        });
        console.log(`✅ Also emitted to order:${orderIdStr}`);
      }

      // Also emit to specific receiver room (fallback for direct delivery)
      const receiverIdStr = receiverId.toString();
      if (receiverType === "user") {
        io.to(`user:${receiverIdStr}`).emit("new-message", {
          message: populatedMessage,
          orderId: orderMongoIdStr,
        });
        console.log(`✅ Also emitted to user:${receiverIdStr}`);
      } else {
        io.to(`delivery:${receiverIdStr}`).emit("new-message", {
          message: populatedMessage,
          orderId: orderMongoIdStr,
        });
        console.log(`✅ Also emitted to delivery:${receiverIdStr}`);
      }
    } else {
      console.error("❌ Socket.IO instance not available");
    }
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Mark messages as read
export const markAsRead = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id || req.delivery?._id || req.user?.id || req.delivery?.id;
    const userType = req.user ? "user" : "delivery";

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Find order by MongoDB _id or custom orderId string
    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findById(orderId).lean();
    }
    if (!order) {
      order = await Order.findOne({ orderId: orderId }).lean();
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Use MongoDB _id for order reference
    const orderMongoId = order._id;

    // Mark all unread messages as read
    await Chat.updateMany(
      {
        orderId: orderMongoId,
        receiverId: userId,
        receiverType: userType,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.status(200).json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
