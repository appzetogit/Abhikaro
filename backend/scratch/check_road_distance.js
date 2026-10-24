// Check: rider payout distance must be ROAD distance, not straight line.
// Run: node scratch/check_road_distance.js   (needs internet for OSRM, no DB)
import assert from "node:assert";
import { resolveDeliveryDistanceKm, calculateHaversineDistance } from "../modules/delivery/utils/earningsCalculator.js";

// Khatu order from the bug report: customer pin + a restaurant point ~0.9 km away in a straight line
const restCoords = [75.4102, 27.3635]; // [lng, lat]
const order = { address: { location: { coordinates: [75.415746, 27.356953] } } }; // no _id → no DB write

const straight = calculateHaversineDistance(27.3635, 75.4102, 27.356953, 75.415746);
const road = await resolveDeliveryDistanceKm(order, restCoords);
console.log({ straight: straight.toFixed(2), road });

assert.strictEqual(road.method, "osrm", "OSRM should answer for valid Khatu coordinates");
assert.ok(road.distance > straight, "road distance must be longer than the straight line");
assert.strictEqual(order.assignmentInfo.distanceMethod, "osrm", "distance should be cached on the order");

// Second call reuses the stored value (no network)
assert.deepStrictEqual(await resolveDeliveryDistanceKm(order, restCoords), road);

// Invalid coords → 0, never a bogus payout
assert.strictEqual((await resolveDeliveryDistanceKm({ address: { location: { coordinates: [0, 0] } } }, restCoords)).distance, 0);

console.log("✅ road distance check passed");
process.exit(0);
