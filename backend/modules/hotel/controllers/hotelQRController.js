import QRCode from "qrcode";
import Hotel from "../models/Hotel.js";

/**
 * Generate QR code for a hotel
 * @route POST /api/hotel/qr/generate
 * @access Private (Hotel Admin)
 */
export const generateHotelQR = async (req, res) => {
  try {
    const { hotelId } = req.hotel; // From auth middleware

    // Find hotel
    const hotel = await Hotel.findOne({ hotelId });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Generate QR code URL with hotel reference
    // This URL will be scanned by customers
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const qrUrl = `${baseUrl}/hotel-menu?ref=${hotelId}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "H",
      type: "image/png",
      width: 300,
      margin: 2,
    });

    // Update hotel with QR code
    hotel.qrCode = qrCodeDataUrl;
    await hotel.save();

    return res.status(200).json({
      success: true,
      message: "QR code generated successfully",
      data: {
        qrCode: qrCodeDataUrl,
        qrUrl,
        hotelId,
        hotelName: hotel.hotelName,
      },
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate QR code",
      error: error.message,
    });
  }
};

/**
 * Get hotel details by QR reference
 * @route GET /api/hotel/public/qr/:hotelRef
 * @access Public
 */
export const getHotelByQR = async (req, res) => {
  try {
    const { hotelRef } = req.params;

    if (!hotelRef) {
      return res.status(400).json({
        success: false,
        message: "Hotel reference is required",
      });
    }

    // Find hotel by hotelId
    const hotel = await Hotel.findOne({ hotelId: hotelRef, isActive: true });

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found or inactive",
      });
    }

    // Return hotel details (safe public fields only)
    return res.status(200).json({
      success: true,
      data: {
        hotel: {
          hotelId: hotel.hotelId,
          hotelName: hotel.hotelName,
          address: hotel.address,
          phone: hotel.phone,
          email: hotel.email,
          profileImage: hotel.profileImage,
          location: hotel.location,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching hotel by QR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hotel details",
      error: error.message,
    });
  }
};

/**
 * Get hotel's QR code
 * @route GET /api/hotel/qr
 * @access Private (Hotel Admin)
 */
export const getHotelQR = async (req, res) => {
  try {
    const { hotelId } = req.hotel; // From auth middleware

    const hotel = await Hotel.findOne({ hotelId });
    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // If QR code doesn't exist, generate it
    if (!hotel.qrCode) {
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const qrUrl = `${baseUrl}/hotel-menu?ref=${hotelId}`;

      const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: "H",
        type: "image/png",
        width: 300,
        margin: 2,
      });

      hotel.qrCode = qrCodeDataUrl;
      await hotel.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        qrCode: hotel.qrCode,
        hotelId: hotel.hotelId,
        hotelName: hotel.hotelName,
      },
    });
  } catch (error) {
    console.error("Error fetching QR code:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch QR code",
      error: error.message,
    });
  }
};
