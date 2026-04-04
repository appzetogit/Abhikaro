Razorpay Test-Mode E2E (manual)

Prereqs:
- Set `RAZORPAY_API_KEY` and `RAZORPAY_SECRET_KEY` to Razorpay test keys
- Set `RAZORPAY_WEBHOOK_SECRET`
- Expose backend via a tunnel and configure Razorpay Webhook to `POST /api/payment/razorpay/webhook`
- Ensure `ENABLE_PAID_ORDER_VISIBILITY_FIX=true`

Steps:
1) Create a cart in app, hit `POST /api/payment/razorpay/order`
2) Complete payment using Razorpay test card on client
3) Confirm webhook 200 OK and logs show intent and order IDs
4) Restaurant app/API `GET /api/restaurant/orders` should include the new order with status `confirmed`
5) Repeat to confirm idempotency (no duplicate orders)

