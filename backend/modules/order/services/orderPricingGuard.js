import mongoose from "mongoose";
import Order from "../models/Order.js";
import Menu from "../../restaurant/models/Menu.js";
import AdminPromoCode from "../../admin/models/AdminPromoCode.js";
import AdminCategoryManagement from "../../admin/models/AdminCategoryManagement.js";
import { calculateOrderPricing } from "./orderCalculationService.js";

/**
 * SECURITY: real money is charged on pricing.total, so client prices, discounts and total
 * are never trusted. Every order path (createOrder, Razorpay intent) must go through
 * verifyOrderPricing and use ONLY the pricing it returns.
 */

/**
 * Returns an error message if any order item is unknown, has a bad quantity, or is priced
 * below the lowest legit price in the restaurant's menu (base, discounted or variant price).
 * ponytail: floor check, not exact match — the cart derives price several ways
 * (discount/variant/category dish); switch to exact server prices once the cart sends
 * only menu ids + variant ids.
 */
export const findUnderpricedItem = (items, menu) => {
  const menuItems = {};
  for (const sec of menu?.sections || []) {
    const all = [...(sec.items || []), ...(sec.subsections || []).flatMap((s) => s.items || [])];
    for (const it of all) if (it?.id) menuItems[it.id] = it;
  }
  const addons = {};
  for (const a of menu?.addons || []) if (a?.id) addons[a.id] = a;

  for (const item of items) {
    const id = item.itemId || item.id;
    const name = item.name || "item";
    const qty = Number(item.quantity ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) return `Invalid quantity for "${name}"`;
    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0) return `Invalid price for "${name}"`;

    let floor;
    const menuItem = menuItems[id];
    if (menuItem) {
      const candidates = [Number(menuItem.price)];
      const orig = Number(menuItem.originalPrice);
      const disc = Number(menuItem.discountAmount);
      if (orig > 0 && disc > 0) {
        candidates.push(menuItem.discountType === "Fixed" ? orig - disc : orig - (orig * disc) / 100);
      }
      for (const v of menuItem.variations || []) if (Number(v.price) > 0) candidates.push(Number(v.price));
      floor = Math.max(0, Math.min(...candidates.filter(Number.isFinite)));
    } else if (addons[id]) {
      floor = Number(addons[id].price) || 0;
    } else {
      return `"${name}" is no longer available. Please refresh your cart.`;
    }
    if (price < floor - 1) return `Price of "${name}" has changed. Please refresh your cart.`;
  }
  return null;
};

const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });

/**
 * Recompute the whole bill on the server and compare with what the client showed.
 * @returns {Promise<{ok:true, pricing:Object} | {ok:false, status:number, message:string, code?:string, data?:Object}>}
 */
