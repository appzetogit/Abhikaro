import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { chatAPI, userAPI } from "@/lib/api";
import { toast } from "sonner";
import io from "socket.io-client";
import { API_BASE_URL } from "@/lib/api/config";

export default function OrderChat() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Get socket URL from API base URL
  const socketUrl = API_BASE_URL.replace("/api", "");

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch current user ID
  useEffect(() => {
    // Try multiple sources to get user ID
    const getUserIdFromStorage = () => {
      // Try direct user_id/userId keys
      const directId = localStorage.getItem("user_id") || localStorage.getItem("userId");
      if (directId) {
        return directId.toString();
      }
      
      // Try from user_user object (from authentication)
      const userUserStr = localStorage.getItem("user_user");
      if (userUserStr) {
        try {
          const userUser = JSON.parse(userUserStr);
          const id = userUser?._id || userUser?.id;
          if (id) {
            return id.toString();
          }
        } catch (e) {
          console.error("Error parsing user_user:", e);
        }
      }
      
      // Try from userProfile
      const userProfileStr = localStorage.getItem("userProfile");
      if (userProfileStr) {
        try {
          const userProfile = JSON.parse(userProfileStr);
          const id = userProfile?._id || userProfile?.id;
          if (id) {
            return id.toString();
          }
        } catch (e) {
          console.error("Error parsing userProfile:", e);
        }
      }
      
      return null;
    };

    // Set from localStorage immediately
    const userIdFromStorage = getUserIdFromStorage();
    if (userIdFromStorage) {
      setCurrentUserId(userIdFromStorage);
      console.log("✅ User ID set from localStorage:", userIdFromStorage);
    }

    // Then try to fetch from API for more accurate ID
    const fetchUserId = async () => {
      try {
        const response = await userAPI.getProfile();
        if (response.data?.success && response.data.data) {
          const user = response.data.data.user || response.data.data;
          const id = user?._id || user?.id;
          if (id) {
            const idStr = id.toString();
            setCurrentUserId(idStr);
            console.log("✅ User ID set from API:", idStr);
          }
        }
      } catch (error) {
        console.error("Error fetching user ID from API:", error);
        // Keep the localStorage value if API fails
      }
    };
    fetchUserId();
  }, []);

  // Store MongoDB orderId for socket room joining
  const [mongoOrderId, setMongoOrderId] = useState(null);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!orderId) return;

      try {
        setLoading(true);
        const response = await chatAPI.getMessages(orderId);
        if (response.data?.success) {
          setMessages(response.data.data.messages || []);
          // Store MongoDB orderId for socket room joining
          if (response.data.data.orderId) {
            setMongoOrderId(response.data.data.orderId);
          }
        }
      } catch (error) {
        console.error("Error fetching messages:", error);
        toast.error("Failed to load messages");
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [orderId]);

  // Setup Socket.IO connection
  useEffect(() => {
    if (!orderId) return;

    // Initialize socket connection
    socketRef.current = io(socketUrl, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      console.log("✅ Socket connected for chat");
      console.log("📦 Joining chat for orderId:", orderId);
      
      // Join order chat room with string orderId
      socket.emit("join-chat", orderId);
      
      // Also join with MongoDB _id if available
      if (mongoOrderId && mongoOrderId !== orderId) {
        console.log("📦 Also joining with MongoDB _id:", mongoOrderId);
        socket.emit("join-chat", mongoOrderId);
      }
      
      // Also join user room for notifications
      const getUserId = () => {
        if (currentUserId) return currentUserId.toString();
        const directId = localStorage.getItem("user_id") || localStorage.getItem("userId");
        if (directId) return directId.toString();
        const userUserStr = localStorage.getItem("user_user");
        if (userUserStr) {
          try {
            const userUser = JSON.parse(userUserStr);
            const id = userUser?._id || userUser?.id;
            if (id) return id.toString();
          } catch (e) {}
        }
        return null;
      };
      const userId = getUserId();
      if (userId) {
        console.log("👤 Joining user room:", userId);
        socket.emit("join-user", userId);
      }
      socket.emit("join-order-tracking", orderId);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    // Listen for new messages
    socket.on("new-message", (data) => {
      console.log("📨 Received new-message event:", {
        hasMessage: !!data.message,
        orderId: data.orderId,
        currentOrderId: orderId,
        mongoOrderId: mongoOrderId,
        senderType: data.message?.senderType,
        message: data.message?.message?.substring(0, 30)
      });
      
      if (data.message) {
        // Check if message belongs to this order (handle both ObjectId and string)
        const messageOrderId = data.orderId?.toString();
        const currentOrderId = orderId?.toString();
        const mongoOrderIdStr = mongoOrderId?.toString();
        
        // More flexible matching - check if orderIds match in any way
        const orderIdMatches = 
          messageOrderId === currentOrderId || 
          messageOrderId === mongoOrderIdStr ||
          data.orderId === orderId ||
          data.orderId === mongoOrderId ||
          data.orderId?.toString() === currentOrderId ||
          data.orderId?.toString() === mongoOrderIdStr ||
          messageOrderId === orderId ||
          messageOrderId === mongoOrderId ||
          (messageOrderId && currentOrderId && (
            messageOrderId.includes(currentOrderId) ||
            currentOrderId.includes(messageOrderId)
          )) ||
          (messageOrderId && mongoOrderIdStr && (
            messageOrderId.includes(mongoOrderIdStr) ||
            mongoOrderIdStr.includes(messageOrderId)
          ));
        
        console.log("🔍 OrderId matching:", {
          messageOrderId,
          currentOrderId,
          mongoOrderIdStr,
          matches: orderIdMatches
        });
        
        if (orderIdMatches) {
          console.log("✅ Message matches order, adding to UI");
          // Check if message is not already in the list
          setMessages((prev) => {
            const exists = prev.some(msg => 
              msg._id?.toString() === data.message._id?.toString() ||
              (msg.isOptimistic && msg.message === data.message.message && 
               msg.senderId?.toString() === data.message.senderId?.toString())
            );
            if (!exists) {
              console.log("➕ Adding new message to list");
              // Remove any optimistic message with same content
              const filtered = prev.filter(msg => 
                !(msg.isOptimistic && msg.message === data.message.message)
              );
              return [...filtered, data.message];
            } else {
              console.log("⚠️ Message already exists, skipping");
            }
            return prev;
          });
          scrollToBottom();
        } else {
          console.log("❌ Message orderId doesn't match, ignoring");
        }
      }
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [orderId, socketUrl, currentUserId, mongoOrderId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !orderId || sending) return;

    const messageText = newMessage.trim();
    const tempMessageId = `temp-${Date.now()}`;
    
    // Get current user ID from multiple sources
    const getUserId = () => {
      if (currentUserId) return currentUserId.toString();
      
      // Try direct keys
      const directId = localStorage.getItem("user_id") || localStorage.getItem("userId");
      if (directId) return directId.toString();
      
      // Try from user_user object
      const userUserStr = localStorage.getItem("user_user");
      if (userUserStr) {
        try {
          const userUser = JSON.parse(userUserStr);
          const id = userUser?._id || userUser?.id;
          if (id) return id.toString();
        } catch (e) {}
      }
      
      // Try from userProfile
      const userProfileStr = localStorage.getItem("userProfile");
      if (userProfileStr) {
        try {
          const userProfile = JSON.parse(userProfileStr);
          const id = userProfile?._id || userProfile?.id;
          if (id) return id.toString();
        } catch (e) {}
      }
      
      return null;
    };
    
    const userId = getUserId();
    
    // Optimistic update - add message immediately to UI
    const optimisticMessage = {
      _id: tempMessageId,
      message: messageText,
      senderId: userId,
      senderType: "user",
      receiverId: null,
      receiverType: "delivery",
      isRead: false,
      createdAt: new Date().toISOString(),
      isOptimistic: true, // Flag to identify temporary message
    };

    // Add optimistic message to UI immediately
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    scrollToBottom();

    try {
      setSending(true);
      const response = await chatAPI.sendMessage(orderId, messageText);
      
      if (response.data?.success && response.data.data?.message) {
        // Replace optimistic message with real message from server
        const realMessage = response.data.data.message;
        setMessages((prev) => {
          // Remove optimistic message
          const filtered = prev.filter(msg => msg._id !== tempMessageId);
          // Add real message if not already present
          const exists = filtered.some(msg => msg._id?.toString() === realMessage._id?.toString());
          if (!exists) {
            return [...filtered, realMessage];
          }
          return filtered;
        });
        scrollToBottom();
      } else {
        // If API call failed, keep optimistic message but mark it
        toast.error("Failed to send message");
        // Optionally remove optimistic message on error
        setMessages((prev) => prev.filter(msg => msg._id !== tempMessageId));
      }
    } catch (error) {
      console.error("Error sending message:", error);
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        orderId,
        messageText: messageText.substring(0, 50)
      });
      
      // Show more specific error message
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Failed to send message";
      toast.error(errorMessage);
      
      // Remove optimistic message on error
      setMessages((prev) => prev.filter(msg => msg._id !== tempMessageId));
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Chat with Delivery Partner</h1>
          <p className="text-xs text-gray-500">Order: {orderId}</p>
        </div>
      </div>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            // Get user ID from multiple sources
            const getUserId = () => {
              if (currentUserId) return currentUserId.toString();
              
              // Try direct keys
              const directId = localStorage.getItem("user_id") || localStorage.getItem("userId");
              if (directId) return directId.toString();
              
              // Try from user_user object
              const userUserStr = localStorage.getItem("user_user");
              if (userUserStr) {
                try {
                  const userUser = JSON.parse(userUserStr);
                  const id = userUser?._id || userUser?.id;
                  if (id) return id.toString();
                } catch (e) {}
              }
              
              // Try from userProfile
              const userProfileStr = localStorage.getItem("userProfile");
              if (userProfileStr) {
                try {
                  const userProfile = JSON.parse(userProfileStr);
                  const id = userProfile?._id || userProfile?.id;
                  if (id) return id.toString();
                } catch (e) {}
              }
              
              return null;
            };
            
            const userId = getUserId();
            
            // Normalize IDs for comparison (handle both ObjectId and string formats)
            const messageSenderId = message.senderId?.toString() || message.senderId || "";
            const normalizedUserId = userId?.toString() || "";
            
            // Check if message is from current user
            const isMyMessage = 
              // Optimistic message check (temporary message we just sent)
              (message.isOptimistic && message.senderType === "user") ||
              // Real message check - compare senderId with currentUserId (both as strings)
              (normalizedUserId && 
               messageSenderId && 
               messageSenderId === normalizedUserId &&
               message.senderType === "user");
            
            // Debug log for troubleshooting (remove in production)
            if (message.senderType === "user" && !isMyMessage) {
              console.log("⚠️ User message not identified as mine:", {
                messageSenderId,
                normalizedUserId,
                match: messageSenderId === normalizedUserId,
                senderType: message.senderType,
                isOptimistic: message.isOptimistic,
                message: message.message?.substring(0, 20)
              });
            }
            
            return (
              <div
                key={message._id || message.createdAt || `msg-${message.message}-${message.createdAt}`}
                className={`flex ${isMyMessage ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isMyMessage
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm">{message.message}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isMyMessage ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    {formatTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sending}
          />
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
