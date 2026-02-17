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

/**
 * Reverse geocode coordinates to address using BigDataCloud (no OLA / Google)
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

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    try {
      // Single provider: BigDataCloud reverse geocode (free tier, no billing surprises)
      const fallbackResponse = await axios.get(
        "https://api.bigdatacloud.net/data/reverse-geocode-client",
        {
          params: {
            latitude: latNum,
            longitude: lngNum,
            localityLanguage: "en",
          },
          timeout: 5000,
        },
      );

      const data = fallbackResponse.data || {};

      // Extract sublocality/area
      let area = "";
      if (data.localityInfo?.administrative) {
        const adminLevels = data.localityInfo.administrative;
        for (let i = 2; i < adminLevels.length && i < 5; i++) {
          const level = adminLevels[i];
          if (
            level?.name &&
            level.name !== data.principalSubdivision &&
            level.name !== data.city &&
            level.name !== data.locality
          ) {
            area = level.name;
            break;
          }
        }
        if (!area && data.subLocality) {
          area = data.subLocality;
        }
      }

      // Build formatted address
      let formattedAddress = data.formattedAddress;
      if (!formattedAddress) {
        const parts = [];
        if (area) parts.push(area);
        if (data.locality || data.city)
          parts.push(data.locality || data.city);
        if (data.principalSubdivision)
          parts.push(data.principalSubdivision);
        formattedAddress = parts.join(", ");
      }

      const transformedData = {
        results: [
          {
            formatted_address:
              formattedAddress ||
              `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
            address_components: {
              city: data.city || data.locality || "Current Location",
              state:
                data.principalSubdivision || data.administrativeArea || "",
              country: data.countryName || "",
              area: area || "",
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
        data: transformedData,
        source: "fallback",
      });
    } catch (apiError) {
      logger.error("Location service error (reverse geocode)", {
        error: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data,
      });

      const minimalData = {
        results: [
          {
            formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
            address_components: {
              city: "Current Location",
              state: "",
              country: "",
              area: "",
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
        data: minimalData,
        source: "coordinates_only",
      });
    }
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
 * Get nearby locations/places
 * NOTE: OLA Maps & Google Places removed to avoid external billing.
 * For now this returns an empty list structure.
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
    const radiusNum = parseFloat(radius);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    // All external providers (OLA Maps, Google Places) removed – just return empty list
    return res.json({
      success: true,
      data: {
        locations: [],
        source: "none",
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
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}
