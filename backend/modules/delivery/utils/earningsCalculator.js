
import DeliveryBoyCommission from "../../admin/models/DeliveryBoyCommission.js";

/**
 * Calculate Haversine distance between two points in km
 */
export function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate estimated earnings for delivery partner
 */
export async function calculateEstimatedEarnings(deliveryDistance) {
  try {
    // Ensure deliveryDistance is a valid number, default to 0 if NaN or missing
    const dist = Number(deliveryDistance);
    const deliveryDistanceForCalc = isNaN(dist) ? 0 : dist;
    
    const commissionResult = await DeliveryBoyCommission.calculateCommission(deliveryDistanceForCalc);
    
    const basePayout = commissionResult.breakdown.basePayout;
    const distance = deliveryDistanceForCalc;
    const commissionPerKm = commissionResult.breakdown.commissionPerKm;
    const distanceCommission = commissionResult.breakdown.distanceCommission;
    const totalEarning = commissionResult.commission;

    // Create breakdown text
    let breakdownText = `Base payout: ₹${basePayout}`;
    if (distance > commissionResult.rule.minDistance) {
      const extraDistance = distance - commissionResult.rule.minDistance;
      breakdownText += ` + Extra Distance (${extraDistance.toFixed(1)} km × ₹${commissionPerKm}/km) = ₹${distanceCommission.toFixed(0)}`;
    } else {
      breakdownText += ` (Distance ${distance.toFixed(1)} km ≤ ${commissionResult.rule.minDistance} km, per km not applicable)`;
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
    const fallbackBase = 10;
    const fallbackRate = 5;
    const fallbackMinDist = 4;
    const dist = deliveryDistance || 0;
    const extraDist = Math.max(0, dist - fallbackMinDist);
    const distComm = extraDist * fallbackRate;
    const total = fallbackBase + distComm;

    return {
      basePayout: fallbackBase,
      distance: dist,
      commissionPerKm: fallbackRate,
      distanceCommission: distComm,
      totalEarning: total,
      breakdown: 'Default calculation',
      minDistance: fallbackMinDist,
      maxDistance: null
    };
  }
}
