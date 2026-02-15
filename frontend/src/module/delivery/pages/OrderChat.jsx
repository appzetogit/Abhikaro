import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { chatAPI, deliveryAPI } from "@/lib/api";
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

  // Fetch current delivery partner ID
  useEffect(() => {
    const fetchDeliveryId = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        if (response.data?.success && response.data.data) {
          const delivery = response.data.data.user || response.data.data.deliveryPartner;
          const id = delivery?._id || delivery?.id;
          if (id) {
            setCurrentUserId(id.toString());
          }
        }
      } catch (error) {
        console.error("Error fetching delivery ID:", error);
      }
    };
    fetchDeliveryId();
  }, []);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!orderId) return;

      try {
        setLoading(true);
        const response = await chatAPI.getMessages(orderId);
        if (response.data?.success) {
          setMessages(response.data.data.messages || []);
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
      // Join order chat room (try both ObjectId and string orderId)
      socket.emit("join-chat", orderId);
      // Also join order tracking room
      socket.emit("join-order-tracking", orderId);
      // Join delivery room for notifications
      const deliveryId = localStorage.getItem("delivery_id") || localStorage.getItem("deliveryId");
      if (deliveryId) {
        socket.emit("join-delivery", deliveryId);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    // Listen for new messages
    socket.on("new-message", (data) => {
      if (data.message) {
        // Check if message belongs to this order (handle both ObjectId and string)
        const messageOrderId = data.orderId?.toString();
        const currentOrderId = orderId?.toString();
        
        // More flexible matching - check if orderIds match in any way
        const orderIdMatches = 
          messageOrderId === currentOrderId || 
          data.orderId === orderId ||
          data.orderId?.toString() === currentOrderId ||
          messageOrderId === orderId ||
          (messageOrderId && currentOrderId && (
            messageOrderId.includes(currentOrderId) ||
            currentOrderId.includes(messageOrderId)
          ));
        
        if (orderIdMatches) {
          // Check if message is not already in the list
          setMessages((prev) => {
            const exists = prev.some(msg => 
              msg._id?.toString() === data.message._id?.toString() ||
              (msg.isOptimistic && msg.message === data.message.message && 
               msg.senderId?.toString() === data.message.senderId?.toString())
            );
            if (!exists) {
              // Remove any optimistic message with same content
              const filtered = prev.filter(msg => 
                !(msg.isOptimistic && msg.message === data.message.message)
              );
              return [...filtered, data.message];
            }
            return prev;
          });
          scrollToBottom();
        }
      }
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [orderId, socketUrl]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !orderId || sending) return;

    const messageText = newMessage.trim();
    const tempMessageId = `temp-${Date.now()}`;
    
    // Get current delivery ID (from state or localStorage as fallback)
    const deliveryId = currentUserId || localStorage.getItem("delivery_id") || localStorage.getItem("deliveryId");
    
    // Optimistic update - add message immediately to UI
    const optimisticMessage = {
      _id: tempMessageId,
      message: messageText,
      senderId: deliveryId,
      senderType: "delivery",
      receiverId: null,
      receiverType: "user",
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
      toast.error("Failed to send message");
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
          <h1 className="text-lg font-bold text-gray-900">Chat</h1>
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
            // Check if this message is from current user (delivery boy)
            // Also check if it's an optimistic message (temporary message we just sent)
            const isMyMessage = 
              (currentUserId && 
               message.senderId?.toString() === currentUserId.toString() &&
               message.senderType === "delivery") ||
              (message.isOptimistic && message.senderType === "delivery");
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
