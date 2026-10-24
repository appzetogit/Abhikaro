
import DeliveryBoyCommission from "../../admin/models/DeliveryBoyCommission.js";
import Order from "../../order/models/Order.js";

/**
 * Calculate Haversine distance between two points in km
 */
export function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  // Safety guard: if coordinates are invalid, empty, or default [0, 0] (Null Island)
  if (!lat1 || !lng1 || !lat2 || !lng2 || 
      Number(lat1) === 0 || Number(lng1) === 0 || Number(lat2) === 0 || Number(lng2) === 0 ||
      (Math.abs(Number(lat1)) < 0.0001 && Math.abs(Number(lng1)) < 0.0001) ||
      (Math.abs(Number(lat2)) < 0.0001 && Math.abs(Number(lng2)) < 0.0001)) {
    return 0;
  }
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  // If calculated distance is physically impossible for local delivery, treat as invalid
  return distance > 100 ? 0 : distance;
}

/**
 * Road distance (km) from restaurant to customer — what the rider actually drives.
 * Straight-line (Haversine) under-counts: 0.9 km straight was 1.5 km by road.
 * Once computed it is stored on order.assignmentInfo (distanceMethod: 'osrm') and reused,
 * so popup estimate, wallet credit and admin split all use the same number.
 * @param {Object} order - needs address.location.coordinates and optionally assignmentInfo
 * @param {Array} restCoords - restaurant [lng, lat]
 * @returns {Promise<{distance: number, method: string}>}
 */
export async function resolveDeliveryDistanceKm(order, restCoords) {
  const stored = Number(order?.assignmentInfo?.distance) || 0;
  if (order?.assignmentInfo?.distanceMethod === 'osrm' && stored > 0) {
    return { distance: stored, method: 'osrm' };
  }

  const custCoords = order?.address?.location?.coordinates;
  if (!restCoords || restCoords.length !== 2 || !custCoords || custCoords.length !== 2) {
    return { distance: stored > 100 ? 0 : stored, method: 'stored' };
  }

  const [rlng, rlat] = restCoords;
  const [clng, clat] = custCoords;
  const straight = calculateHaversineDistance(rlat, rlng, clat, clng); // 0 = invalid coords
  if (!straight) return { distance: 0, method: 'invalid' };

  try {
    // overview=false: only need the distance, not the geometry. Timeout so a slow OSRM can't block settlement.
    const url = `https://router.project-osrm.org/route/v1/driving/${rlng},${rlat};${clng},${clat}?overview=false`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
    const km = (data?.routes?.[0]?.distance || 0) / 1000;
    // Road is never shorter than straight line; >100 km means a bad pin got snapped somewhere far.
    if (data?.code === 'Ok' && km >= straight * 0.9 && km < 100) {
      const distance = Math.round(km * 100) / 100;
      // Store once (DB + in-memory) so later calls pay/show the same number without another OSRM hit
      if (typeof order.set === 'function') {
        order.set('assignmentInfo.distance', distance); // mongoose document
        order.set('assignmentInfo.distanceMethod', 'osrm');
      } else {
        order.assignmentInfo = { ...(order.assignmentInfo || {}), distance, distanceMethod: 'osrm' };
      }
      if (order._id) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { 'assignmentInfo.distance': distance, 'assignmentInfo.distanceMethod': 'osrm' } }
        ).catch((e) => console.warn('⚠️ Failed to store road distance:', e.message));
      }
      return { distance, method: 'osrm' };
    }
  } catch (error) {
    console.warn('⚠️ OSRM road distance failed, using straight-line:', error.message);
  }
  // ponytail: straight-line fallback under-pays on winding roads; swap in Google Distance Matrix if OSRM is often down.
  return { distance: straight, method: 'haversine' };
}

/**
 * Calculate estimated earnings for delivery partner
 */
export async function calculateEstimatedEarnings(deliveryDistance) {
  try {
    // Ensure deliveryDistance is a valid number, default to 0 if NaN or missing
    const dist = Number(deliveryDistance);
    let deliveryDistanceForCalc = isNaN(dist) ? 0 : dist;
    
    // Safety guard against invalid/default coordinate distance (e.g., [0,0] Null Island)
    if (deliveryDistanceForCalc > 100) {
      deliveryDistanceForCalc = 0;
    }
    
    const commissionResult = await DeliveryBoyCommission.calculateCommission(deliveryDistanceForCalc);
    
    const basePayout = commissionResult.breakdown.basePayout;
    const distance = deliveryDistanceForCalc;
    const commissionPerKm = commissionResult.breakdown.commissionPerKm;
    const distanceCommission = commissionResult.breakdown.distanceCommission;
    const totalEarning = commissionResult.commission;

    // Create breakdown text
    let breakdownText = `Base payout: ₹${basePayout}`;
    if (distance > 0 && commissionPerKm > 0) {
      breakdownText += ` + Distance (${distance.toFixed(1)} km × ₹${commissionPerKm}/km) = ₹${distanceCommission.toFixed(0)}`;
    }
    breakdownText += ` = ₹${totalEarning.toFixed(0)}`;

    return {
      basePayout: Math.round(basePayout * 100) / 100,
      distance: Math.round(distance * 100) / 100,
      commissionPerKm: Math.round(commissionPerKm * 100) / 100,
      distanceCommission: Math.round(distanceCommission * 100) / 100,
      totalEarning: Math.round(totalEarning * 100) / 100,
      breakdown: breakdownText,
      minDistance: commissionResult.rule.minDistance,
      maxDistance: commissionResult.rule.maxDistance,
      breakdownDetails: commissionResult.breakdown // include the raw breakdown for UI if needed
    };
  } catch (error) {
    console.error('Error calculating estimated earnings:', error);
    // Fallback to default calculation
    const fallbackBase = 35;
    const fallbackRate = 8;
    const dist = deliveryDistance || 0;
    const distComm = dist * fallbackRate;
    const total = fallbackBase + distComm;

    return {
      basePayout: fallbackBase,
      distance: dist,
      commissionPerKm: fallbackRate,
      distanceCommission: distComm,
      totalEarning: total,
      breakdown: 'Default calculation',
      minDistance: 0,
      maxDistance: null
    };
  }
}
