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

    // Validate userId exists
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

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
      // Handle both populated and non-populated deliveryPartnerId
      receiverId = order.deliveryPartnerId?._id || order.deliveryPartnerId;
      receiverType = "delivery";
      
      // Validate receiverId exists
      if (!receiverId) {
        return res.status(400).json({
          success: false,
          message: "Invalid delivery partner ID",
        });
      }
    } else {
      // Delivery boy is sending, receiver is user
      // Handle both populated and non-populated userId
      receiverId = order.userId?._id || order.userId;
      receiverType = "user";
      
      // Validate receiverId exists
      if (!receiverId) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }
    }

    // Validate all required fields before creating chat message
    if (!orderMongoId || !userId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for chat message",
        details: {
          hasOrderMongoId: !!orderMongoId,
          hasUserId: !!userId,
          hasReceiverId: !!receiverId
        }
      });
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

    // Emit real-time message via Socket.IO IMMEDIATELY (before HTTP response)
    // This ensures instant delivery via WebSocket
    const io = getIO();
    if (io) {
      // Use both MongoDB _id and string orderId for compatibility
      const orderMongoIdStr = orderMongoId.toString();
      const orderIdStr = order.orderId;
      const receiverIdStr = receiverId.toString();
      
      // Prepare message data for emission
      const messageData = {
        message: populatedMessage,
        orderId: orderMongoIdStr,
        orderIdString: orderIdStr,
        timestamp: Date.now()
      };
      
      console.log("📤 Emitting message to Socket.IO rooms (INSTANT):", {
        orderMongoIdStr,
        orderIdStr,
        receiverType,
        receiverId: receiverIdStr,
        senderType: userType,
        senderId: userId.toString()
      });
      
      // Emit to MongoDB _id room (primary room) - both user and delivery boy are here
      io.to(`order:${orderMongoIdStr}`).emit("new-message", messageData);
      console.log(`✅ Emitted to order:${orderMongoIdStr}`);
      
      // Also emit to string orderId room if different (for compatibility)
      if (orderIdStr && orderIdStr !== orderMongoIdStr) {
        io.to(`order:${orderIdStr}`).emit("new-message", messageData);
        console.log(`✅ Also emitted to order:${orderIdStr}`);
      }

      // Emit to specific receiver room (direct delivery for instant notification)
      if (receiverType === "user") {
        io.to(`user:${receiverIdStr}`).emit("new-message", messageData);
        console.log(`✅ Also emitted to user:${receiverIdStr}`);
      } else {
        io.to(`delivery:${receiverIdStr}`).emit("new-message", messageData);
        console.log(`✅ Also emitted to delivery:${receiverIdStr}`);
      }

      // Also emit to sender's own room (for confirmation)
      if (userType === "user") {
        const senderIdStr = userId.toString();
        io.to(`user:${senderIdStr}`).emit("message-sent", messageData);
      } else {
        const senderIdStr = userId.toString();
        io.to(`delivery:${senderIdStr}`).emit("message-sent", messageData);
      }
    } else {
      console.error("❌ Socket.IO instance not available");
    }

    // Return the created message in response (after WebSocket emission for instant delivery)
    res.status(201).json({
      success: true,
      data: {
        message: populatedMessage,
        orderId: orderMongoId.toString(),
      },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    console.error("Error stack:", error.stack);
    console.error("Request details:", {
      orderId: req.body?.orderId,
      message: req.body?.message?.substring(0, 50),
      userId: req.user?._id || req.delivery?._id || req.user?.id || req.delivery?.id,
      userType: req.user ? "user" : "delivery",
      hasUser: !!req.user,
      hasDelivery: !!req.delivery
    });
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
