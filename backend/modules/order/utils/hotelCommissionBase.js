/**
 * Commissionable food subtotal for hotel QR commission (same basis as createOrder QR split).
 * Prefer `pricing.subtotal`; if missing (legacy), derive from total and fee lines:
 * total = subtotal - discount + deliveryFee + platformFee + tax
 * ⇒ subtotal = total + discount - deliveryFee - platformFee - tax
 * (adminOfferDiscount reduces what user pays; include in reconstruction when present.)
 */
export function getHotelCommissionableSubtotal(order) {
  const p = order?.pricing;
  if (!p || typeof p !== "object") return 0;

  if (typeof p.subtotal === "number" && !Number.isNaN(p.subtotal)) {
    return Math.round(p.subtotal * 100) / 100;
  }

  const total = typeof p.total === "number" && !Number.isNaN(p.total) ? p.total : 0;
  const discount = typeof p.discount === "number" ? p.discount : 0;
  const deliveryFee = typeof p.deliveryFee === "number" ? p.deliveryFee : 0;
  const platformFee = typeof p.platformFee === "number" ? p.platformFee : 0;
  const tax = typeof p.tax === "number" ? p.tax : 0;
  const adminOfferDiscount =
    typeof p.adminOfferDiscount === "number" ? p.adminOfferDiscount : 0;

  const derived =
    total + discount + adminOfferDiscount - deliveryFee - platformFee - tax;

  if (typeof derived === "number" && derived > 0) {
    return Math.round(derived * 100) / 100;
  }

  if (Array.isArray(order?.items) && order.items.length) {
    const sum = order.items.reduce((s, it) => {
      const price = Number(it.price) || 0;
      const qty = Number(it.quantity) || 1;
      return s + price * qty;
    }, 0);
    if (sum > 0) return Math.round(sum * 100) / 100;
  }

  return Math.round(total * 100) / 100;
}

/** Hotel share for dashboard / stats — always from commissionable subtotal × %. */
export function getHotelCommissionFromOrder(order, hotelPct) {
  const pct =
    typeof hotelPct === "number" && hotelPct > 0 ? hotelPct : 10;
  const base = getHotelCommissionableSubtotal(order);
  return Math.round(((base * pct) / 100) * 100) / 100;
}
