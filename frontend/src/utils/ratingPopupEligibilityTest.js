function getDeliveredAtValue(order) {
  return (
    order?.deliveredAt ||
    order?.delivered_on ||
    order?.deliveredOn ||
    order?.delivered_on_at ||
    null
  );
}

function isDelivered(order) {
  const status = order?.status;
  const deliveredAt = getDeliveredAtValue(order);
  const deliveryDelivered =
    order?.tracking?.delivered === true ||
    order?.tracking?.delivered?.status === true ||
    order?.deliveryState?.status === "delivered" ||
    order?.deliveryState?.currentPhase === "completed";

  return (
    status === "delivered" ||
    status === "completed" ||
    deliveryDelivered ||
    (deliveredAt !== null && deliveredAt !== undefined && deliveredAt !== "")
  );
}

function hasRated(order) {
  const rating =
    order?.review?.rating ?? order?.rating ?? order?.review?.review?.rating;
  return rating !== null && rating !== undefined && Number(rating) > 0;
}

function getOrderId(order) {
  return order?.orderId || order?._id?.toString?.() || order?.id;
}

function computeCandidate(orders, ratedOrderIds) {
  const ratedSet = new Set(ratedOrderIds || []);
  const candidates = (orders || [])
    .filter((order) => {
      const orderId = getOrderId(order);
      if (!orderId) return false;
      if (ratedSet.has(orderId)) return false;
      if (!isDelivered(order)) return false;
      if (hasRated(order)) return false;
      return true;
    })
    .map((order) => ({
      order,
      orderId: getOrderId(order),
      deliveredTs: getDeliveredAtValue(order)
        ? new Date(getDeliveredAtValue(order)).getTime()
        : 0,
    }))
    .sort((a, b) => (a.deliveredTs || 0) - (b.deliveredTs || 0));

  return candidates[0] || null;
}

function assertCase(name, condition) {
  if (!condition) {
    throw new Error(`FAILED: ${name}`);
  }
  console.log(`PASS: ${name}`);
}

function run() {
  const orders = [
    {
      orderId: "ORD-100",
      status: "out_for_delivery",
      deliveredAt: null,
    },
    {
      orderId: "ORD-101",
      status: "delivered",
      deliveredAt: "2026-03-21T10:00:00.000Z",
      review: null,
    },
    {
      orderId: "ORD-102",
      status: "delivered",
      deliveredAt: "2026-03-21T10:05:00.000Z",
      review: { rating: 5 },
    },
  ];

  const candidate1 = computeCandidate(orders, []);
  assertCase("unrated delivered order is eligible", candidate1?.orderId === "ORD-101");

  const candidate2 = computeCandidate(orders, ["ORD-101"]);
  assertCase("rated/deduped order is excluded", candidate2 === null);

  const candidate3 = computeCandidate(
    [
      {
        _id: "67f9fc2be9b8f5a4dff00111",
        status: "out_for_delivery",
        tracking: { delivered: { status: true } },
      },
    ],
    []
  );
  assertCase("tracking.delivered.status true is treated as delivered", Boolean(candidate3));
}

run();
