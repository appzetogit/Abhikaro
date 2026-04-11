/**
 * Delivery partner "Order delivered" popup — payment line classification.
 * Keep in sync with product: normal prepaid vs hotel QR prepaid vs pay-at-hotel vs COD.
 */

/** @typedef {'cod' | 'pay_at_hotel' | 'hotel_online' | 'online'} DeliveryPaymentKind */

/**
 * @param {Record<string, unknown> | null | undefined} selectedRestaurant
 * @returns {DeliveryPaymentKind}
 */
export function getDeliveryPaymentKind(selectedRestaurant) {
  const rawMethod =
    selectedRestaurant?.paymentMethod ??
    selectedRestaurant?.payment?.method ??
    "";
  const m = String(rawMethod).toLowerCase().trim();
  const isCod =
    m === "cash" || m === "cod" || m === "cash on delivery";
  const isPayAtHotel = m === "pay_at_hotel" || m === "pay at hotel";
  const isHotelQrOnline =
    !isCod &&
    !isPayAtHotel &&
    (String(selectedRestaurant?.orderType || "").toUpperCase() === "QR" ||
      !!selectedRestaurant?.hotelReference ||
      !!selectedRestaurant?.hotelId);

  if (isCod) return "cod";
  if (isPayAtHotel) return "pay_at_hotel";
  if (isHotelQrOnline) return "hotel_online";
  return "online";
}

const LABELS = {
  cod: "Collect from customer (COD)",
  pay_at_hotel: "Pay at Hotel",
  hotel_online: "Already paid · Hotel (online)",
  online: "Paid online (prepaid)",
};

/**
 * @param {DeliveryPaymentKind} kind
 * @returns {string}
 */
export function getDeliveryPaymentLabel(kind) {
  return LABELS[kind] ?? LABELS.online;
}
