/**
 * Accept an order as a restaurant via API.
 *
 * Usage (login via email/password):
 *   node scripts/accept-restaurant-order.js --baseUrl http://localhost:5000 --email you@x.com --password "pass" --orderId ORD-123 --prep 25
 *
 * Usage (use existing access token):
 *   node scripts/accept-restaurant-order.js --baseUrl http://localhost:5000 --token "<JWT>" --orderId ORD-123
 *
 * Env alternatives:
 *   BASE_URL, RESTAURANT_EMAIL, RESTAURANT_PASSWORD, RESTAURANT_TOKEN, ORDER_ID, PREP_TIME
 */

import axios from "axios";

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function requireValue(label, value) {
  if (!value) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value;
}

async function restaurantLogin({ baseUrl, email, password }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/restaurant/auth/login`;
  const res = await axios.post(
    url,
    { email, password },
    { headers: { "Content-Type": "application/json" }, timeout: 30_000 },
  );
  const token = res?.data?.data?.accessToken;
  if (!token) {
    throw new Error(
      `Login succeeded but accessToken missing. Response keys: ${Object.keys(res?.data || {}).join(", ")}`,
    );
  }
  return token;
}

async function acceptOrder({ baseUrl, token, orderId, preparationTime }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/restaurant/orders/${encodeURIComponent(orderId)}/accept`;
  const body = {};
  if (preparationTime != null && preparationTime !== "") {
    body.preparationTime = preparationTime;
  }

  const res = await axios.patch(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 30_000,
  });

  return res.data;
}

async function main() {
  const baseUrl = getArg("baseUrl") || process.env.BASE_URL || "http://localhost:5000";
  const orderId = getArg("orderId") || process.env.ORDER_ID;
  const prepRaw = getArg("prep") ?? process.env.PREP_TIME;
  const preparationTime =
    prepRaw == null || prepRaw === "" ? undefined : Number.parseInt(String(prepRaw), 10);

  let token = getArg("token") || process.env.RESTAURANT_TOKEN;
  const email = getArg("email") || process.env.RESTAURANT_EMAIL;
  const password = getArg("password") || process.env.RESTAURANT_PASSWORD;

  requireValue("orderId (--orderId or ORDER_ID)", orderId);

  if (!token) {
    requireValue("email (--email or RESTAURANT_EMAIL)", email);
    requireValue("password (--password or RESTAURANT_PASSWORD)", password);
    token = await restaurantLogin({ baseUrl, email, password });
  }

  const data = await acceptOrder({ baseUrl, token, orderId, preparationTime });
  // API uses { success, message, data: { order } }
  const msg = data?.message || "OK";
  const status = data?.data?.order?.status;
  const oid = data?.data?.order?.orderId || data?.data?.order?._id;

  console.log(
    JSON.stringify(
      {
        message: msg,
        orderId: oid,
        status,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  const status = err?.response?.status;
  const body = err?.response?.data;
  console.error("❌ Failed to accept order");
  if (status) console.error(`HTTP ${status}`);
  if (body) console.error(JSON.stringify(body, null, 2));
  console.error(err?.message || err);
  process.exit(1);
});

