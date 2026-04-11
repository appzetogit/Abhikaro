/**
 * E2E matrix for delivery "Order delivered" payment line (pure logic, no server).
 * Run: npm run test:delivery-payment-labels
 */
import {
  getDeliveryPaymentKind,
  getDeliveryPaymentLabel,
} from "../src/module/delivery/utils/deliveryPaymentLabels.js";

function assert(caseId, ok, detail) {
  if (!ok) {
    throw new Error(`Case ${caseId} failed: ${detail}`);
  }
}

// 1) Normal user — Razorpay (no hotel flags)
let k = getDeliveryPaymentKind({
  paymentMethod: "razorpay",
  orderType: "DIRECT",
  total: 347,
});
assert(
  1,
  k === "online" && getDeliveryPaymentLabel(k) === "Paid online (prepaid)",
  `expected online+label, got ${k} / ${getDeliveryPaymentLabel(k)}`,
);

// 2) Normal user — Wallet
k = getDeliveryPaymentKind({
  paymentMethod: "wallet",
  total: 100,
});
assert(
  2,
  k === "online",
  `normal wallet should be generic online kind, got ${k}`,
);

// 3) Hotel QR — prepaid online (Razorpay + hotel context)
k = getDeliveryPaymentKind({
  paymentMethod: "razorpay",
  orderType: "QR",
  hotelReference: "507f1f77bcf86cd799439011",
  total: 347,
});
assert(
  3,
  k === "hotel_online" &&
    getDeliveryPaymentLabel(k) === "Already paid · Hotel (online)",
  `expected hotel_online, got ${k} / ${getDeliveryPaymentLabel(k)}`,
);

// 4) Hotel QR — Pay at hotel
k = getDeliveryPaymentKind({
  paymentMethod: "pay_at_hotel",
  orderType: "QR",
  hotelReference: "507f1f77bcf86cd799439011",
  total: 347,
});
assert(
  4,
  k === "pay_at_hotel" && getDeliveryPaymentLabel(k) === "Pay at Hotel",
  `expected pay_at_hotel, got ${k}`,
);

// 5) COD (regression)
k = getDeliveryPaymentKind({ paymentMethod: "cash", total: 200 });
assert(5, k === "cod", `cod kind expected, got ${k}`);

console.log("delivery-payment-labels: all cases passed");
