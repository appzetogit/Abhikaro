import Restaurant from "../models/Restaurant.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import { createRestaurantFromOnboarding } from "./restaurantController.js";

const isDefaultPlaceholderName = (value) => {
  if (!value || typeof value !== "string") return false;
  return /^Restaurant\s+\d+$/i.test(value.trim());
};

// Get current restaurant's onboarding data
export const getOnboarding = async (req, res) => {
  try {
    // Check if restaurant is authenticated
    if (!req.restaurant || !req.restaurant._id) {
      return errorResponse(res, 401, "Restaurant not authenticated");
    }

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId)
      .select("onboarding")
      .lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    return successResponse(res, 200, "Onboarding data retrieved", {
      onboarding: restaurant.onboarding || null,
    });
  } catch (error) {
    console.error("Error fetching restaurant onboarding:", error);
    return errorResponse(res, 500, "Failed to fetch onboarding data");
  }
};

// Upsert onboarding data (all steps in one payload)
export const upsertOnboarding = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { step1, step2, step3, step4, completedSteps } = req.body;

    // Get existing restaurant data to merge if needed
    const existingRestaurant = await Restaurant.findById(restaurantId).lean();
    const existingOnboarding = existingRestaurant?.onboarding || {};

    const update = {};

    // Step1: Always update if provided
    if (step1) {
      // If step1 includes contact numbers, prevent re-using them for another restaurant.
      // Normalize to keep behavior consistent with Restaurant pre-save hooks.
      const candidateNumbers = [
        step1.ownerPhone,
        step1.primaryContactNumber,
      ]
        .filter(Boolean)
        .map((n) => normalizePhoneNumber(n))
        .filter(Boolean);

      if (candidateNumbers.length > 0) {
        const existingByNumber = await Restaurant.findOne({
          _id: { $ne: restaurantId },
          $or: [
            { phone: { $in: candidateNumbers } },
            { ownerPhone: { $in: candidateNumbers } },
            { primaryContactNumber: { $in: candidateNumbers } },
          ],
        }).select("_id phone ownerPhone primaryContactNumber");

        if (existingByNumber) {
          return errorResponse(
            res,
            409,
            "This phone/contact number is already used by another restaurant. Please use a different number.",
          );
        }
      }

      update["onboarding.step1"] = step1;
    }

    // Step2: Update if provided (even if empty arrays, as user might be clearing data)
    if (step2 !== undefined && step2 !== null) {
      update["onboarding.step2"] = step2;
    }

    // Step3: Update if provided (replace completely, as frontend sends full step3 object)
    if (step3 !== undefined && step3 !== null) {
      update["onboarding.step3"] = step3;
    }

    // Step4: Always update if provided
    if (step4 !== undefined && step4 !== null) {
      update["onboarding.step4"] = step4;
    }

    // Update completedSteps if provided (always update, even if 0)
    if (
      typeof completedSteps === "number" &&
      completedSteps !== null &&
      completedSteps !== undefined
    ) {
      update["onboarding.completedSteps"] = completedSteps;
    }

    console.log("📝 Onboarding update payload:", {
      hasStep1: !!step1,
      hasStep2: step2 !== undefined,
      hasStep3: step3 !== undefined,
      hasStep4: !!step4,
      completedSteps,
      step2Data: step2
        ? {
            menuImageUrlsCount: step2.menuImageUrls?.length || 0,
            hasProfileImage: !!step2.profileImageUrl,
            cuisinesCount: step2.cuisines?.length || 0,
            openDaysCount: step2.openDays?.length || 0,
            deliveryTimings: step2.deliveryTimings,
          }
        : null,
      step3Data: step3
        ? {
            hasPan: !!step3.pan,
            hasGst: !!step3.gst,
            hasFssai: !!step3.fssai,
            hasBank: !!step3.bank,
            panNumber: step3.pan?.panNumber,
            gstRegistered: step3.gst?.isRegistered,
            fssaiNumber: step3.fssai?.registrationNumber,
            bankAccount: step3.bank?.accountNumber,
          }
        : null,
      updateKeys: Object.keys(update),
    });

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: update },
      {
        new: true,
        upsert: false,
      },
    );

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const onboarding = restaurant.onboarding;

    // Log saved data for verification
    console.log("✅ Onboarding data saved:", {
      completedSteps: onboarding.completedSteps,
      step1Saved: !!onboarding.step1,
      step2Saved: onboarding.step2
        ? {
            menuImageUrlsCount: onboarding.step2.menuImageUrls?.length || 0,
            hasProfileImage: !!onboarding.step2.profileImageUrl,
            cuisinesCount: onboarding.step2.cuisines?.length || 0,
            openDaysCount: onboarding.step2.openDays?.length || 0,
          }
        : null,
      step3Saved: onboarding.step3
        ? {
            hasPan: !!onboarding.step3.pan,
            hasGst: !!onboarding.step3.gst,
            hasFssai: !!onboarding.step3.fssai,
            hasBank: !!onboarding.step3.bank,
            panNumber: onboarding.step3.pan?.panNumber,
            gstRegistered: onboarding.step3.gst?.isRegistered,
            fssaiNumber: onboarding.step3.fssai?.registrationNumber,
            bankAccount: onboarding.step3.bank?.accountNumber,
          }
        : null,
      step4Saved: onboarding.step4
        ? {
            estimatedDeliveryTime: onboarding.step4.estimatedDeliveryTime,
            distance: onboarding.step4.distance,
            priceRange: onboarding.step4.priceRange,
            featuredDish: onboarding.step4.featuredDish,
          }
        : null,
    });

    // If onboarding is complete (step 4), update restaurant with final data
    // Also update restaurant schema when step2 is completed (for immediate data availability)
    // Check both the request body and the saved document's completedSteps
    const finalCompletedSteps = onboarding.completedSteps || completedSteps;

    // Update restaurant schema when step1 is completed (basic info)
    // Always update if step1 is provided, regardless of completedSteps
    // This ensures name and other step1 data are always synced
    if (step1) {
      console.log(
        "🔄 Step1 data provided, updating restaurant schema with step1 data...",
      );
      try {
        const updateData = {};
        // Always update name if restaurantName is provided (even if it's the same)
        // This fixes cases where restaurant was created with default name like "Restaurant 6911"
        if (step1.restaurantName) {
          const desired = String(step1.restaurantName).trim();
          // Overwrite placeholders or empty names; otherwise still allow explicit update
          if (!existingRestaurant?.name || isDefaultPlaceholderName(existingRestaurant?.name)) {
            updateData.name = desired;
          } else {
            updateData.name = desired;
          }
        }
        if (step1.ownerName) {
          const desired = String(step1.ownerName).trim();
          if (!existingRestaurant?.ownerName || isDefaultPlaceholderName(existingRestaurant?.ownerName)) {
            updateData.ownerName = desired;
          } else {
            updateData.ownerName = desired;
          }
        }
        if (step1.ownerEmail) {
          updateData.ownerEmail = String(step1.ownerEmail).trim().toLowerCase();
        }
        if (step1.ownerPhone) {
          updateData.ownerPhone =
            normalizePhoneNumber(step1.ownerPhone) || step1.ownerPhone;
        }
        if (step1.primaryContactNumber) {
          updateData.primaryContactNumber =
            normalizePhoneNumber(step1.primaryContactNumber) ||
            step1.primaryContactNumber;
        }
        if (step1.location) {
          // IMPORTANT:
          // Frontend may send a partial `geoLocation` (e.g. { type: 'Point' } with no coordinates).
          // If we write that into top-level `location.geoLocation`, Mongo's 2dsphere index can throw
          // "Can't extract geo keys" and the whole step1 sync fails (leaving placeholder name/ownerName).
          const safeLocation = { ...(step1.location || {}) };
          if (safeLocation.geoLocation) {
            const coords = safeLocation.geoLocation.coordinates;
            const validCoords =
              Array.isArray(coords) &&
              coords.length === 2 &&
              typeof coords[0] === "number" &&
              typeof coords[1] === "number";
            if (!validCoords) {
              delete safeLocation.geoLocation;
            }
          }
          updateData.location = safeLocation;
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(
            restaurantId,
            { $set: updateData },
            { new: true }
          );
          console.log(
            "✅ Restaurant schema updated with step1 data:",
            {
              updatedFields: Object.keys(updateData),
              oldName: existingRestaurant?.name,
              newName: updated?.name,
              restaurantName: step1.restaurantName,
            }
          );
        }
      } catch (step1UpdateError) {
        console.error(
          "⚠️ Error updating restaurant schema with step1 data:",
          step1UpdateError,
        );
        // Don't fail the request, just log the error
      }
    }

    // Update restaurant schema when step2 is completed (cuisines, openDays, menuImages, etc.)
    if (finalCompletedSteps >= 2 && step2) {
      console.log(
        "🔄 Step2 completed, updating restaurant schema with step2 data...",
      );
      console.log("📦 Step2 data received:", {
        hasProfileImage: !!step2.profileImageUrl,
        hasMenuImages: !!step2.menuImageUrls,
        menuImagesCount: step2.menuImageUrls?.length || 0,
        cuisines: step2.cuisines,
        openDays: step2.openDays,
        deliveryTimings: step2.deliveryTimings,
      });
      try {
        const updateData = {};
        if (step2.profileImageUrl) {
          // Handle both object {url, publicId} and string URL
          updateData.profileImage = typeof step2.profileImageUrl === 'string' 
            ? step2.profileImageUrl 
            : (step2.profileImageUrl.url || step2.profileImageUrl);
        }
        if (step2.menuImageUrls !== undefined) {
          // Ensure menuImageUrls is an array and extract URLs if objects
          const menuImages = Array.isArray(step2.menuImageUrls) 
            ? step2.menuImageUrls.map(img => 
                typeof img === 'string' ? img : (img.url || img)
              )
            : [];
          updateData.menuImages = menuImages;
        }
        if (step2.cuisines !== undefined) {
          updateData.cuisines = step2.cuisines; // Update even if empty array
        }
        if (step2.deliveryTimings) {
          updateData.deliveryTimings = step2.deliveryTimings;
        }
        if (step2.openDays !== undefined) {
          updateData.openDays = step2.openDays; // Update even if empty array
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(
            restaurantId,
            { $set: updateData },
            { new: true },
          );
          console.log("✅ Restaurant schema updated with step2 data:", {
            updatedFields: Object.keys(updateData),
            cuisines: updated?.cuisines,
            openDays: updated?.openDays,
            menuImagesCount: updated?.menuImages?.length || 0,
          });
        } else {
          console.warn("⚠️ No step2 data to update in restaurant schema");
        }
      } catch (step2UpdateError) {
        console.error(
          "⚠️ Error updating restaurant schema with step2 data:",
          step2UpdateError,
        );
        console.error("Error details:", {
          message: step2UpdateError.message,
          stack: step2UpdateError.stack,
        });
        // Don't fail the request, just log the error
      }
    }

    // Update restaurant schema when step3 is completed (PAN, GST, FSSAI, bank details)
    // Step3 data is stored in onboarding subdocument, no need to duplicate in main schema
    // as it's documentation/verification data, not display data
    if (finalCompletedSteps >= 3 && step3) {
      console.log(
        "🔄 Step3 completed, data saved in onboarding subdocument...",
      );
      console.log("📦 Step3 data received:", {
        hasPan: !!step3.pan,
        hasGst: !!step3.gst,
        hasFssai: !!step3.fssai,
        hasBank: !!step3.bank,
        panNumber: step3.pan?.panNumber,
        gstRegistered: step3.gst?.isRegistered,
        fssaiNumber: step3.fssai?.registrationNumber,
        bankAccount: step3.bank?.accountNumber,
      });
      console.log("✅ Step3 data saved in onboarding subdocument");
    }

    // Update restaurant schema when step4 is completed (display data)
    if (finalCompletedSteps >= 4 && step4) {
      console.log(
        "🔄 Step4 completed, updating restaurant schema with step4 data...",
      );
      console.log("📦 Step4 data received:", {
        estimatedDeliveryTime: step4.estimatedDeliveryTime,
        distance: step4.distance,
        priceRange: step4.priceRange,
        featuredDish: step4.featuredDish,
        featuredPrice: step4.featuredPrice,
        offer: step4.offer,
      });
      try {
        const updateData = {};
        if (step4.estimatedDeliveryTime !== undefined) {
          updateData.estimatedDeliveryTime = step4.estimatedDeliveryTime;
        }
        if (step4.distance !== undefined) {
          updateData.distance = step4.distance;
        }
        if (step4.priceRange !== undefined) {
          updateData.priceRange = step4.priceRange;
        }
        if (step4.featuredDish !== undefined) {
          updateData.featuredDish = step4.featuredDish;
        }
        if (step4.featuredPrice !== undefined) {
          updateData.featuredPrice = step4.featuredPrice;
        }
        if (step4.offer !== undefined) {
          updateData.offer = step4.offer;
        }

        // IMPORTANT BUSINESS RULE:
        // Completing signup/onboarding should create a PENDING admin approval request.
        // Pending requests are defined as: approvedAt is null/undefined AND isActive is false.
        // So if this restaurant is not yet approved, keep it inactive and not accepting orders.
        if (!existingRestaurant?.approvedAt) {
          updateData.isActive = false;
          updateData.isAcceptingOrders = false;
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(
            restaurantId,
            { $set: updateData },
            { new: true },
          );
          console.log("✅ Restaurant schema updated with step4 data:", {
            updatedFields: Object.keys(updateData),
            estimatedDeliveryTime: updated?.estimatedDeliveryTime,
            priceRange: updated?.priceRange,
            featuredDish: updated?.featuredDish,
          });
        } else {
          console.warn("⚠️ No step4 data to update in restaurant schema");
        }
      } catch (step4UpdateError) {
        console.error(
          "⚠️ Error updating restaurant schema with step4 data:",
          step4UpdateError,
        );
        // Don't fail the request, just log the error
      }
    }

    console.log("🔍 Onboarding update check:", {
      requestCompletedSteps: completedSteps,
      savedCompletedSteps: onboarding.completedSteps,
      finalCompletedSteps,
      hasStep1: !!step1,
      hasStep2: !!step2,
      hasStep3: !!step3,
      hasStep4: !!step4,
      restaurantId: restaurantId.toString(),
      willUpdateRestaurant: finalCompletedSteps === 4,
    });

    // Update restaurant with final data if onboarding is complete (step 4)
    // Also check if step4 is being sent (which means user is completing step 4)
    // Note: Individual step updates are handled above, this is for final consolidation
    if (finalCompletedSteps === 4 || (step4 && completedSteps === 4)) {
      console.log(
        "✅ Onboarding is complete (step 4), finalizing restaurant data...",
      );

      // All individual steps have already updated the restaurant schema above
      // This section is kept for backward compatibility and final validation

      // Fetch the complete restaurant to verify all data is saved
      const completeRestaurant = await Restaurant.findById(restaurantId).lean();

      console.log("📋 Final restaurant data verification:", {
        name: completeRestaurant?.name,
        cuisines: completeRestaurant?.cuisines?.length || 0,
        openDays: completeRestaurant?.openDays?.length || 0,
        hasProfileImage: !!completeRestaurant?.profileImage,
        menuImagesCount: completeRestaurant?.menuImages?.length || 0,
        estimatedDeliveryTime: completeRestaurant?.estimatedDeliveryTime,
        priceRange: completeRestaurant?.priceRange,
      });

      // Send email notifications
      try {
        const emailService = (
          await import("../../auth/services/emailService.js")
        ).default;

        // 1. Send welcome email to Restaurant Owner (only if a real email address exists)
        if (
          completeRestaurant.ownerEmail &&
          completeRestaurant.ownerEmail.includes("@") &&
          !completeRestaurant.ownerEmail.endsWith(".local")
        ) {
          emailService
            .sendRestaurantWelcome(
              completeRestaurant.ownerEmail,
              completeRestaurant.ownerName,
              completeRestaurant.name,
            )
            .catch((err) =>
              console.error(`Failed to send welcome email: ${err.message}`),
            );
        }

        // 2. Send Alert to Admin
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail) {
          emailService
            .sendRestaurantRegistrationAlert(adminEmail, {
              name: completeRestaurant.name,
              ownerName: completeRestaurant.ownerName,
              ownerPhone: completeRestaurant.ownerPhone,
              phone: completeRestaurant.phone,
              address: completeRestaurant.onboarding?.step1?.location || {
                city: "Unknown",
              },
            })
            .catch((err) =>
              console.error(`Failed to send admin alert: ${err.message}`),
            );
        }
      } catch (emailError) {
        console.error("Error sending onboarding emails:", emailError);
      }

      // Return success response with restaurant info
      return successResponse(
        res,
        200,
        "Onboarding data saved and restaurant updated",
        {
          onboarding,
          restaurant: {
            restaurantId: completeRestaurant?.restaurantId,
            _id: completeRestaurant?._id,
            name: completeRestaurant?.name,
            slug: completeRestaurant?.slug,
            isActive: completeRestaurant?.isActive,
          },
        },
      );
    }

    return successResponse(res, 200, "Onboarding data saved", {
      onboarding,
    });
  } catch (error) {
    console.error("Error saving restaurant onboarding:", error);
    return errorResponse(res, 500, "Failed to save onboarding data");
  }
};

