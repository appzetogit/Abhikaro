import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  ArrowLeft,
  RefreshCw,
  Phone,
  ChevronRight,
  MapPin,
  Home as HomeIcon,
  MessageSquare,
  X,
  Check,
  Receipt,
  CircleSlash,
  Loader2
} from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useOrders } from "../../context/OrdersContext"
import { useProfile } from "../../context/ProfileContext"
import DeliveryTrackingMap from "../../components/DeliveryTrackingMap"
import api, { orderAPI, restaurantAPI } from "@/lib/api"
import { preloadGoogleMaps } from "@/utils/mapsPreload"

// Animated checkmark component
const AnimatedCheckmark = ({ delay = 0 }) => (
  <motion.svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    initial="hidden"
    animate="visible"
    className="mx-auto"
  >
    <motion.circle
      cx="40"
      cy="40"
      r="36"
      fill="none"
      stroke="#22c55e"
      strokeWidth="4"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    />
    <motion.path
      d="M24 40 L35 51 L56 30"
      fill="none"
      stroke="#22c55e"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: delay + 0.4, ease: "easeOut" }}
    />
  </motion.svg>
)

// Real Delivery Map Component (NO user live-location tracking on this screen)
// NOTE: This wrapper must keep `restaurantCoords`/`customerCoords` object identity stable
// across parent re-renders; otherwise the map/marker logic re-runs and causes flicker.
const DeliveryMap = ({ orderId, order, isVisible }) => {
  // Get coordinates from order or use defaults (Indore)
  const getRestaurantCoords = () => {
    const isValidLatLng = (lat, lng) => (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );

    const calculateHaversineDistance = (lat1, lng1, lat2, lng2) => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    console.log('🔍 Getting restaurant coordinates from order:', {
      hasOrder: !!order,
      restaurantLocation: order?.restaurantLocation,
      coordinates: order?.restaurantLocation?.coordinates,
      restaurantId: order?.restaurantId,
      restaurantIdLocation: order?.restaurantId?.location,
      restaurantIdCoordinates: order?.restaurantId?.location?.coordinates
    });

    // Try multiple sources for restaurant coordinates
    let coords = null;

    // Priority 1: restaurantLocation.coordinates (already extracted in transformed order)
    const resLocCoords = order?.restaurantLocation?.coordinates || order?.restaurantLocation?.location?.coordinates;
    if (resLocCoords && Array.isArray(resLocCoords) && resLocCoords.length >= 2) {
      coords = resLocCoords;
      console.log('✅ Using restaurantLocation coordinates:', coords);
    }
    // Priority 2: restaurantId.location.coordinates (if restaurantId is populated)
    else if (order?.restaurantId?.location?.coordinates &&
      Array.isArray(order.restaurantId.location.coordinates) &&
      order.restaurantId.location.coordinates.length >= 2) {
      coords = order.restaurantId.location.coordinates;
      console.log('✅ Using restaurantId.location.coordinates:', coords);
    }
    // Priority 3: restaurantId.location with latitude/longitude
    else if (order?.restaurantId?.location?.latitude && order?.restaurantId?.location?.longitude) {
      coords = [order.restaurantId.location.longitude, order.restaurantId.location.latitude];
      console.log('✅ Using restaurantId.location (lat/lng):', coords);
    }

    if (coords && coords.length >= 2) {
      const a0 = Number(coords[0]);
      const a1 = Number(coords[1]);

      // Most common cases:
      // 1) GeoJSON: [lng, lat] => { lat: coords[1], lng: coords[0] }
      // 2) Some stores: [lat, lng] => { lat: coords[0], lng: coords[1] }
      const candidateGeoJSON = { lat: a1, lng: a0 };
      const candidateAlt = { lat: a0, lng: a1 };

      const customerCoordsArray = order?.address?.coordinates || order?.address?.location?.coordinates;
      const hasRealCustomerCoords =
        Array.isArray(customerCoordsArray) &&
        customerCoordsArray.length >= 2 &&
        typeof customerCoordsArray[0] !== 'undefined' &&
        typeof customerCoordsArray[1] !== 'undefined';

      const customerCandidate = hasRealCustomerCoords
        ? { lat: Number(customerCoordsArray[1]), lng: Number(customerCoordsArray[0]) } // GeoJSON [lng,lat]
        : null;

      if (isValidLatLng(candidateGeoJSON.lat, candidateGeoJSON.lng) && customerCandidate && isValidLatLng(customerCandidate.lat, customerCandidate.lng)) {
        // Pick the interpretation that is closer to the customer's address.
        if (isValidLatLng(candidateAlt.lat, candidateAlt.lng)) {
          const dGeo = calculateHaversineDistance(
            customerCandidate.lat,
            customerCandidate.lng,
            candidateGeoJSON.lat,
            candidateGeoJSON.lng
          );
          const dAlt = calculateHaversineDistance(
            customerCandidate.lat,
            customerCandidate.lng,
            candidateAlt.lat,
            candidateAlt.lng
          );

          const result = dAlt < dGeo ? candidateAlt : candidateGeoJSON;
          console.log('✅ Final restaurant coordinates picked by proximity:', result, { dGeo, dAlt, raw: coords });
          return result;
        }

        console.log('✅ Final restaurant coordinates (GeoJSON, only candidate valid):', candidateGeoJSON, { raw: coords });
        return candidateGeoJSON;
      }

      if (isValidLatLng(candidateAlt.lat, candidateAlt.lng)) {
        console.log('✅ Final restaurant coordinates (alt interpretation valid):', candidateAlt, { raw: coords });
        return candidateAlt;
      }

      console.warn('⚠️ Restaurant coordinates invalid; will not render restaurant marker:', { raw: coords });
      return null;
    }

    console.warn('⚠️ Restaurant coordinates not found; will not render restaurant marker');
    return null;
  };

  const getCustomerCoords = () => {
    // Try multiple sources for customer coordinates
    const coords = order?.address?.coordinates || order?.address?.location?.coordinates;
    
    if (coords && Array.isArray(coords) && coords.length >= 2) {
      const lat = Number(coords[1]);
      const lng = Number(coords[0]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return null;
  };

  // Stabilize coordinates object references to avoid map/marker "blink" on frequent parent re-renders.
  const stableRestaurantCoordsRef = useRef(null)
  const stableCustomerCoordsRef = useRef(null)

  let restaurantCoords = getRestaurantCoords();
  // Show ONLY the order's delivery coordinates (where the order was placed).
  // No live tracking of the user's device location on this screen.
  let customerCoords = getCustomerCoords() || null;

  const sameLatLng = (a, b) =>
    !!a &&
    !!b &&
    typeof a.lat === "number" &&
    typeof a.lng === "number" &&
    typeof b.lat === "number" &&
    typeof b.lng === "number" &&
    a.lat === b.lat &&
    a.lng === b.lng

  if (restaurantCoords) {
    if (sameLatLng(restaurantCoords, stableRestaurantCoordsRef.current)) {
      restaurantCoords = stableRestaurantCoordsRef.current
    } else {
      stableRestaurantCoordsRef.current = restaurantCoords
    }
  } else {
    stableRestaurantCoordsRef.current = null
  }

  if (customerCoords) {
    if (sameLatLng(customerCoords, stableCustomerCoordsRef.current)) {
      customerCoords = stableCustomerCoordsRef.current
    } else {
      stableCustomerCoordsRef.current = customerCoords
    }
  } else {
    stableCustomerCoordsRef.current = null
  }

  const deliveryPartnerName =
    order?.deliveryPartner?.name ||
    order?.deliveryPartnerId?.name ||
    order?.deliveryPartnerName ||
    "";

  const deliveryPartnerPhone =
    order?.deliveryPartner?.phone ||
    order?.deliveryPartnerPhone ||
    order?.deliveryPartnerId?.phone ||
    order?.deliveryPartnerId?.phoneNumber ||
    order?.deliveryPartnerId?.mobile ||
    order?.deliveryPartnerId?.contactNumber ||
    "";

  const hasAcceptedByDelivery =
    String(order?.deliveryState?.status || "").toLowerCase() === "accepted" ||
    ["en_route_to_pickup", "at_pickup", "en_route_to_delivery", "at_delivery"].includes(
      String(order?.deliveryState?.currentPhase || "").toLowerCase(),
    ) ||
    String(order?.status || "").toLowerCase() === "out_for_delivery";

  // Delivery boy data - memoized to keep identity stable
  const deliveryBoyData = useMemo(() => {
    if (!order?.deliveryPartner) return null;
    return {
      name: order.deliveryPartner.name || 'Delivery Partner',
      avatar: order.deliveryPartner.avatar || null
    };
  }, [order?.deliveryPartner?.name, order?.deliveryPartner?.avatar]);

  // IMPORTANT: keep tracking ids array stable across re-renders.
  // Otherwise `DeliveryTrackingMap`'s socket effect will reconnect repeatedly and cause flicker over time.
  const trackingIds = useMemo(() => {
    const ids = [orderId, order?._id, order?.orderId].filter(Boolean).map(String)
    return Array.from(new Set(ids))
  }, [orderId, order?._id, order?.orderId])

  return (
    <motion.div
      className="relative h-64 w-full"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
    >
      {/* Delivery partner banner (replaces generic high-demand style banner) */}

      <DeliveryTrackingMap
        orderId={orderId}
        // Join both possible socket rooms/event ids (Mongo _id and custom orderId) so live tracking works after refresh
        trackingRoomIds={trackingIds}
        restaurantCoords={restaurantCoords}
        customerCoords={customerCoords}
        deliveryBoyData={deliveryBoyData}
        order={order}
      />

    </motion.div>
  );
}

// Section item component
const SectionItem = ({ icon: Icon, title, subtitle, onClick, showArrow = true, rightContent }) => (
  <motion.div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => {
      if (!onClick) return
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onClick(e)
      }
    }}
    className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-dashed border-gray-200 last:border-0 ${
      onClick ? "cursor-pointer" : "cursor-default"
    }`}
    whileTap={{ scale: 0.99 }}
  >
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
      <Icon className="w-5 h-5 text-gray-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 truncate">{title}</p>
      {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
    </div>
    {rightContent || (showArrow && <ChevronRight className="w-5 h-5 text-gray-400" />)}
  </motion.div>
)

export default function OrderTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const confirmed = searchParams.get("confirmed") === "true"
  const { getOrderById } = useOrders()
  const { profile, getDefaultAddress } = useProfile()

  // State for order data - initialize from context to avoid loading flicker
  const [order, setOrder] = useState(() => getOrderById(orderId) || null)
  const [loading, setLoading] = useState(!order)
  const [error, setError] = useState(null)
  const [restaurantPhone, setRestaurantPhone] = useState(null)
  
  // Cache restaurant data to avoid duplicate API calls
  const restaurantCacheRef = useRef(new Map())

  const [showConfirmation, setShowConfirmation] = useState(confirmed)
  const [orderStatus, setOrderStatus] = useState('placed')
  const orderStatusRef = useRef(orderStatus)
  const [estimatedTime, setEstimatedTime] = useState(null) // Will be calculated from order data
  const [orderCreatedAt, setOrderCreatedAt] = useState(null) // Store order creation time
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancellationReason, setCancellationReason] = useState("")
  const [isHotelOrder, setIsHotelOrder] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false)
  const [instructionsText, setInstructionsText] = useState("")
  const [isSavingInstructions, setIsSavingInstructions] = useState(false)
  const [showAddressDialog, setShowAddressDialog] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [advertiseBanner, setAdvertiseBanner] = useState(null)

  const defaultAddress = getDefaultAddress()

  const deliveryAddressText = useMemo(() => {
    // Priority 1: Use order address formattedAddress (live location address)
    if (
      order?.address?.formattedAddress &&
      order.address.formattedAddress !== "Select location"
    ) {
      return order.address.formattedAddress
    }

    // Priority 2: Build full address from order address parts
    if (order?.address) {
      const parts = []
      if (order.address.street) parts.push(order.address.street)
      if (order.address.additionalDetails) parts.push(order.address.additionalDetails)
      if (order.address.city) parts.push(order.address.city)
      if (order.address.state) parts.push(order.address.state)
      if (order.address.zipCode) parts.push(order.address.zipCode)
      if (parts.length > 0) return parts.join(", ")
    }

    // Priority 3: Use defaultAddress formattedAddress (live location address)
    if (
      defaultAddress?.formattedAddress &&
      defaultAddress.formattedAddress !== "Select location"
    ) {
      return defaultAddress.formattedAddress
    }

    // Priority 4: Build full address from defaultAddress parts
    if (defaultAddress) {
      const parts = []
      if (defaultAddress.street) parts.push(defaultAddress.street)
      if (defaultAddress.additionalDetails) parts.push(defaultAddress.additionalDetails)
      if (defaultAddress.city) parts.push(defaultAddress.city)
      if (defaultAddress.state) parts.push(defaultAddress.state)
      if (defaultAddress.zipCode) parts.push(defaultAddress.zipCode)
      if (parts.length > 0) return parts.join(", ")
    }

    return "Add delivery address"
  }, [order, defaultAddress])

  // Preload Google Maps script early so map appears faster.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { getGoogleMapsApiKey } = await import("@/lib/utils/googleMapsApiKey.js")
        const key = await getGoogleMapsApiKey()
        if (cancelled) return
        if (key) preloadGoogleMaps(key)
      } catch {
        // non-blocking
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Clear checkout drafts on mount
  useEffect(() => {
    try {
      sessionStorage.removeItem("checkout_additional_address")
      sessionStorage.removeItem("checkout_note")
      sessionStorage.removeItem("checkout_room_number")
      sessionStorage.removeItem("checkout_contact_draft")
    } catch (e) {
      // ignore
    }
  }, [])

  // Load advertise banner for tracking screen (admin-controlled)
  useEffect(() => {
    const loadBanner = async () => {
      try {
        const res = await api.get("/advertise-banners/public", {
          params: { placement: "order_placed" },
        })
        const banner = res?.data?.data?.banner || null
        setAdvertiseBanner(banner?.imageUrl ? banner : null)
      } catch {
        setAdvertiseBanner(null)
      }
    }
    loadBanner()
  }, [])

  useEffect(() => {
    orderStatusRef.current = orderStatus
  }, [orderStatus])

  // Derive the UI status from the latest `order` object.
  // This prevents stale localStorage state from showing wrong banners after refresh.
  const mapOrderToUIStatus = useCallback((o) => {
    const normalize = (v) =>
      String(v || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")

    const rawStatus = normalize(o?.status)
    const deliveryStatus = normalize(o?.deliveryState?.status)
    const currentPhase = normalize(o?.deliveryState?.currentPhase)
    const orderIdConfirmedAt = o?.deliveryState?.orderIdConfirmedAt
      ? new Date(o.deliveryState.orderIdConfirmedAt)
      : null

    const trackingDelivered =
      o?.tracking?.delivered?.status === true || o?.tracking?.delivered === true

    const stateDelivered =
      deliveryStatus === "delivered"

    const phaseCompleted =
      currentPhase === "completed"

    const isDelivered =
      rawStatus === "delivered" ||
      rawStatus === "completed" ||
      trackingDelivered ||
      stateDelivered ||
      phaseCompleted ||
      o?.deliveryState?.currentPhase === "completed"

    if (rawStatus === "cancelled") {
      return { uiStatus: "cancelled", estimatedTimeOverride: 0 }
    }

    if (isDelivered) {
      return { uiStatus: "delivered", estimatedTimeOverride: 0 }
    }

    // Common order status variants from backend (restaurant side truth)
    if (
      ["preparing", "processing", "cooking", "confirmed", "accepted"].includes(
        rawStatus,
      )
    ) {
      return { uiStatus: "preparing", estimatedTimeOverride: null }
    }

    if (["ready", "packed"].includes(rawStatus)) {
      return { uiStatus: "pickup", estimatedTimeOverride: null }
    }

    // Delivery phases (realtime signals) - but never claim "ready" unless restaurant marked ready/packed.
    if (["en_route_to_delivery", "at_delivery"].includes(currentPhase)) {
      return { uiStatus: "on_way", estimatedTimeOverride: null }
    }
    if (["en_route_to_pickup", "at_pickup"].includes(currentPhase)) {
      // If restaurant hasn't marked READY yet, keep showing Preparing.
      // Rider may still be heading to restaurant early, but the food isn't ready.
      return { uiStatus: "preparing", estimatedTimeOverride: null }
    }

    if (
      [
        "out_for_delivery",
        "outfordelivery",
        "on_way",
        "on_the_way",
        "picked_up",
        "pickedup",
        "dispatched",
      ].includes(rawStatus)
    ) {
      // Show a short "picked up" state right after rider confirms pickup,
      // then switch to regular "on the way" view.
      if (
        currentPhase === "en_route_to_delivery" &&
        orderIdConfirmedAt &&
        !Number.isNaN(orderIdConfirmedAt.getTime())
      ) {
        const msSincePickup = Date.now() - orderIdConfirmedAt.getTime()
        if (msSincePickup >= 0 && msSincePickup < 5 * 60 * 1000) {
          return { uiStatus: "picked_up", estimatedTimeOverride: null }
        }
      }
      
      if (currentPhase === "at_delivery" || deliveryStatus === "reached_delivery") {
        return { uiStatus: "arrived", estimatedTimeOverride: 0 }
      }
      
      return { uiStatus: "on_way", estimatedTimeOverride: null }
    }

    return { uiStatus: "placed", estimatedTimeOverride: null }
  }, [])

  useEffect(() => {
    if (!order) return

    const mapped = mapOrderToUIStatus(order)
    setOrderStatus(mapped.uiStatus)

    if (mapped.estimatedTimeOverride !== null) {
      setEstimatedTime(mapped.estimatedTimeOverride)
    }
  }, [order, mapOrderToUIStatus])

  // Detect hotel order context
  useEffect(() => {
    const isHotelOrderFlag = sessionStorage.getItem('isHotelOrder');
    if (isHotelOrderFlag === 'true') {
      setIsHotelOrder(true);
    }
  }, []);

  // Poll for order updates (especially when delivery partner accepts)
  // Only poll if delivery partner is not yet assigned to avoid unnecessary updates
  useEffect(() => {
    if (!orderId || !order) return;

    // Skip polling if delivery partner is already assigned and accepted
    const currentDeliveryStatus = order?.deliveryState?.status;
    const currentPhase = order?.deliveryState?.currentPhase;
    const hasDeliveryPartner = currentDeliveryStatus === 'accepted' ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery';

    // If delivery partner is assigned, reduce polling frequency to 60 seconds (increased from 45s)
    // If not assigned, poll every 30 seconds to detect assignment (increased from 10s)
    const pollInterval = hasDeliveryPartner ? 60000 : 30000;

    const interval = setInterval(async () => {
      // Only poll when page is visible to reduce unnecessary requests
      if (document.visibilityState !== 'visible') {
        return;
      }
      try {
        const response = await orderAPI.getOrderDetails(orderId);
        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order;

          // Check if delivery state changed (e.g., status became 'accepted')
          const newDeliveryStatus = apiOrder.deliveryState?.status;
          const newPhase = apiOrder.deliveryState?.currentPhase;
          const newOrderStatus = apiOrder.status;
          const currentOrderStatus = order?.status;

          // Check if order was cancelled
          if (newOrderStatus === 'cancelled' && currentOrderStatus !== 'cancelled') {
            setOrderStatus('cancelled');
          }

          // Only update if status actually changed
          if (newDeliveryStatus === 'accepted' ||
            (newDeliveryStatus !== currentDeliveryStatus) ||
            (newPhase !== currentPhase) ||
            (newOrderStatus !== currentOrderStatus)) {
            console.log('🔄 Order status updated:', {
              oldStatus: currentDeliveryStatus,
              newStatus: newDeliveryStatus,
              oldPhase: currentPhase,
              newPhase: newPhase
            });

            // Re-fetch and update order (same logic as initial fetch)
            let restaurantCoords = null;
            if (apiOrder.restaurantId?.location?.coordinates &&
              Array.isArray(apiOrder.restaurantId.location.coordinates) &&
              apiOrder.restaurantId.location.coordinates.length >= 2) {
              restaurantCoords = apiOrder.restaurantId.location.coordinates;
            } else if (typeof apiOrder.restaurantId === 'string') {
              // Check cache first to avoid duplicate API calls
              const cachedRestaurant = restaurantCacheRef.current.get(apiOrder.restaurantId);
              if (cachedRestaurant) {
                if (cachedRestaurant.location?.coordinates && Array.isArray(cachedRestaurant.location.coordinates) && cachedRestaurant.location.coordinates.length >= 2) {
                  restaurantCoords = cachedRestaurant.location.coordinates;
                }
              } else {
                try {
                  const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
                  if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
                    const restaurant = restaurantResponse.data.data.restaurant;
                    // Cache the restaurant data
                    restaurantCacheRef.current.set(apiOrder.restaurantId, restaurant);
                    if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                      restaurantCoords = restaurant.location.coordinates;
                    }
                  }
                } catch (err) {
                  console.error('❌ Error fetching restaurant details:', err);
                }
              }
            }

            const transformedOrder = {
              ...apiOrder,
              restaurantLocation: restaurantCoords ? {
                coordinates: restaurantCoords
              } : order.restaurantLocation,
              // Preserve cancellation metadata for UI (reason text entered by restaurant/admin/user)
              cancellationReason:
                apiOrder?.cancellationReason ||
                apiOrder?.cancellation_reason ||
                order?.cancellationReason ||
                null,
              deliveryPartner: apiOrder.deliveryPartnerId ? {
                name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
                avatar: null,
                phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || apiOrder.deliveryPartnerId.mobile || apiOrder.deliveryPartnerId.contactNumber || null,
                availability: apiOrder.deliveryPartnerId.availability || null
              } : order?.deliveryPartner || null,
              deliveryPartnerPhone: apiOrder.deliveryPartnerId?.phone || apiOrder.deliveryPartnerId?.phoneNumber || apiOrder.deliveryPartnerId?.mobile || apiOrder.deliveryPartnerId?.contactNumber || order?.deliveryPartnerPhone || null,
              deliveryPartnerId: apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
              assignmentInfo: apiOrder.assignmentInfo || null,
              deliveryState: apiOrder.deliveryState || null
            };

            setOrder(transformedOrder);
          }
        }
      } catch (err) {
        console.error('Error polling order updates:', err);
      }
    }, pollInterval);

    // Pause polling when page becomes hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && orderId) {
        // Immediately fetch when page becomes visible
        orderAPI.getOrderDetails(orderId).then((response) => {
          if (response.data?.success && response.data.data?.order) {
            const apiOrder = response.data.data.order;
            const transformedOrder = {
              ...apiOrder,
              restaurantLocation: order?.restaurantLocation,
              cancellationReason:
                apiOrder?.cancellationReason ||
                apiOrder?.cancellation_reason ||
                order?.cancellationReason ||
                null,
            deliveryPartner: apiOrder.deliveryPartnerId ? {
              name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
              avatar: null,
              phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || apiOrder.deliveryPartnerId.mobile || apiOrder.deliveryPartnerId.contactNumber || null,
              availability: apiOrder.deliveryPartnerId.availability || null
            } : order?.deliveryPartner || null,
            deliveryPartnerPhone: apiOrder.deliveryPartnerId?.phone || apiOrder.deliveryPartnerId?.phoneNumber || apiOrder.deliveryPartnerId?.mobile || apiOrder.deliveryPartnerId?.contactNumber || order?.deliveryPartnerPhone || null,
              deliveryPartnerId: apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
              assignmentInfo: apiOrder.assignmentInfo || null,
              deliveryState: apiOrder.deliveryState || null
            };
            setOrder(transformedOrder);
          }
        }).catch(err => console.error('Error fetching order on visibility change:', err));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [orderId, order?.deliveryState?.status, order?.deliveryState?.currentPhase]);

  // Fetch order from API if not found in context
  useEffect(() => {
    const fetchOrder = async () => {
      // First try to get from context (localStorage)
      const contextOrder = getOrderById(orderId)
      if (contextOrder) {
        // Ensure restaurant location is available in context order
        if (!contextOrder.restaurantLocation?.coordinates && contextOrder.restaurantId?.location?.coordinates) {
          contextOrder.restaurantLocation = {
            coordinates: contextOrder.restaurantId.location.coordinates
          };
        }
        // Also ensure restaurantId is present
        if (!contextOrder.restaurantId && contextOrder.restaurant) {
          // Try to preserve restaurantId if it exists
          console.log('⚠️ Context order missing restaurantId, will fetch from API');
        }
        // Set immediately for fast UI, but do NOT return.
        // We still fetch from backend because localStorage can be stale.
        setOrder(contextOrder)
        setLoading(false)
      }

      // If not in context, fetch from API
      try {
        // Only show loader if we didn't already set from context.
        // Otherwise, keep current UI while we refresh from backend.
        if (!contextOrder) setLoading(true)
        setError(null)

        const response = await orderAPI.getOrderDetails(orderId)

        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order

          // Log full API response structure for debugging
          console.log('🔍 Full API Order Response:', {
            orderId: apiOrder.orderId || apiOrder._id,
            hasRestaurantId: !!apiOrder.restaurantId,
            restaurantIdType: typeof apiOrder.restaurantId,
            restaurantIdKeys: apiOrder.restaurantId ? Object.keys(apiOrder.restaurantId) : [],
            restaurantIdLocation: apiOrder.restaurantId?.location,
            restaurantIdLocationKeys: apiOrder.restaurantId?.location ? Object.keys(apiOrder.restaurantId.location) : [],
            restaurantIdCoordinates: apiOrder.restaurantId?.location?.coordinates,
            fullRestaurantId: apiOrder.restaurantId
          });

          // Extract restaurant location coordinates with multiple fallbacks
          let restaurantCoords = null;

          // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
          if (apiOrder.restaurantId?.location?.coordinates &&
            Array.isArray(apiOrder.restaurantId.location.coordinates) &&
            apiOrder.restaurantId.location.coordinates.length >= 2) {
            restaurantCoords = apiOrder.restaurantId.location.coordinates;
            console.log('✅ Found coordinates in restaurantId.location.coordinates:', restaurantCoords);
          }
          // Priority 2: restaurantId.location with latitude/longitude properties
          else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
            restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
            console.log('✅ Found coordinates in restaurantId.location (lat/lng):', restaurantCoords);
          }
          // Priority 3: ALWAYS fetch restaurant details if restaurantId is a string
          // Note: restaurantId in Order model is always a STRING, not populated
          // We need to fetch restaurant details to get phone number
          if (typeof apiOrder.restaurantId === 'string' && apiOrder.restaurantId) {
            // Check cache first to avoid duplicate API calls
            const cachedRestaurant = restaurantCacheRef.current.get(apiOrder.restaurantId);
            if (cachedRestaurant) {
              // Use cached restaurant data
              const restaurant = cachedRestaurant;
              // Get coordinates if not already found
              if (!restaurantCoords && restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                restaurantCoords = restaurant.location.coordinates;
                console.log('✅ Using cached restaurant coordinates:', restaurantCoords);
              }
              // Get phone number from cached data
              const phone = restaurant.primaryContactNumber || 
                           restaurant.phone || 
                           restaurant.ownerPhone ||
                           restaurant.contactNumber || 
                           null;
              if (phone) {
                console.log('✅ Found restaurant phone from cache:', phone);
                setRestaurantPhone(phone);
              }
            } else {
              console.log('📞 Fetching restaurant details for phone and coordinates...', apiOrder.restaurantId);
              try {
                const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
                if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
                  const restaurant = restaurantResponse.data.data.restaurant;
                  // Cache the restaurant data for future use
                  restaurantCacheRef.current.set(apiOrder.restaurantId, restaurant);
                  // Get coordinates if not already found
                  if (!restaurantCoords && restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                    restaurantCoords = restaurant.location.coordinates;
                    console.log('✅ Fetched restaurant coordinates from API:', restaurantCoords);
                  }
                  // ALWAYS fetch restaurant phone number (check multiple fields)
                  const phone = restaurant.primaryContactNumber || 
                               restaurant.phone || 
                               restaurant.ownerPhone ||
                               restaurant.contactNumber || 
                               null;
                  if (phone) {
                    console.log('✅ Found restaurant phone:', phone);
                    setRestaurantPhone(phone);
                  } else {
                    console.warn('⚠️ Restaurant phone not found in API response. Available fields:', {
                      restaurantId: apiOrder.restaurantId,
                      restaurantName: restaurant.name,
                      restaurantKeys: Object.keys(restaurant || {}),
                      hasPrimaryContactNumber: !!restaurant.primaryContactNumber,
                      hasPhone: !!restaurant.phone,
                      hasOwnerPhone: !!restaurant.ownerPhone,
                      hasContactNumber: !!restaurant.contactNumber
                    });
                  }
                } else {
                  console.warn('⚠️ Restaurant API response structure unexpected:', {
                    success: restaurantResponse?.data?.success,
                    hasData: !!restaurantResponse?.data?.data,
                    hasRestaurant: !!restaurantResponse?.data?.data?.restaurant,
                    fullResponse: restaurantResponse?.data
                  });
                }
              } catch (err) {
                console.error('❌ Error fetching restaurant details:', err);
                console.error('❌ Error details:', {
                  message: err.message,
                  response: err.response?.data,
                  restaurantId: apiOrder.restaurantId
                });
              }
            }
          }
          // Priority 4: Check nested restaurant data (only if coordinates not found yet)
          if (!restaurantCoords && apiOrder.restaurant?.location?.coordinates) {
            restaurantCoords = apiOrder.restaurant.location.coordinates;
            console.log('✅ Found coordinates in restaurant.location.coordinates:', restaurantCoords);
          }

          console.log('📍 Final restaurant coordinates:', restaurantCoords);
          console.log('📍 Customer coordinates:', apiOrder.address?.location?.coordinates);

          // Transform API order to match component structure
          // Note: restaurantId is a STRING in Order model, not populated
          const restaurantIdValue = apiOrder.restaurantId || null
          const transformedOrder = {
            id: apiOrder.orderId || apiOrder._id,
            restaurant: (() => {
              const cached = restaurantCacheRef.current.get(apiOrder.restaurantId);
              const popName = cached?.onboarding?.step1?.restaurantName || cached?.name;
              const orderName = apiOrder.restaurantName;

              // If orderName is generic "Indore", prefer the populated name from cache if it exists and is different
              if (orderName === "Indore" && popName && popName !== "Indore") {
                return popName;
              }

              return orderName || popName || 'Restaurant';
            })(),
            hotelName: apiOrder.hotelName || null,
            hotelReference: apiOrder.hotelReference || null,
            restaurantId: restaurantIdValue, // This is a STRING ID, not populated object
            userId: apiOrder.userId || null, // Include user data for phone number
            userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || '',
            userPhone: apiOrder.userPhone || apiOrder.userId?.phone || '',
            cancellationReason: apiOrder.cancellationReason || apiOrder.cancellation_reason || null,
            address: {
              street: apiOrder.address?.street || '',
              city: apiOrder.address?.city || '',
              state: apiOrder.address?.state || '',
              zipCode: apiOrder.address?.zipCode || '',
              additionalDetails: apiOrder.address?.additionalDetails || '',
              formattedAddress: apiOrder.address?.formattedAddress ||
                (apiOrder.address?.street && apiOrder.address?.city
                  ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ''}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ''}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ''}`
                  : apiOrder.address?.city || ''),
              coordinates: apiOrder.address?.location?.coordinates || null
            },
            restaurantLocation: {
              coordinates: restaurantCoords
            },
            items: apiOrder.items?.map(item => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price
            })) || [],
            total: apiOrder.pricing?.total || 0,
            status: apiOrder.status || 'pending',
            deliveryPartner: apiOrder.deliveryPartnerId ? {
              name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
              avatar: null,
              phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || apiOrder.deliveryPartnerId.mobile || apiOrder.deliveryPartnerId.contactNumber || null,
              availability: apiOrder.deliveryPartnerId.availability || null
            } : null,
            deliveryPartnerPhone: apiOrder.deliveryPartnerId?.phone || apiOrder.deliveryPartnerId?.phoneNumber || apiOrder.deliveryPartnerId?.mobile || apiOrder.deliveryPartnerId?.contactNumber || null,
            deliveryPartnerId: apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
            assignmentInfo: apiOrder.assignmentInfo || null,
            tracking: apiOrder.tracking || {},
            deliveryState: apiOrder.deliveryState || null,
            estimatedDeliveryTime: apiOrder.estimatedDeliveryTime || null,
            eta: apiOrder.eta || null,
            createdAt: apiOrder.createdAt || null,
            note: apiOrder.note || '',
            deliveryInstructions:
              apiOrder.deliveryInstructions ||
              apiOrder.delivery_instructions ||
              ""
          }

          if (apiOrder.hotelReference) {
            setIsHotelOrder(true);
          }

          setOrder(transformedOrder)

          // Store order creation time for ETA calculation
          if (apiOrder.createdAt) {
            setOrderCreatedAt(new Date(apiOrder.createdAt))
          }

          // Calculate and set ETA from order data
          const calculateETA = () => {
            if (!apiOrder.createdAt) return null

            const now = new Date()
            const createdAt = new Date(apiOrder.createdAt)
            const elapsedMinutes = Math.floor((now - createdAt) / 1000 / 60)

            // Use eta.min/max if available, otherwise use estimatedDeliveryTime
            let initialETA = null
            if (apiOrder.eta?.min && apiOrder.eta?.max) {
              // Use min ETA as the display value
              initialETA = apiOrder.eta.min
            } else if (apiOrder.estimatedDeliveryTime) {
              initialETA = apiOrder.estimatedDeliveryTime
            } else {
              // Default fallback
              initialETA = 30
            }

            // Cap extremely large values (e.g. from coordinates 0,0 fallback distance)
            if (initialETA > 90) {
              initialETA = 45;
            }

            // Calculate remaining time
            let remainingTime = Math.max(0, initialETA - elapsedMinutes)
            
            // If remaining time is 0 or negative but order is still active, show 1 minute.
            // Do not jump back to initialETA.
            if (remainingTime <= 0) {
              const currentStatus = String(apiOrder.status || "").toLowerCase();
              const terminal = new Set(['delivered', 'completed', 'cancelled', 'restaurant_cancelled']);
              if (!terminal.has(currentStatus)) {
                remainingTime = 1;
              }
            }
            
            if (remainingTime < 1 && !['delivered', 'completed', 'cancelled'].includes(String(apiOrder.status).toLowerCase())) {
              remainingTime = 1;
            }

            return remainingTime
          }

          const calculatedETA = calculateETA()
          if (calculatedETA !== null) {
            setEstimatedTime(calculatedETA)
          }

          // Fetch restaurant phone number if not already fetched above
          // Phone should be fetched when restaurant details are fetched for coordinates
          // But if coordinates were found in order data, we still need to fetch phone
          if (!restaurantPhone && restaurantIdValue) {
            console.log('📞 Phone not yet fetched, fetching now for restaurantId:', restaurantIdValue)
            fetchRestaurantPhone(restaurantIdValue, apiOrder)
          }

          // Update orderStatus based on API order status
          const apiStatus = String(apiOrder.status || "").toLowerCase()

          if (apiStatus === "cancelled") {
            setOrderStatus('cancelled');
          } else if (apiStatus === "preparing") {
            setOrderStatus('preparing');
          } else if (apiStatus === "ready") {
            setOrderStatus('pickup');
          } else if (apiStatus === "out_for_delivery") {
            setOrderStatus('pickup');
          } else if (
            apiStatus === "delivered" ||
            apiStatus === "completed" ||
            String(apiOrder.deliveryState?.status || "").toLowerCase() === "delivered" ||
            String(apiOrder.deliveryState?.currentPhase || "").toLowerCase() === "completed" ||
            apiOrder.tracking?.delivered === true
          ) {
            setOrderStatus('delivered');
            setEstimatedTime(0); // Set to 0 when delivered
          }
        } else {
          throw new Error('Order not found')
        }
      } catch (err) {
        console.error('Error fetching order:', err)
        // If we already had an order from context/localStorage, don't override the UI with an error.
        if (!contextOrder) {
          setError(
            err.response?.data?.message || err.message || 'Failed to fetch order'
          )
        }
      } finally {
        setLoading(false)
      }
    }

    if (orderId) {
      fetchOrder()
    }
  }, [orderId, getOrderById])

  // Simulate order status progression
  useEffect(() => {
    if (confirmed) {
      const timer1 = setTimeout(() => {
        setShowConfirmation(false)
        // Prevent confirmation simulation from overriding already-delivered orders
        if (
          orderStatusRef.current !== 'delivered' &&
          orderStatusRef.current !== 'cancelled'
        ) {
          setOrderStatus('preparing')
        }
      }, 3000)
      return () => clearTimeout(timer1)
    }
  }, [confirmed])

  // ETA countdown timer - recalculate based on elapsed time
  useEffect(() => {
    if (!orderCreatedAt || estimatedTime === null) return

    const updateETA = () => {
      const now = new Date()
      const createdAt = new Date(orderCreatedAt)
      const elapsedMinutes = Math.floor((now - createdAt) / 1000 / 60)

      // Get initial ETA from order
      let initialETA = order?.eta?.min || order?.estimatedDeliveryTime || 30
      if (initialETA > 90) {
        initialETA = 45;
      }
      const remainingTime = Math.max(0, initialETA - elapsedMinutes)

      setEstimatedTime(remainingTime)
    }

    // Update immediately
    updateETA()

    // Update every minute
    const timer = setInterval(updateETA, 60000)
    return () => clearInterval(timer)
  }, [orderCreatedAt, order?.eta?.min, order?.estimatedDeliveryTime])

  // Listen for order status updates from socket (e.g., "Delivery partner on the way")
  useEffect(() => {
    const handleOrderStatusNotification = (event) => {
      const {
        message,
        title,
        status,
        estimatedDeliveryTime,
        cancellationReason: incomingCancellationReason,
      } = event.detail;

      console.log('📢 Order status notification received:', { message, status });

      // High-fidelity fetch to ensure rider info and route update instantly
      if (orderId) {
        orderAPI.getOrderDetails(orderId).then((response) => {
          if (response.data?.success && response.data.data?.order) {
            const apiOrder = response.data.data.order;
            setOrder((prev) => {
              const transformedOrder = {
                ...apiOrder,
                restaurantLocation: prev?.restaurantLocation || (apiOrder.restaurantId?.location?.coordinates ? {
                  coordinates: apiOrder.restaurantId.location.coordinates
                } : null),
                cancellationReason: apiOrder?.cancellationReason || apiOrder?.cancellation_reason || prev?.cancellationReason || null,
                deliveryPartner: apiOrder.deliveryPartnerId ? {
                  name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
                  avatar: null,
                  phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || apiOrder.deliveryPartnerId.mobile || apiOrder.deliveryPartnerId.contactNumber || null,
                  availability: apiOrder.deliveryPartnerId.availability || null
                } : prev?.deliveryPartner || null,
                deliveryPartnerPhone: apiOrder.deliveryPartnerId?.phone || apiOrder.deliveryPartnerId?.phoneNumber || apiOrder.deliveryPartnerId?.mobile || apiOrder.deliveryPartnerId?.contactNumber || prev?.deliveryPartnerPhone || null,
                deliveryPartnerId: apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
                assignmentInfo: apiOrder.assignmentInfo || null,
                deliveryState: apiOrder.deliveryState || null
              };
              return transformedOrder;
            });
          }
        }).catch(err => console.error('Error fetching fresh order details on socket status notification:', err));
      }

      // Keep local order object in sync so UI reacts immediately (e.g. hide cancel once READY)
      if (status) {
        setOrder((prev) => {
          if (!prev) return prev
          const next = { ...prev, status }
          const s = String(status || '').trim().toLowerCase().replace(/\s+/g, "_")
          if (["cancelled", "canceled"].includes(s)) {
            next.cancellationReason =
              incomingCancellationReason ||
              prev.cancellationReason ||
              null
          }
          return next
        });
      }

      // Update order status in UI
      const s = String(status || "").trim().toLowerCase().replace(/\s+/g, "_")
      if (["cancelled", "canceled"].includes(s)) setOrderStatus("cancelled")
      else if (["delivered", "completed"].includes(s)) setOrderStatus("delivered")
      else if (["picked_up", "pickedup"].includes(s)) setOrderStatus("picked_up")
      else if (["ready", "packed"].includes(s)) setOrderStatus("pickup")
      else if (
        [
          "out_for_delivery",
          "outfordelivery",
          "on_way",
          "on_the_way",
          "dispatched",
        ].includes(s)
      ) {
        setOrderStatus("on_way")
      } else if (s === "reached_delivery" || s === "arrived") {
        setOrderStatus("arrived")
      } else if (["preparing", "processing", "cooking", "confirmed", "accepted"].includes(s)) {
        setOrderStatus("preparing")
      } else if (s) {
        setOrderStatus("placed")
      }

      // Show notification toast
      if (message) {
        toast.success(message, {
          duration: 5000,
          icon: '🏍️',
          position: 'top-center',
          description: estimatedDeliveryTime
            ? `Estimated delivery in ${Math.round(estimatedDeliveryTime / 60)} minutes`
            : undefined
        });

        // Optional: Vibrate device if supported
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }
    };

    // Listen for custom event from DeliveryTrackingMap
    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
    };
  }, [orderId])

  const canCancelOrder = (() => {
    const s = String(order?.status || '').toLowerCase().trim()
    // Business rule: once restaurant marks READY (or beyond), customer cannot cancel.
    // Allow cancel only until PREPARING.
    return s === 'pending' || s === 'confirmed' || s === 'preparing'
  })()

  const deliveryPartnerName =
    order?.deliveryPartner?.name ||
    order?.deliveryPartnerId?.name ||
    order?.deliveryPartnerName ||
    ""

  const deliveryPartnerPhone =
    order?.deliveryPartner?.phone ||
    order?.deliveryPartnerPhone ||
    order?.deliveryPartnerId?.phone ||
    order?.deliveryPartnerId?.phoneNumber ||
    order?.deliveryPartnerId?.mobile ||
    order?.deliveryPartnerId?.contactNumber ||
    ""

  const hasAcceptedByDelivery =
    String(order?.deliveryState?.status || "").toLowerCase() === "accepted" ||
    ["en_route_to_pickup", "at_pickup", "en_route_to_delivery", "at_delivery"].includes(
      String(order?.deliveryState?.currentPhase || "").toLowerCase(),
    ) ||
    String(order?.status || "").toLowerCase() === "out_for_delivery"

  const handleCancelOrder = () => {
    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)
    if (!order) return;

    if (order.status === 'cancelled') {
      toast.error('Order is already cancelled');
      return;
    }

    if (order.status === 'delivered') {
      toast.error('Cannot cancel a delivered order');
      return;
    }

    if (!canCancelOrder) {
      toast.error('You can no longer cancel this order')
      return
    }

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    setIsCancelling(true);
    try {
      const reason = cancellationReason.trim()

      const uniq = (arr) => Array.from(new Set(arr.filter(Boolean).map(String)))
      const isLikelyWrongIdError = (err) => {
        const status = err?.response?.status
        return status === 403 || status === 404
      }

      // First attempt: use best local id guess (prefer Mongo _id if present)
      const preferredId =
        order?._id ||
        order?.id ||
        order?.orderId ||
        orderId

      let response = null
      let cancelledUsingId = String(preferredId || orderId)

      try {
        response = await orderAPI.cancelOrder(cancelledUsingId, reason)
      } catch (err) {
        // One retry on likely id mismatch (403/404): refetch once, then retry with an alternate id
        if (isLikelyWrongIdError(err)) {
          const detailsRes = await orderAPI.getOrderDetails(orderId)
          const apiOrder = detailsRes?.data?.data?.order

          const candidateIds = uniq([
            apiOrder?._id,
            apiOrder?.id,
            apiOrder?.orderId,
            order?._id,
            order?.id,
            order?.orderId,
            orderId,
          ])

          const altId = candidateIds.find((x) => x !== String(cancelledUsingId))
          if (altId) {
            cancelledUsingId = String(altId)
            response = await orderAPI.cancelOrder(cancelledUsingId, reason)
          } else {
            throw err
          }
        } else {
          throw err
        }
      }

      if (response.data?.success) {
        const paymentMethod = order?.payment?.method || order?.paymentMethod;
        const successMessage = response.data?.message ||
          (paymentMethod === 'cash' || paymentMethod === 'cod'
            ? 'Order cancelled successfully. No refund required as payment was not made.'
            : 'Order cancelled successfully. Refund will be processed after admin approval.');
        toast.success(successMessage);
        setShowCancelDialog(false);
        setCancellationReason("");
        // Refresh order data
        try {
          const orderResponse = await orderAPI.getOrderDetails(cancelledUsingId || orderId);
          if (orderResponse.data?.success && orderResponse.data.data?.order) {
            const apiOrder = orderResponse.data.data.order;
            setOrder(apiOrder);
            if (apiOrder.status === 'cancelled') setOrderStatus('cancelled');
          }
        } catch {
          // Fallback to route param id in case backend only serves one id flavor
          const orderResponse = await orderAPI.getOrderDetails(orderId);
          if (orderResponse.data?.success && orderResponse.data.data?.order) {
            const apiOrder = orderResponse.data.data.order;
            setOrder(apiOrder);
            if (apiOrder.status === 'cancelled') setOrderStatus('cancelled');
          }
        }
      } else {
        toast.error(response.data?.message || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  // Fetch restaurant phone number
  const fetchRestaurantPhone = async (restaurantId, apiOrder = null) => {
    try {
      // First check if phone is in order data (comprehensive check)
      if (apiOrder?.restaurantId?.primaryContactNumber) {
        setRestaurantPhone(apiOrder.restaurantId.primaryContactNumber)
        return
      }
      if (apiOrder?.restaurantId?.phone) {
        setRestaurantPhone(apiOrder.restaurantId.phone)
        return
      }
      if (apiOrder?.restaurantId?.ownerPhone) {
        setRestaurantPhone(apiOrder.restaurantId.ownerPhone)
        return
      }
      if (apiOrder?.restaurantPhone) {
        setRestaurantPhone(apiOrder.restaurantPhone)
        return
      }

      // Extract restaurant ID string if it's an object
      let restaurantIdString = null
      if (typeof restaurantId === 'string') {
        restaurantIdString = restaurantId
      } else if (restaurantId && typeof restaurantId === 'object') {
        // If restaurantId is an object, check for phone directly first
        const phone = restaurantId.primaryContactNumber || restaurantId.phone || restaurantId.ownerPhone || restaurantId.contactNumber || null
        if (phone) {
          setRestaurantPhone(phone)
          return
        }
        // Extract ID for API call
        restaurantIdString = restaurantId._id || restaurantId.id || restaurantId.restaurantId || null
      }

      // Fetch restaurant details from API if we have an ID
      if (restaurantIdString) {
        console.log('📞 Fetching restaurant phone for ID:', restaurantIdString)
        const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantIdString)
        if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
          const restaurant = restaurantResponse.data.data.restaurant
          // Check multiple phone fields
          const phone = restaurant.primaryContactNumber || 
                       restaurant.phone || 
                       restaurant.ownerPhone ||
                       restaurant.contactNumber || 
                       null
          if (phone) {
            console.log('✅ Found restaurant phone:', phone)
            setRestaurantPhone(phone)
          } else {
            console.warn('⚠️ Restaurant phone not found in API response:', {
              hasRestaurant: !!restaurant,
              restaurantKeys: Object.keys(restaurant || {}),
              restaurantId: restaurantIdString
            })
          }
        } else {
          console.warn('⚠️ Restaurant API response structure unexpected:', {
            success: restaurantResponse?.data?.success,
            hasData: !!restaurantResponse?.data?.data,
            hasRestaurant: !!restaurantResponse?.data?.data?.restaurant
          })
        }
      } else {
        console.warn('⚠️ Cannot fetch restaurant phone - no valid restaurantId:', restaurantId)
      }
    } catch (error) {
      console.error('❌ Error fetching restaurant phone:', error)
      // Don't show error toast, just log it - user will see "not available" message
    }
  }

  // Handle restaurant call
  const handleCallRestaurant = () => {
    if (!restaurantPhone) {
      toast.error("Restaurant phone number not available")
      return
    }
    // Remove any non-digit characters except + for international numbers
    const cleanPhone = restaurantPhone.replace(/[^\d+]/g, '')
    window.location.href = `tel:${cleanPhone}`
  }

  const handleCallDeliveryPartner = () => {
    if (!deliveryPartnerPhone) {
      toast.error("Delivery partner phone number not available")
      return
    }
    const cleanPhone = String(deliveryPartnerPhone).replace(/[^\d+]/g, "")
    window.location.href = `tel:${cleanPhone}`
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const response = await orderAPI.getOrderDetails(orderId)
      if (response.data?.success && response.data.data?.order) {
        const apiOrder = response.data.data.order

        // Extract restaurant location coordinates with multiple fallbacks
        let restaurantCoords = null;

        // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
        if (apiOrder.restaurantId?.location?.coordinates &&
          Array.isArray(apiOrder.restaurantId.location.coordinates) &&
          apiOrder.restaurantId.location.coordinates.length >= 2) {
          restaurantCoords = apiOrder.restaurantId.location.coordinates;
        }
        // Priority 2: restaurantId.location with latitude/longitude properties
        else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
          restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
        }
        // Priority 3: Check nested restaurant data
        else if (apiOrder.restaurant?.location?.coordinates) {
          restaurantCoords = apiOrder.restaurant.location.coordinates;
        }
        // Priority 4: Check if restaurantId is a string ID and fetch restaurant details
        else if (typeof apiOrder.restaurantId === 'string') {
          console.log('⚠️ restaurantId is a string ID, fetching restaurant details...', apiOrder.restaurantId);
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              const restaurant = restaurantResponse.data.data.restaurant;
              if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                restaurantCoords = restaurant.location.coordinates;
                console.log('✅ Fetched restaurant coordinates from API:', restaurantCoords);
              }
              // Also fetch restaurant phone number
              const phone = restaurant.primaryContactNumber || restaurant.phone || restaurant.contactNumber || null;
              if (phone) {
                setRestaurantPhone(phone);
              }
            }
          } catch (err) {
            console.error('❌ Error fetching restaurant details:', err);
          }
        }

        const transformedOrder = {
          id: apiOrder.orderId || apiOrder._id,
          restaurant: apiOrder.restaurantName || 'Restaurant',
          restaurantId: apiOrder.restaurantId || null, // Include restaurantId for location access
          userId: apiOrder.userId || null, // Include user data for phone number
          userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || '',
          userPhone: apiOrder.userPhone || apiOrder.userId?.phone || '',
          cancellationReason: apiOrder.cancellationReason || apiOrder.cancellation_reason || null,
          address: {
            street: apiOrder.address?.street || '',
            city: apiOrder.address?.city || '',
            state: apiOrder.address?.state || '',
            zipCode: apiOrder.address?.zipCode || '',
            additionalDetails: apiOrder.address?.additionalDetails || '',
            formattedAddress: apiOrder.address?.formattedAddress ||
              (apiOrder.address?.street && apiOrder.address?.city
                ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ''}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ''}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ''}`
                : apiOrder.address?.city || ''),
            coordinates: apiOrder.address?.location?.coordinates || null
          },
          restaurantLocation: {
            coordinates: restaurantCoords
          },
          items: apiOrder.items?.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price
          })) || [],
          total: apiOrder.pricing?.total || 0,
          status: apiOrder.status || 'pending',
          deliveryPartner: apiOrder.deliveryPartnerId ? {
            name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
            avatar: null
          } : null,
          tracking: apiOrder.tracking || {},
          estimatedDeliveryTime: apiOrder.estimatedDeliveryTime || null,
          eta: apiOrder.eta || null,
          createdAt: apiOrder.createdAt || null,
          note: apiOrder.note || '',
          deliveryInstructions:
            apiOrder.deliveryInstructions ||
            apiOrder.delivery_instructions ||
            ""
        }
        setOrder(transformedOrder)

        // Update order creation time if available
        if (apiOrder.createdAt) {
          setOrderCreatedAt(new Date(apiOrder.createdAt))
        }

        // Recalculate ETA from refreshed order data
        const calculateETA = () => {
          if (!apiOrder.createdAt) return null

          const now = new Date()
          const createdAt = new Date(apiOrder.createdAt)
          const elapsedMinutes = Math.floor((now - createdAt) / 1000 / 60)

          // Use eta.min/max if available, otherwise use estimatedDeliveryTime
          let initialETA = null
          if (apiOrder.eta?.min && apiOrder.eta?.max) {
            initialETA = apiOrder.eta.min
          } else if (apiOrder.estimatedDeliveryTime) {
            initialETA = apiOrder.estimatedDeliveryTime
          } else {
            initialETA = 30
          }

          // Cap extremely large values (e.g. from coordinates 0,0 fallback distance)
          if (initialETA > 90) {
            initialETA = 45;
          }

          const remainingTime = Math.max(0, initialETA - elapsedMinutes)
          return remainingTime
        }

        const calculatedETA = calculateETA()
        if (calculatedETA !== null) {
          setEstimatedTime(calculatedETA)
        }

        // Fetch restaurant phone number - check multiple sources
        // Priority 1: Check if phone is in populated restaurantId object
        if (apiOrder.restaurantId?.primaryContactNumber) {
          setRestaurantPhone(apiOrder.restaurantId.primaryContactNumber)
        } else if (apiOrder.restaurantId?.phone) {
          setRestaurantPhone(apiOrder.restaurantId.phone)
        } else if (apiOrder.restaurantId?.ownerPhone) {
          setRestaurantPhone(apiOrder.restaurantId.ownerPhone)
        } 
        // Priority 2: Check order-level restaurant phone
        else if (apiOrder.restaurantPhone) {
          setRestaurantPhone(apiOrder.restaurantPhone)
        }
        // Priority 3: Fetch from restaurant API if restaurantId is available
        else if (transformedOrder.restaurantId) {
          // Always try to fetch phone from restaurant API
          fetchRestaurantPhone(transformedOrder.restaurantId, apiOrder)
        }

        // Update order status for UI
        const apiStatus = String(apiOrder.status || "").toLowerCase()

        if (apiStatus === "cancelled") {
          setOrderStatus('cancelled');
          setEstimatedTime(0);
        } else if (apiStatus === "preparing") {
          setOrderStatus('preparing')
        } else if (apiStatus === "ready") {
          setOrderStatus('pickup')
        } else if (apiStatus === "out_for_delivery") {
          setOrderStatus('pickup')
        } else if (
          apiStatus === "delivered" ||
          apiStatus === "completed" ||
          String(apiOrder.deliveryState?.status || "").toLowerCase() === "delivered" ||
          String(apiOrder.deliveryState?.currentPhase || "").toLowerCase() === "completed" ||
          apiOrder.tracking?.delivered === true
        ) {
          setOrderStatus('delivered')
          setEstimatedTime(0); // Set to 0 when delivered
        }
      }
    } catch (err) {
      console.error('Error refreshing order:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Auto refresh interval triggered by manual refresh
  useEffect(() => {
    let interval;
    if (autoRefreshEnabled) {
      interval = setInterval(() => {
        handleRefresh();
      }, 10000); // 10 seconds
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled]);

  // Loading state
  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </AnimatedPage>
    )
  }

  // Error state
  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The order you\'re looking for doesn\'t exist.'}</p>
          <Link to="/orders">
            <Button>Back to Orders</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  const statusConfig = {
    placed: {
      title: "Order placed",
      subtitle: "Food preparation will begin shortly",
      color: "bg-green-700"
    },
    preparing: {
      title: "Preparing your order",
      subtitle: estimatedTime !== null && estimatedTime > 0 ? `Arriving in ${estimatedTime} mins` : "Food preparation will begin shortly",
      color: "bg-green-700"
    },
    pickup: {
      title: "Order ready",
      subtitle: estimatedTime !== null && estimatedTime > 0 ? `Arriving in ${estimatedTime} mins` : "On the way",
      color: "bg-green-700"
    },
    picked_up: {
      title: "Order picked up",
      subtitle:
        estimatedTime !== null && estimatedTime > 0
          ? `Arriving in ${estimatedTime} mins`
          : "Your delivery partner is on the way",
      color: "bg-green-700",
    },
    on_way: {
      title: "Food On the way",
      subtitle:
        estimatedTime !== null && estimatedTime > 0
          ? `Arriving in ${estimatedTime} mins`
          : "Your delivery partner is on the way",
      color: "bg-green-700",
    },
    arrived: {
      title: "Rider Arrived",
      subtitle: "Your delivery partner has reached the drop location!",
      color: "bg-green-700",
    },
    delivered: {
      title: "Order delivered",
      subtitle: "Enjoy your meal!",
      color: "bg-green-600"
    },
    cancelled: {
      title: "Order cancelled",
      subtitle: order?.cancellationReason
        ? `Reason: ${order.cancellationReason}`
        : "This order has been cancelled",
      color: "bg-red-600"
    }
  }

  const currentStatus = statusConfig[orderStatus] || statusConfig.placed

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
      {/* Order Confirmed Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white dark:bg-[#1a1a1a] flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-center px-8"
            >
              <AnimatedCheckmark delay={0.3} />
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="text-2xl font-bold text-gray-900 mt-6"
              >
                Order Confirmed!
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                className="text-gray-600 mt-2"
              >
                Your order has been placed successfully
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="mt-8"
              >
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500 mt-3">Loading order details...</p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Green Header */}
      {true && (
        <motion.div
          className={`${currentStatus.color} text-white sticky top-0 z-40`}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
        >
           {/* Navigation bar */}
           <div className="flex items-center px-4 pt-7 pb-3 relative">
             <Link to="/orders" className="absolute left-4">
               <motion.button
                 className="w-10 h-10 flex items-center justify-center"
                 whileTap={{ scale: 0.9 }}
               >
                 <ArrowLeft className="w-6 h-6" />
               </motion.button>
             </Link>
             <h2 className="font-semibold text-lg flex-1 text-center">
               {(order.restaurant === "Indore" ? (order.restaurantName || "Restaurant") : order.restaurant)}
             </h2>
           </div>

          {/* Status section */}
          <div className="px-4 pb-4 text-center">
            <motion.h1
              className="text-2xl font-bold mb-3"
              key={currentStatus.title}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {currentStatus.title}
            </motion.h1>

            {/* Status pill */}
            <motion.div
              className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span className="text-sm">{currentStatus.subtitle}</span>
              {orderStatus === 'preparing' && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white" />
                  <span className="text-sm text-green-200">On time</span>
                </>
              )}
              <motion.button
                onClick={() => {
                  if (!autoRefreshEnabled) {
                    setAutoRefreshEnabled(true);
                    handleRefresh();
                  }
                }}
                className={`ml-1 ${autoRefreshEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                animate={{ rotate: isRefreshing ? 360 : 0 }}
                transition={{ duration: 0.5 }}
                disabled={autoRefreshEnabled}
              >
                <RefreshCw className="w-4 h-4" />
              </motion.button>
            </motion.div>

            <AnimatePresence>
              {autoRefreshEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 text-[13px] text-white/90"
                >
                  Order status auto refreshes every 10 seconds
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Map Section - hide completely when delivered OR cancelled (all variants) */}
      {(() => {
        const raw = (order?.status || orderStatus || '').toString().toLowerCase()
        const isDelivered = raw === 'delivered' || raw === 'completed'
        const isCancelled = raw === 'cancelled' || raw === 'canceled' || raw === 'restaurant_cancelled'
        if (isDelivered || isCancelled) return null
        return (
        <DeliveryMap
          orderId={orderId}
          order={order}
          isVisible={!showConfirmation && order !== null}
        />
        )
      })()}

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6 pb-24 md:pb-32">
        {/* Advertise Banner (Admin Controlled) */}
        {advertiseBanner?.imageUrl && (
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
          >
            <img
              src={advertiseBanner.imageUrl}
              alt="Offer banner"
              className="w-full rounded-xl shadow-sm object-cover"
              loading="lazy"
              onError={() => setAdvertiseBanner(null)}
            />
          </motion.div>
        )}

        {/* Contact & Address Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <SectionItem
            icon={Phone}
            title={
              order?.userName ||
              order?.userId?.fullName ||
              order?.userId?.name ||
              profile?.fullName ||
              profile?.name ||
              'Customer'
            }
            subtitle={
              order?.userPhone ||
              order?.userId?.phone ||
              profile?.phone ||
              defaultAddress?.phone ||
              'Phone number not available'
            }
            showArrow={false}
          />
          <SectionItem
            icon={HomeIcon}
            title="Delivery at Location"
            subtitle={deliveryAddressText}
            onClick={() => setShowAddressDialog(true)}
          />
          <SectionItem
            icon={MessageSquare}
            title="Add delivery instructions"
            subtitle={
              order?.deliveryInstructions
                ? order.deliveryInstructions
                : "Leave a note for the delivery partner"
            }
            onClick={() => {
              if (order?.status === "delivered" || order?.status === "cancelled") return
              setInstructionsText(order?.deliveryInstructions || "")
              setShowInstructionsDialog(true)
            }}
            showArrow={order?.status !== "delivered" && order?.status !== "cancelled"}
          />
          {order?.deliveryPartnerId && hasAcceptedByDelivery && (
            <SectionItem
              icon={MessageSquare}
              title={deliveryPartnerName || "Delivery partner"}
              subtitle="Chat or call your delivery partner"
              onClick={() => {
                const orderIdForChat = order?._id || orderId
                if (orderIdForChat) {
                  navigate(`/user/orders/${orderIdForChat}/chat`)
                } else {
                  toast.error("Order ID not available")
                }
              }}
              showArrow={false}
              rightContent={
                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const orderIdForChat = order?._id || orderId
                      if (orderIdForChat) {
                        navigate(`/user/orders/${orderIdForChat}/chat`)
                      } else {
                        toast.error("Order ID not available")
                      }
                    }}
                    className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                    whileTap={{ scale: 0.9 }}
                    title="Chat"
                  >
                    <MessageSquare className="w-5 h-5 text-gray-700" />
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleCallDeliveryPartner()
                    }}
                    className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 transition-colors"
                    whileTap={{ scale: 0.9 }}
                    title="Call"
                  >
                    <Phone className="w-5 h-5 text-green-700" />
                  </motion.button>
                </div>
              }
            />
          )}
        </motion.div>

        {/* Restaurant Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <div className="flex items-center gap-3 p-4 border-b border-dashed border-gray-200">
            <div className="w-12 h-12 rounded-full bg-orange-100 overflow-hidden flex items-center justify-center">
              <span className="text-2xl">🍔</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                {isHotelOrder ? (order.hotelName || 'Hotel') : (order.restaurant === "Indore" ? (order.restaurantName || "Restaurant") : order.restaurant)}
              </p>
              <p className="text-sm text-gray-500">
                {isHotelOrder ? 'Ordered via Hotel' : (order.address?.city || 'Local Area')}
              </p>
            </div>
            <motion.button
              onClick={handleCallRestaurant}
              className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center hover:bg-green-200 transition-colors"
              whileTap={{ scale: 0.9 }}
              title="Call restaurant"
            >
              <Phone className="w-5 h-5 text-green-700" />
            </motion.button>
          </div>

          {/* Order Items - Clickable */}
          <Link to={`/user/orders/${order?.id || order?.orderId || orderId}/details`}>
            <div className="p-4 border-b border-dashed border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <Receipt className="w-5 h-5 text-gray-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Order #{order?.id || order?.orderId || 'N/A'}</p>
                  <div className="mt-2 space-y-1">
                    {order?.items?.map((item, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-4 h-4 rounded border border-green-600 flex items-center justify-center">
                          <span className="w-2 h-2 rounded-full bg-green-600" />
                        </span>
                        <span>{item.quantity} x {item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Help Section - Cancel order hidden */}

      </div>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Cancel Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-6 px-2">
            <div className="space-y-2 w-full">
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="e.g., Changed my mind, Wrong address, etc."
                className="w-full min-h-[100px] resize-none border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200"
                disabled={isCancelling}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelDialog(false);
                  setCancellationReason("");
                }}
                disabled={isCancelling}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmCancel}
                disabled={isCancelling || !cancellationReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery Instructions Dialog */}
      <Dialog open={showInstructionsDialog} onOpenChange={setShowInstructionsDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Delivery Instructions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-6 px-2">
            <p className="text-sm text-gray-600">
              Add instructions for the delivery partner (e.g. &quot;Ring the bell&quot;, &quot;Leave at door&quot;, &quot;Call on arrival&quot;).
            </p>
            <div className="space-y-2 w-full">
              <Textarea
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
                placeholder="e.g., Ring the bell twice, Leave at door, Call on arrival"
                className="w-full min-h-[100px] resize-none border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200"
                disabled={isSavingInstructions}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowInstructionsDialog(false)
                  setInstructionsText("")
                }}
                disabled={isSavingInstructions}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!orderId || isSavingInstructions) return
                  setIsSavingInstructions(true)
                  try {
                    const response = await orderAPI.updateDeliveryInstructions(orderId, instructionsText)
                    if (response.data?.success) {
                      setOrder((prev) =>
                        prev
                          ? { ...prev, deliveryInstructions: instructionsText.trim() }
                          : prev
                      )
                      setShowInstructionsDialog(false)
                      setInstructionsText("")
                      toast.success("Delivery instructions updated")
                    } else {
                      toast.error(response.data?.message || "Failed to update")
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.message || err.message || "Failed to update")
                  } finally {
                    setIsSavingInstructions(false)
                  }
                }}
                disabled={isSavingInstructions}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {isSavingInstructions ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery Address Dialog */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Delivery Address
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 px-2 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-gray-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">Delivery at Location</p>
                <p className="text-sm text-gray-600 break-words">{deliveryAddressText}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setShowAddressDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
