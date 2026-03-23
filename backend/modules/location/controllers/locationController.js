import axios from "axios";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Haversine distance (meters) - reuse for nearest-town lookup
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Find nearest town/city around given coordinates using Nominatim search
const findNearestTown = async (latNum, lngNum) => {
  const radiusMeters = 15000; // 15 km radius
  const degreeOffset = radiusMeters / 111000; // approx meter-to-degree

  const viewbox = [
    lngNum - degreeOffset,
    latNum - degreeOffset,
    lngNum + degreeOffset,
    latNum + degreeOffset,
  ].join(",");

  let results = [];
  try {
    const resp = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          format: "json",
          q: "*",
          viewbox,
          bounded: 1,
          addressdetails: 1,
          limit: 10,
          "accept-language": "en",
        },
        headers: {
          "User-Agent": "AbhiKaro-App/1.0",
        },
        timeout: 8000,
      },
    );
    results = Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    logger.warn("Nearest town lookup failed", {
      error: err.message,
    });
    return null;
  }

  const candidates = results.filter((place) => {
    const cls = place.class || "";
    const type = place.type || "";
    return (
      cls === "place" &&
      (type === "town" || type === "city")
    );
  });

  if (!candidates.length) return null;

  let best = null;
  let bestDist = Infinity;

  for (const place of candidates) {
    const placeLat = parseFloat(place.lat);
    const placeLng = parseFloat(place.lon);
    if (Number.isNaN(placeLat) || Number.isNaN(placeLng)) continue;

    const dist = calculateDistance(latNum, lngNum, placeLat, placeLng);
    if (dist < bestDist) {
      bestDist = dist;
      best = place;
    }
  }

  if (!best) return null;

  const a = best.address || {};
  const townName =
    a.city ||
    a.town ||
    (best.display_name
      ? String(best.display_name).split(",")[0].trim()
      : "");

  return townName || null;
};

const buildMinimalGeocodeData = (latNum, lngNum) => {
  return {
    results: [
      {
        formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
        address_components: {
          building: "",
          area: "",
          road: "",
          city: "",
          
          

        },
        geometry: {
          location: {
            lat: latNum,
            lng: lngNum,
          },
        },
      },
    ],
  };
};

/**
 * Reverse geocode coordinates to address using free Nominatim (OpenStreetMap) API.
 * Zero Google Maps API cost.
 */