// Manual trigger to update restaurant from onboarding (for debugging/fixing)
export const createRestaurantFromOnboardingManual = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;

    // Fetch the complete restaurant with onboarding data
    const restaurant = await Restaurant.findById(restaurantId).lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    if (!restaurant.onboarding) {
      return errorResponse(res, 404, "Onboarding data not found");
    }

    if (!restaurant.onboarding.step1 || !restaurant.onboarding.step2) {
      return errorResponse(
        res,
        400,
        "Incomplete onboarding data. Please complete all steps first.",
      );
    }

    if (restaurant.onboarding.completedSteps !== 3) {
      return errorResponse(
        res,
        400,
        `Onboarding not complete. Current step: ${restaurant.onboarding.completedSteps}/3`,
      );
    }

    try {
      const updatedRestaurant = await createRestaurantFromOnboarding(
        restaurant.onboarding,
        restaurantId,
      );

      return successResponse(res, 200, "Restaurant updated successfully", {
        restaurant: {
          restaurantId: updatedRestaurant.restaurantId,
          _id: updatedRestaurant._id,
          name: updatedRestaurant.name,
          slug: updatedRestaurant.slug,
          isActive: updatedRestaurant.isActive,
        },
      });
    } catch (error) {
      console.error("Error updating restaurant:", error);
      return errorResponse(
        res,
        500,
        `Failed to update restaurant: ${error.message}`,
      );
    }
  } catch (error) {
    console.error("Error in createRestaurantFromOnboardingManual:", error);
    return errorResponse(res, 500, "Failed to process request");
  }
};
