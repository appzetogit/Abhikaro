// Self-check for server-side order price guard. Run: node backend/scratch/test_order_price_guard.js
import assert from "node:assert/strict";
import { findUnderpricedItem } from "../modules/order/services/orderPricingGuard.js";

const menu = {
  sections: [
    {
      items: [
        { id: "palak", price: 290 },
        { id: "pizza", price: 300, variations: [{ id: "s", price: 200 }, { id: "l", price: 400 }] },
        { id: "promo", price: 250, originalPrice: 250, discountAmount: 20, discountType: "Percent" },
      ],
      subsections: [{ items: [{ id: "roti", price: 22 }] }],
    },
  ],
  addons: [{ id: "raita", price: 40 }],
};

const ok = (items) => assert.equal(findUnderpricedItem(items, menu), null);
const bad = (items, re) => assert.match(findUnderpricedItem(items, menu), re);

ok([{ itemId: "palak", price: 290, quantity: 1 }, { itemId: "roti", price: 22, quantity: 10 }]);
ok([{ itemId: "pizza", price: 200, quantity: 1 }]); // cheapest variant
ok([{ itemId: "promo", price: 200, quantity: 1 }]); // 20% item discount
ok([{ itemId: "raita", price: 40, quantity: 2 }]); // addon
bad([{ itemId: "palak", price: 10, quantity: 1 }], /changed/); // tampered price
bad([{ itemId: "raita", price: 1, quantity: 1 }], /changed/);
bad([{ itemId: "ghost", price: 1, quantity: 1 }], /no longer available/);
bad([{ itemId: "palak", price: 290, quantity: -3 }], /quantity/);
bad([{ itemId: "palak", price: 290, quantity: 1.5 }], /quantity/);
bad([{ itemId: "palak", price: "abc", quantity: 1 }], /price/);

// The ORD-1795715211631-547 bill with INSTANT5 (5%) done right
const subtotal = 1100, promo = (subtotal * 5) / 100, platform = 12, tax = 55;
assert.equal(Math.round(subtotal - promo + 0 + platform + tax), 1112);

console.log("✅ order price guard checks passed");
process.exit(0);
