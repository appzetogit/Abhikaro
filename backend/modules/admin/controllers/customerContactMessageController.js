import CustomerContactMessage from "../models/CustomerContactMessage.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";

/**
 * Create customer contact message (Public - authenticated user)
 * POST /api/contact-us
 */
export const createCustomerContactMessage = asyncHandler(async (req, res) => {
  try {
    const { name, phone, email, message } = req.body;

    if (!name || !String(name).trim()) {
      return errorResponse(res, 400, "Name is required");
    }
    if (!phone || !String(phone).trim()) {
      return errorResponse(res, 400, "Phone is required");
    }
    if (!email || !String(email).trim()) {
      return errorResponse(res, 400, "Email is required");
    }
    if (!message || !String(message).trim()) {
      return errorResponse(res, 400, "Message is required");
    }

    const payload = {
      userId: req.user?._id || null,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
      status: "new",
    };

    const contactMessage = await CustomerContactMessage.create(payload);
    return successResponse(
      res,
      201,
      "Contact message submitted successfully",
      contactMessage,
    );
  } catch (error) {
    console.error("Error creating contact message:", error);
    return errorResponse(res, 500, "Failed to submit contact message");
  }
});

/**
 * Get customer contact messages (Admin)
 * GET /api/admin/customer-contact-us
 */
export const getCustomerContactMessages = asyncHandler(async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }
    if (search && String(search).trim()) {
      const term = String(search).trim();
      query.$or = [
        { name: { $regex: term, $options: "i" } },
        { phone: { $regex: term, $options: "i" } },
        { email: { $regex: term, $options: "i" } },
        { message: { $regex: term, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const messages = await CustomerContactMessage.find(query)
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await CustomerContactMessage.countDocuments(query);

    return successResponse(res, 200, "Contact messages retrieved successfully", {
      messages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    return errorResponse(res, 500, "Failed to fetch contact messages");
  }
});

/**
 * Get single customer contact message (Admin)
 * GET /api/admin/customer-contact-us/:id
 */
export const getCustomerContactMessageById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const message = await CustomerContactMessage.findById(id)
      .populate("userId", "name email phone")
      .lean();

    if (!message) {
      return errorResponse(res, 404, "Contact message not found");
    }

    return successResponse(res, 200, "Contact message retrieved successfully", message);
  } catch (error) {
    console.error("Error fetching contact message:", error);
    return errorResponse(res, 500, "Failed to fetch contact message");
  }
});

/**
 * Update customer contact message status (Admin)
 * PUT /api/admin/customer-contact-us/:id/status
 */
export const updateCustomerContactMessageStatus = asyncHandler(
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["new", "read", "resolved"].includes(status)) {
        return errorResponse(
          res,
          400,
          "Valid status is required (new, read, resolved)",
        );
      }

      const updated = await CustomerContactMessage.findByIdAndUpdate(
        id,
        { status },
        { new: true },
      )
        .populate("userId", "name email phone")
        .lean();

      if (!updated) {
        return errorResponse(res, 404, "Contact message not found");
      }

      return successResponse(
        res,
        200,
        "Contact message status updated successfully",
        updated,
      );
    } catch (error) {
      console.error("Error updating contact message status:", error);
      return errorResponse(res, 500, "Failed to update contact message status");
    }
  },
);

