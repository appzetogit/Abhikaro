// @FeedNavbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { HelpCircle, ArrowRight, Phone, Ambulance, AlertTriangle, Shield, ShieldCheck, User, Package, Clock, MapPin, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { deliveryAPI } from "@/lib/api";
import { getDeliveryProfilePhotoUrl, getDeliveryUiAvatarUrl } from "../utils/profilePhoto";
import { useCompanyName } from "@/lib/hooks/useCompanyName";
import { useDeliveryNotificationsContext } from "../context/DeliveryNotificationsContext";

const LS_KEY = "app:isOnline";
const TOAST_ID_KEY = "feedNavbar-onlineStatus";

/** Minimal bottom-sheet popup (self-contained) */
function BottomPopup({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
  closeOnBackdropClick = true,
  maxHeight = "70vh",
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-full bg-white rounded-t-2xl shadow-xl p-4"
        style={{ maxHeight, overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-sm px-3 py-1 rounded-md"
            >
              Close
            </button>
          )}
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export default function FeedNavbar({ className = "" }) {
  const companyName = useCompanyName()
  const navigate = useNavigate();
  const { orderTaken } = useDeliveryNotificationsContext() || {};
  const [availableOrders, setAvailableOrders] = useState([]);
  const [showAvailableOrdersPopup, setShowAvailableOrdersPopup] = useState(false);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  // 1) Init from localStorage (no toast on mount)
  const [isOnline, setIsOnline] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) === true : false;
    } catch {
      return false;
    }
  });

  // 2) Persist to localStorage whenever it changes and notify other components
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(isOnline));
      // Dispatch custom event for same-tab sync (storage event only works across tabs)
      window.dispatchEvent(new CustomEvent('onlineStatusChanged'));
    } catch {}
  }, [isOnline]);

  // 3) Optional: sync across tabs/windows
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LS_KEY && e.newValue != null) {
        const next = JSON.parse(e.newValue) === true;
        setIsOnline((prev) => (prev === next ? prev : next));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // prevent duplicate toasts using a global toast ID
  const showSingleToast = (isNowOnline) => {
    // Dismiss any existing toast with the same ID first
    toast.dismiss(TOAST_ID_KEY);
    
    // Show new toast with a consistent ID to prevent duplicates and offset position
    if (isNowOnline) {
      toast.success("You are now online", { 
        id: TOAST_ID_KEY,
        style: { marginTop: '80px' }
      });
    } else {
      toast("You are now offline", { 
        id: TOAST_ID_KEY,
        style: { marginTop: '80px' }
      });
    }
  };

  const handleProfileClick = () => navigate("/delivery/profile");

  // Sync with real-time "order taken" events
  useEffect(() => {
    if (orderTaken) {
      const takenId = orderTaken.orderId || orderTaken.id || orderTaken._id;
      setAvailableOrders(prev => prev.filter(o => {
        const oid = o.orderId || o.id || o._id;
        return oid !== takenId;
      }));
    }
  }, [orderTaken]);

  const fetchAvailableOrders = async () => {
    if (!isOnline) return;
    setIsLoadingAvailable(true);
    try {
      const res = await deliveryAPI.getAvailableOrders();
      if (res.data?.success) {
        setAvailableOrders(res.data.data?.orders || []);
      }
    } catch (error) {
      // ignore
    } finally {
      setIsLoadingAvailable(false);
    }
  };

  const handleOpenAvailableOrders = () => {
    if (!isOnline) {
      toast.error("Please go online to see available orders");
      return;
    }
    setShowAvailableOrdersPopup(true);
    fetchAvailableOrders();
  };

  const handleAcceptOrder = async (order) => {
    if (isAccepting) return;
    setIsAccepting(true);
    try {
      const res = await deliveryAPI.acceptOrder(order.orderId || order._id);
      if (res.data?.success) {
        const acceptedOrder = res.data.data?.order || res.data.data;
        toast.success("Order accepted successfully!");
        setShowAvailableOrdersPopup(false);
        
        // Build the active order object for DeliveryHome
        // We need to match the shape expected by DeliveryHome.jsx
        const activeOrderData = {
          ...acceptedOrder,
          id: acceptedOrder._id,
          restaurantName: (() => {
            const popName = acceptedOrder.restaurantId?.onboarding?.step1?.restaurantName || acceptedOrder.restaurantId?.name;
            const orderName = acceptedOrder.restaurantName;
            if (orderName === "Indore" && popName && popName !== "Indore") return popName;
            return popName || orderName || "Restaurant";
          })(),
          lat: acceptedOrder.restaurantLat || (acceptedOrder.restaurantId?.location?.coordinates ? acceptedOrder.restaurantId.location.coordinates[1] : null),
          lng: acceptedOrder.restaurantLng || (acceptedOrder.restaurantId?.location?.coordinates ? acceptedOrder.restaurantId.location.coordinates[0] : null),
          customerLat: acceptedOrder.deliveryLat,
          customerLng: acceptedOrder.deliveryLng,
          estimatedEarnings: (() => {
            const val = acceptedOrder.estimatedEarnings || acceptedOrder.amount || 0;
            if (typeof val === 'object') {
              return val.totalEarning ?? val.basePayout ?? 0;
            }
            return val;
          })(),
          customerName: acceptedOrder.userName || acceptedOrder.userId?.name || acceptedOrder.customerName,
          customerPhone: acceptedOrder.userPhone || acceptedOrder.userId?.phone || acceptedOrder.customerPhone,
        };

        localStorage.setItem('activeOrder', JSON.stringify(activeOrderData));
        window.dispatchEvent(new CustomEvent('activeOrderUpdated'));
        
        // Clean up context/socket states if needed
        window.dispatchEvent(new CustomEvent('deliveryOrderAccepted', { detail: activeOrderData }));
      } else {
        toast.error(res.data?.message || "Failed to accept order");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept order");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRejectOrder = async (orderId) => {
    try {
      const res = await deliveryAPI.rejectOrder(orderId, "Rejected from list");
      if (res.data?.success) {
        toast.success("Order rejected");
        setAvailableOrders(prev => prev.filter(o => (o.orderId || o._id) !== orderId));
      }
    } catch (error) {
      toast.error("Failed to reject order");
    }
  };

  const handleToggle = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    const next = !isOnline;

    if (next) {
      try {
        const res = await deliveryAPI.getProfile();
        const profile = res?.data?.data?.profile;
        const st = String(profile?.status || "").toLowerCase();
        if (st === "pending") {
          toast.error(
            "You cannot go online until the admin verifies your account.",
            { id: TOAST_ID_KEY, style: { marginTop: "80px" } },
          );
          return;
        }
        if (st === "rejected" || st === "blocked") {
          toast.error(
            "You cannot go online with your current account status. Contact support if you need help.",
            { id: TOAST_ID_KEY, style: { marginTop: "80px" } },
          );
          return;
        }
      } catch {
        // If verification status cannot be loaded, do not block going online (offline-first networks).
      }
    }

    // Check for active orders before allowing offline toggle
    if (!next) {
      // User is trying to go offline - check for active orders
      try {
        const response = await deliveryAPI.getOrders({ includeDelivered: false });
        const activeOrders = response?.data?.data?.orders || [];
        
        if (activeOrders.length > 0) {
          // Prevent going offline if there are active orders
          toast.error("You cannot go offline while you have active orders. Please complete all orders first.", {
            id: TOAST_ID_KEY,
            style: { marginTop: '80px' }
          });
          return; // Don't proceed with offline toggle
        }
      } catch (error) {
        // If API call fails, allow offline toggle (fail-safe)
        // Log error but don't block user
        console.error('Error checking active orders:', error);
        // Continue with offline toggle
      }
    }
    
    // Update state immediately for better UX
    setIsOnline(next);
    showSingleToast(next);

    // Update backend with location if available
    try {
      // Try to get current location from geolocation
      let latitude = null;
      let longitude = null;

      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 0,
              enableHighAccuracy: true
            });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          
          // Validate coordinates
          if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
              latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            latitude = null;
            longitude = null;
          }
        } catch (geoError) {
          // Could not get current location
        }
      }
      
      // Update backend with location if available, otherwise just online status
      if (latitude && longitude && 
          latitude >= -90 && latitude <= 90 && 
          longitude >= -180 && longitude <= 180) {
        await deliveryAPI.updateLocation(latitude, longitude, next);
      } else {
        // Fallback: use last persisted location from DeliveryHome (if available)
        try {
          const rawSaved = window.localStorage.getItem('delivery:lastKnownLocation')
          const saved = rawSaved ? JSON.parse(rawSaved) : null
          const lat = saved?.lat
          const lng = saved?.lng
          if (typeof lat === 'number' && typeof lng === 'number' &&
              lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            await deliveryAPI.updateLocation(lat, lng, next)
          } else {
            await deliveryAPI.updateOnlineStatus(next);
          }
        } catch {
          await deliveryAPI.updateOnlineStatus(next);
        }
      }
    } catch (error) {
      // Error updating online status in backend
      // Revert state if backend update fails
      setIsOnline(!next);
      toast.error('Failed to update status. Please try again.');
    }
  };

  // Help options with proper navigation paths
  const helpOptions = [
    { 
      id: "supportTickets", 
      title: "Support tickets", 
      subtitle: "Check status of tickets raised", 
      icon: "ticket", 
      path: "/delivery/help/tickets"
    },
    { 
      id: "idCard", 
      title: "Show ID card", 
      subtitle: `See your ${companyName} ID card`, 
      icon: "idCard", 
      path: "/delivery/help/id-card"
    },
  ];

  // Handle help option click - navigate to the correct route
  const handleHelpOptionClick = (option) => {
    if (option.path) {
      setShowHelpPopup(false);
      navigate(option.path);
    } else if (option.onClick) {
      option.onClick();
      setShowHelpPopup(false);
    }
  };

  const [emergencyNumbers, setEmergencyNumbers] = useState({
    medicalEmergency: "",
    accidentHelpline: "",
    contactPolice: "",
    insurance: "",
  });

  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [imageError, setImageError] = useState(false);

  // Fetch emergency help numbers
  useEffect(() => {
    const fetchEmergencyHelp = async () => {
      try {
        const response = await deliveryAPI.getEmergencyHelp();
        if (response?.data?.success && response?.data?.data) {
          setEmergencyNumbers({
            medicalEmergency: response.data.data.medicalEmergency || "",
            accidentHelpline: response.data.data.accidentHelpline || "",
            contactPolice: response.data.data.contactPolice || "",
            insurance: response.data.data.insurance || "",
          });
        }
      } catch (error) {
        // Silently fail - use default empty numbers
        // Error fetching emergency help
      }
    };

    fetchEmergencyHelp();
  }, []);

  // Emergency options with phone numbers from API
  const emergencyOptions = [
    { 
      id: "ambulance", 
      title: "Medical Emergency", 
      subtitle: "Call an ambulance", 
      icon: "ambulance", 
      phone: emergencyNumbers.medicalEmergency,
      onClick: () => {
        if (emergencyNumbers.medicalEmergency) {
          window.location.href = `tel:${emergencyNumbers.medicalEmergency}`;
        } else {
          toast.error("Medical emergency number not configured");
        }
      }
    },
    { 
      id: "accident", 
      title: "Accident Helpline", 
      subtitle: "Report an accident", 
      icon: "accident", 
      phone: emergencyNumbers.accidentHelpline,
      onClick: () => {
        if (emergencyNumbers.accidentHelpline) {
          window.location.href = `tel:${emergencyNumbers.accidentHelpline}`;
        } else {
          toast.error("Accident helpline number not configured");
        }
      }
    },
    { 
      id: "police", 
      title: "Contact Police", 
      subtitle: "Nearest police support", 
      icon: "police", 
      phone: emergencyNumbers.contactPolice,
      onClick: () => {
        if (emergencyNumbers.contactPolice) {
          window.location.href = `tel:${emergencyNumbers.contactPolice}`;
        } else {
          toast.error("Police emergency number not configured");
        }
      }
    },
    { 
      id: "insurance", 
      title: "Insurance", 
      subtitle: "Policy & claim help", 
      icon: "insurance", 
      phone: emergencyNumbers.insurance,
      onClick: () => {
        if (emergencyNumbers.insurance) {
          window.location.href = `tel:${emergencyNumbers.insurance}`;
        } else {
          toast.error("Insurance helpline number not configured");
        }
      }
    },
  ];

  // Fetch profile image
  useEffect(() => {
    const fetchProfileImage = async () => {
      try {
        const response = await deliveryAPI.getProfile();
        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile;
          const imageUrl =
            getDeliveryProfilePhotoUrl(profile) ||
            getDeliveryUiAvatarUrl(profile?.name);
          setProfileImage(imageUrl);
          setImageError(false);
        }
      } catch (error) {
        // Skip logging network and timeout errors (handled by axios interceptor)
        if (error.code !== 'ECONNABORTED' && 
            error.code !== 'ERR_NETWORK' && 
            error.message !== 'Network Error' &&
            !error.message?.includes('timeout')) {
          // Error fetching profile image
        }
      }
    };

    fetchProfileImage();

    // Listen for profile refresh events
    const handleProfileRefresh = () => {
      fetchProfileImage();
    };

    window.addEventListener('deliveryProfileRefresh', handleProfileRefresh);
    
    return () => {
      window.removeEventListener('deliveryProfileRefresh', handleProfileRefresh);
    };
  }, []);

  return (
    <>
    <div className={`bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 border-b border-gray-200 ${className}`}>
        {/* Online/Offline Toggle */}
      <div className="relative" style={{ zIndex: 100 }}>
        <button
          onClick={handleToggle}
          onTouchStart={(e) => e.stopPropagation()}
          className="focus:outline-none relative cursor-pointer"
          type="button"
          role="switch"
            aria-checked={isOnline}
            style={{ pointerEvents: "auto", zIndex: 100, WebkitTapHighlightColor: "transparent" }}
          >
            <div className={`relative w-20 h-8 rounded-full transition-colors duration-300 ${isOnline ? "bg-green-500" : "bg-gray-400"}`}>
            <span
              className={`text-[11px] font-bold text-white absolute top-1/2 -translate-y-1/2 whitespace-nowrap transition-all duration-300 ${
                  isOnline ? "left-2" : "right-2"
              }`}
              style={{ opacity: 1, zIndex: 2, pointerEvents: "none" }}
            >
                {isOnline ? "Online" : "Offline"}
            </span>

            <motion.div
              className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
                animate={{ x: isOnline ? 48 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              style={{ pointerEvents: "none", zIndex: 10 }}
            />
          </div>
        </button>
      </div>

      {/* Right Icons */}
      <div className="flex items-center gap-3">
        {/* Emergency */}
        <button
            onClick={() => setShowEmergencyPopup(true)}
          className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center hover:bg-red-600 transition-colors relative"
            title="Emergency"
        >
          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </button>
        
        {/* Pending Order List Icon */}
        <button
          onClick={handleOpenAvailableOrders}
          className={`w-10 h-10 rounded-full flex items-center justify-center relative transition-all duration-300 ${
            availableOrders.length > 0 
              ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          title="Pending Orders"
        >
          <Package className={`w-5 h-5 ${availableOrders.length > 0 ? "text-white" : "text-gray-700"}`} />
          {isOnline && availableOrders.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
              {availableOrders.length}
            </span>
          )}
        </button>

        {/* Help */}
        <button
            onClick={() => setShowHelpPopup(true)}
          className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors"
            title="Help"
        >
          <HelpCircle className="w-5 h-5 text-gray-700" />
        </button>

        {/* Profile */}
        <button onClick={handleProfileClick} className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-gray-300 flex items-center justify-center bg-gray-200" title="Profile">
          {profileImage && !imageError ? (
            <img
              src={profileImage}
              alt="Profile"
              className="w-full h-full object-cover"
              onError={(e) => {
                const fb = getDeliveryUiAvatarUrl("Delivery Partner");
                if (e.target.src !== fb) {
                  e.target.src = fb;
                } else {
                  setImageError(true);
                }
              }}
            />
          ) : (
            <User className="w-5 h-5 text-gray-500" />
          )}
        </button>
      </div>
    </div>

      {/* Available Orders Popup */}
      <BottomPopup
        isOpen={showAvailableOrdersPopup}
        onClose={() => setShowAvailableOrdersPopup(false)}
        title="Available Orders"
        maxHeight="85vh"
      >
        <div className="py-2">
          {isLoadingAvailable ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-500 font-medium">Fetching orders...</p>
            </div>
          ) : availableOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Package className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Available Orders</h3>
              <p className="text-sm text-gray-600">
                There are no new orders in your area at the moment. We'll notify you when a new order arrives.
              </p>
              <button 
                onClick={fetchAvailableOrders}
                className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-full font-semibold shadow-md hover:bg-blue-700 transition-all"
              >
                Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-4 pb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 px-1">
                {availableOrders.length} ORDERS NEAR YOU
              </p>
              {availableOrders.map((order) => (
                <div 
                  key={order._id}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Order Header */}
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase">
                          {order.paymentMethod || 'COD'}
                        </span>
                        <span className="text-xs font-medium text-gray-500">
                          #{order.orderId?.slice(-6) || order._id?.slice(-6)}
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-lg">
                        {(() => {
                          const popName = order.restaurantId?.onboarding?.step1?.restaurantName || order.restaurantId?.name;
                          const orderName = order.restaurantName;
                          if (orderName === "Indore" && popName && popName !== "Indore") return popName;
                          return popName || orderName || "Restaurant";
                        })()}
                      </h4>
                    </div>
                    {order.estimatedEarnings && (
                      <div className="text-right">
                        <p className="text-[10px] font-medium text-gray-500 uppercase">Earnings</p>
                        <p className="text-lg font-bold text-green-600 flex items-center justify-end">
                          <IndianRupee className="w-4 h-4" />
                          {(() => {
                            const val = order.estimatedEarnings || 0;
                            if (typeof val === 'object') {
                              return Number(val.totalEarning || val.basePayout || 0).toFixed(0);
                            }
                            return Number(val).toFixed(0);
                          })()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Order Details */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 flex flex-col items-center pt-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <div className="w-0.5 h-6 bg-gray-200 my-1"></div>
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      </div>
                      <div className="flex-1 space-y-4">
                        <div>
                          <p className="text-[10px] font-medium text-gray-400 uppercase">Pickup</p>
                          <p className="text-sm text-gray-700 line-clamp-1">
                            {order.restaurantId?.address || 
                             order.restaurantId?.location?.address || 
                             order.restaurantId?.location?.formattedAddress || 
                             'Restaurant Address'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-gray-400 uppercase">Drop</p>
                          <p className="text-sm text-gray-700 line-clamp-1">
                            {order.address?.formattedAddress || order.address?.street || 'Customer Address'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-2 border-t border-gray-50">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-medium text-gray-600">30-40 mins</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-medium text-gray-600">
                          {order.assignmentInfo?.distance ? `${order.assignmentInfo.distance.toFixed(1)} km` : 'Calculating...'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 bg-gray-50/30 flex gap-3">
                    <button
                      onClick={() => handleRejectOrder(order.orderId || order._id)}
                      className="flex-1 py-3 px-4 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleAcceptOrder(order)}
                      disabled={isAccepting}
                      className="flex-[2] py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAccepting ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        "Accept Order"
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomPopup>

      {/* Help Popup */}
      <BottomPopup
        isOpen={showHelpPopup}
        onClose={() => setShowHelpPopup(false)}
        title="How can we help?"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="70vh"
      >
    <div className="py-2">
          {helpOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleHelpOptionClick(option)}
              className="w-full flex items-center gap-4 py-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              {/* Icon */}
              <div className="shrink-0 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                {option.icon === "helpCenter" && (
                  <HelpCircle className="w-6 h-6 text-gray-700" />
                )}
                {option.icon === "ticket" && (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                )}
                {option.icon === "idCard" && (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                )}
                {option.icon === "language" && (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                )}
              </div>

              {/* Text Content */}
              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold text-gray-900 mb-1">{option.title}</h3>
                <p className="text-sm text-gray-600">{option.subtitle}</p>
              </div>

              {/* Arrow Icon */}
              <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Emergency Popup */}
      <BottomPopup
        isOpen={showEmergencyPopup}
        onClose={() => setShowEmergencyPopup(false)}
        title="Emergency help"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="70vh"
      >
        <div className="py-2">
          {emergencyOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                option.onClick?.();
                setShowEmergencyPopup(false);
              }}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="shrink-0 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                {option.icon === "ambulance" && (
                  <Ambulance className="w-6 h-6 text-red-600" />
                )}
                {option.icon === "accident" && (
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                )}
                {option.icon === "police" && (
                  <Shield className="w-6 h-6 text-blue-600" />
                )}
                {option.icon === "insurance" && (
                  <ShieldCheck className="w-6 h-6 text-green-600" />
                )}
              </div>

              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold text-gray-900 mb-1">{option.title}</h3>
                <p className="text-sm text-gray-600">{option.subtitle}</p>
              </div>

              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </BottomPopup>
    </>
  );
}
