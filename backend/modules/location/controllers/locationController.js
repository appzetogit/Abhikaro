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
      addr.municipality ||
      addr.county ||
      "";
    const state = addr.state || "";
    const country = addr.country || "";
    const area =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.hamlet ||
      addr.residential ||
      "";
    const road = addr.road || "";
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

    let results = [];
    try {
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            format: "json",
            q: query || "*",
            viewbox: viewbox,
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
      results = response.data || [];
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

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
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