export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    let data;
    try {
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/reverse",
        {
          params: {
            format: "json",
            lat: latNum,
            lon: lngNum,
            addressdetails: 1,
            "accept-language": "en",
            zoom: 18,
          },
          headers: {
            "User-Agent": "AbhiKaro-App/1.0",
          },
          timeout: 10000,
        },
      );

      data = response.data;
    } catch (apiError) {
      logger.error("Nominatim reverse geocode request failed", {
        error: apiError.message,
        status: apiError.response?.status,
      });

      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "coordinates_only",
      });
    }

    if (!data || data.error) {
      logger.warn("Nominatim reverse geocode returned no usable results", {
        error: data?.error,
      });
      const minimalData = buildMinimalGeocodeData(latNum, lngNum);
      return res.json({
        success: true,
        data: minimalData,
        source: "coordinates_only",
      });
    }

    const addr = data.address || {};

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.hamlet ||
      addr.municipality ||
      addr.county ||
      "";
    const state = addr.state || "";
    const country = addr.country || "";
    const area =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.residential ||
      addr.village ||
      addr.hamlet ||
      "";
    const road = addr.road || addr.street || addr.residential || "";
    const building = addr.building || addr.amenity || addr.shop || "";
    const postcode = addr.postcode || "";

    let formattedAddress = data.display_name || "";

    // If area is empty, try to extract from display_name
    let derivedArea = area;
    if (!derivedArea && formattedAddress) {
      const parts = formattedAddress
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (parts.length >= 3) {
        // For Indian addresses like: "Dewas Bypass, Karnakhri, Dewas, Madhya Pradesh, ..."
        // If first part matches road, treat SECOND part as area/locality (Karnakhri)
        if (road && parts[0].toLowerCase() === road.toLowerCase()) {
          const secondPart = parts[1];
          if (
            secondPart &&
            secondPart.toLowerCase() !== city.toLowerCase() &&
            secondPart.toLowerCase() !== state.toLowerCase() &&
            !secondPart.toLowerCase().includes("district") &&
            secondPart.length > 2 &&
            secondPart.length < 80
          ) {
            derivedArea = secondPart;
          }
        }

        // Generic fallback: use first part as area when it looks valid
        if (!derivedArea) {
          const potentialArea = parts[0];
          if (
            potentialArea &&
            potentialArea.toLowerCase() !== city.toLowerCase() &&
            potentialArea.toLowerCase() !== state.toLowerCase() &&
            !potentialArea.toLowerCase().includes("district") &&
            potentialArea.length > 2 &&
            potentialArea.length < 80
          ) {
            derivedArea = potentialArea;
          }
        }
      }
    }

    // If city looks like only a small village/area, try to find nearest town/city
    let nearestTownName = null;
    try {
      const shouldLookupNearestTown =
        !city ||
        (area &&
          city &&
          city.toLowerCase() === area.toLowerCase());

      if (shouldLookupNearestTown) {
        nearestTownName = await findNearestTown(latNum, lngNum);
        if (nearestTownName) {
          city = nearestTownName;
        }
      }
    } catch (lookupError) {
      logger.warn("Nearest town enhancement failed", {
        error: lookupError.message,
      });
    }

    const processedData = {
      results: [
        {
          formatted_address:
            formattedAddress || `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
          address_components: {
            city: city,
            state: state,
            country: country,
            area: derivedArea,
            road: road,
            building: building,
            postcode: postcode,
            nearestTown: nearestTownName || "",
          },
          geometry: {
            location: {
              lat: latNum,
              lng: lngNum,
            },
          },
        },
      ],
    };

    return res.json({
      success: true,
      data: processedData,
      source: "nominatim",
    });
  } catch (error) {
    logger.error("Reverse geocode error", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get nearby locations/places using free Nominatim search API.
 * Zero Google Maps API cost.
 * GET /location/nearby?lat=...&lng=...&radius=...
 */
export const getNearbyLocations = async (req, res) => {
  try {
    const { lat, lng, radius = 500, query = "" } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    // Use Nominatim search with viewbox for nearby results
    const radiusNum = parseFloat(radius) || 500;
    const degreeOffset = radiusNum / 111000; // rough meter-to-degree
    const viewbox = [
      lngNum - degreeOffset,
      latNum - degreeOffset,
      lngNum + degreeOffset,
      latNum + degreeOffset,
    ].join(",");

    const normalizedQuery = String(query || "")
      .replace(/\s+/g, " ")
      .trim();
    const relaxedQuery = normalizedQuery
      .replace(/^\d+[A-Za-z\-\/]*\s*,\s*/i, "")
      .trim();

    const queryCandidates = Array.from(
      new Set(
        [normalizedQuery, relaxedQuery].filter(
          (value) => value && value.length >= 2,
        ),
      ),
    );

    const nominatimSearch = async ({
      q,
      bounded = true,
      includeIndiaSuffix = false,
    }) => {
      const searchQuery = includeIndiaSuffix ? `${q}, India` : q;
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            format: "json",
            q: searchQuery,
            viewbox: viewbox,
            bounded: bounded ? 1 : 0,
            addressdetails: 1,
            limit: 10,
            "accept-language": "en",
          },
          headers: {
            "User-Agent": "AbhiKaro-App/1.0",
          },
          timeout: 8000,
        },
      );

      return response.data || [];
    };

    let results = [];
    try {
      // Pass 1: bounded nearby lookup (fast + locality-biased)
      for (const candidate of queryCandidates) {
        const boundedResults = await nominatimSearch({ q: candidate, bounded: true });
        if (Array.isArray(boundedResults) && boundedResults.length > 0) {
          results = boundedResults;
          break;
        }
      }

      // Pass 2: unbounded fallback with India context (helps when query has house numbers)
      if (results.length === 0) {
        for (const candidate of queryCandidates) {
          const relaxedResults = await nominatimSearch({
            q: candidate,
            bounded: false,
            includeIndiaSuffix: true,
          });
          if (Array.isArray(relaxedResults) && relaxedResults.length > 0) {
            results = relaxedResults;
            break;
          }
        }
      }
    } catch (apiError) {
      logger.error("Nominatim nearby search failed", {
        error: apiError.message,
      });
      return res.json({
        success: true,
        data: { locations: [], source: "none" },
      });
    }

    if (!Array.isArray(results) || results.length === 0) {
      return res.json({
        success: true,
        data: { locations: [], source: "nominatim" },
      });
    }

    const nearbyPlaces = results.map((place, index) => {
      const placeLat = parseFloat(place.lat);
      const placeLng = parseFloat(place.lon);
      const distance = calculateDistance(latNum, lngNum, placeLat, placeLng);

      return {
        id: place.place_id ? String(place.place_id) : `place_${index}`,
        name: place.display_name ? place.display_name.split(",")[0] : "",
        address: place.display_name || "",
        distance:
          distance < 1000
            ? `${Math.round(distance)} m`
            : `${(distance / 1000).toFixed(2)} km`,
        distanceMeters: Math.round(distance),
        latitude: placeLat,
        longitude: placeLng,
      };
    });

    nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return res.json({
      success: true,
      data: {
        locations: nearbyPlaces,
        source: "nominatim",
      },
    });
  } catch (error) {
    logger.error("Get nearby locations error", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// calculateDistance now defined at top for reuse
