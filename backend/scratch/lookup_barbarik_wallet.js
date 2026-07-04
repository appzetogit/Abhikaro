import mongoose from "mongoose";
import dotenv from "dotenv";
import HotelWallet from "../modules/hotel/models/HotelWallet.js";
import Hotel from "../modules/hotel/models/Hotel.js";

dotenv.config();

async function run() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log("Connected to database.");

    const hotel = await Hotel.findOne({ hotelName: /Barbarik/i });
    if (!hotel) {
      console.error("Barbarik Palace hotel not found.");
      return;
    }

    console.log(`Hotel _id: ${hotel._id}, hotelId: ${hotel.hotelId}`);

    const wallet = await HotelWallet.findOne({ hotelId: hotel._id }).lean();
    if (!wallet) {
      console.error("Wallet not found.");
      return;
    }

    console.log("Wallet info:");
    console.log({
      totalBalance: wallet.totalBalance,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      manualAvailableBalanceAdjustment: wallet.manualAvailableBalanceAdjustment,
      manualCashCollectedOverride: wallet.manualCashCollectedOverride,
    });

    console.log("Transactions count:", wallet.transactions ? wallet.transactions.length : 0);
    console.log("Transactions breakdown:");
    if (wallet.transactions) {
      for (const t of wallet.transactions) {
        console.log(`amount: ${t.amount}, type: ${t.type}, status: ${t.status}, description: "${t.description}"`);
      }
    }

  } catch (error) {
    console.error("Failed to lookup Barbarik wallet:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