export const verifyOrderPricing = async ({
  items,
  clientPricing,
  restaurant,
  address,
  deliveryFleet = "standard",
  userId,
  menu,
  logger = console,
}) => {
  if (!Array.isArray(items) || items.length === 0) return fail(400, "Order must have at least one item");
  if (!clientPricing || !(Number(clientPricing.total) > 0)) return fail(400, "Order total is required");
  if (!restaurant?._id) return fail(404, "Restaurant not found");

  const restaurantMenu = menu !== undefined ? menu : await Menu.findOne({ restaurant: restaurant._id }).lean();
  const priceError = findUnderpricedItem(items, restaurantMenu);
  if (priceError) {
    logger.warn?.(`🚫 Order rejected (item price check): ${priceError}`, { userId, restaurantId: restaurant._id });
    return fail(400, priceError);
  }

  const clientPromoCode =
    clientPricing.couponCode ||
    (!clientPricing.adminOfferCategoryId ? clientPricing.adminOfferName : null) ||
    null;
  const serverPricing = await calculateOrderPricing({
    items,
    restaurantId: restaurant._id.toString(),
    deliveryAddress: address,
    couponCode: clientPromoCode,
    deliveryFleet: deliveryFleet || "standard",
    userId,
  });

  // Admin promo: client claimed one but server says it does not apply → reject
  const clientClaimedPromo =
    Number(clientPricing.adminOfferDiscount) > 0 && clientPricing.adminOfferName && !clientPricing.adminOfferCategoryId;
  if (clientClaimedPromo && !(serverPricing.adminOfferDiscount > 0)) {
    return fail(
      400,
      `Promo code '${String(clientPricing.adminOfferName).toUpperCase()}' cannot be applied to this order. Please refresh your cart.`,
    );
  }

  // Admin promo per-user usage limit
  if (serverPricing.adminOfferDiscount > 0 && serverPricing.adminOfferName) {
    const promoDoc = await AdminPromoCode.findOne({ code: serverPricing.adminOfferName }).lean();
    if (promoDoc?.usageLimitPerUser > 0) {
      const used = await Order.countDocuments({
        userId,
        "pricing.adminOfferName": promoDoc.code,
        status: { $ne: "cancelled" },
      });
      if (used >= promoDoc.usageLimitPerUser) {
        return fail(
          400,
          `You have already used promo code '${promoDoc.code}' the maximum of ${promoDoc.usageLimitPerUser} time(s).`,
        );
      }
    }
  }

  // Admin category offer (flat % on full bill): percentage comes from DB, never from client
  let categoryOfferDiscount = 0;
  let categoryOffer = null;
  const categoryOfferId = clientPricing.categoryOfferId || clientPricing.adminOfferCategoryId || null;
  if (categoryOfferId) {
    if (!mongoose.Types.ObjectId.isValid(String(categoryOfferId))) return fail(400, "Invalid category offer");
    const categoryDoc = await AdminCategoryManagement.findById(categoryOfferId)
      .select("name status offerPercentage offerUsageLimitPerDay")
      .lean();
    const percent = categoryDoc && categoryDoc.status !== false ? Number(categoryDoc.offerPercentage) || 0 : 0;
    // Same keyword match the cart uses: category name or any of its words in item category/name
    const lowerName = String(categoryDoc?.name || "").toLowerCase();
    const keywords = [lowerName, ...lowerName.split(/[\s-]+/)].filter(Boolean);
    const cartHasCategory = items.some((it) => {
      const cat = String(it.category || "").toLowerCase();
      const name = String(it.name || "").toLowerCase();
      return keywords.some((kw) => cat.includes(kw) || name.includes(kw));
    });
    if (percent <= 0 || !cartHasCategory) {
      return fail(
        400,
        `The "${categoryDoc?.name || "category"}" offer is not applicable to this order. Please refresh your cart.`,
      );
    }

    const usageLimit = typeof categoryDoc.offerUsageLimitPerDay === "number" ? categoryDoc.offerUsageLimitPerDay : 1;
    if (usageLimit > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const used = await Order.countDocuments({
        userId,
        "pricing.adminOfferCategoryId": categoryDoc._id,
        createdAt: { $gte: startOfDay },
      });
      if (used >= usageLimit) {
        return fail(
          400,
          `You have already used the "${categoryDoc.name}" offer the maximum of ${usageLimit} time(s) today.`,
        );
      }
    }

    const billBeforeDiscounts =
      serverPricing.subtotal + serverPricing.deliveryFee + serverPricing.platformFee + serverPricing.tax;
    categoryOfferDiscount = Math.round(((billBeforeDiscounts * percent) / 100) * 100) / 100;
    categoryOffer = { id: categoryDoc._id, name: categoryDoc.name, percent };
  }

  const promoDiscount = serverPricing.adminOfferDiscount || 0;
  const serverTotal = Math.max(
    0,
    Math.round(
      serverPricing.subtotal -
        serverPricing.discount -
        promoDiscount -
        categoryOfferDiscount +
        serverPricing.deliveryFee +
        serverPricing.platformFee +
        serverPricing.tax,
    ),
  );

  // Client showed the user a different amount → don't silently charge something else
  if (Math.abs(serverTotal - Number(clientPricing.total)) > 1) {
    logger.warn?.("🚫 Order rejected: client total does not match server total", {
      userId,
      restaurantId: restaurant._id,
      clientTotal: clientPricing.total,
      serverTotal,
      clientAdminOfferDiscount: clientPricing.adminOfferDiscount,
      serverPromoDiscount: promoDiscount,
      categoryOfferDiscount,
    });
    return fail(
      409,
      `Order amount has changed. Correct payable amount is ₹${serverTotal}. Please refresh your cart and try again.`,
      { code: "PRICE_MISMATCH", data: { total: serverTotal } },
    );
  }

  return {
    ok: true,
    pricing: {
      subtotal: serverPricing.subtotal,
      discount: serverPricing.discount,
      deliveryFee: serverPricing.deliveryFee,
      platformFee: serverPricing.platformFee,
      tax: serverPricing.tax,
      total: serverTotal,
      couponCode: serverPricing.appliedCoupon?.code || null,
      eta: serverPricing.eta || null,
      // Platform-funded discount (promo + category offer) — deducted from admin commission
      adminOfferDiscount: Math.round((promoDiscount + categoryOfferDiscount) * 100) / 100,
      adminOfferName: serverPricing.adminOfferName || categoryOffer?.name || null,
      adminOfferPercent: serverPricing.adminOfferName ? serverPricing.adminOfferPercent : categoryOffer?.percent || 0,
      ...(categoryOffer ? { adminOfferCategoryId: categoryOffer.id } : {}),
    },
  };
};
