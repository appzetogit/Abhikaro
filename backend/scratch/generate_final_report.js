import mongoose from 'mongoose';
import Hotel from '../modules/hotel/models/Hotel.js';
import HotelWallet from '../modules/hotel/models/HotelWallet.js';
import Order from '../modules/order/models/Order.js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const generateReport = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const hotels = await Hotel.find().sort({ hotelName: 1 }).lean();
    console.log(`Generating report for ${hotels.length} hotels...`);

    let md = `# Final Hotel Wallet Summary & Balance Check\n\n`;
    md += `This report lists the updated wallet states (balances, earned totals, and withdrawals) for all hotels in the database after the self-healing and data link processes completed.\n\n`;
    md += `| SI | Hotel Name | Wallet Balance | Total Earned | Total Withdrawn | Status |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    let count = 1;
    for (const hotel of hotels) {
      const wallet = await HotelWallet.findOne({ hotelId: hotel._id }).lean();
      const balance = wallet ? wallet.totalBalance : 0;
      const earned = wallet ? wallet.totalEarned : 0;
      const withdrawn = wallet ? wallet.totalWithdrawn : 0;
      const status = hotel.isActive ? 'Active' : 'Inactive';

      md += `| ${count} | **${hotel.hotelName}** | ₹${balance.toFixed(2)} | ₹${earned.toFixed(2)} | ₹${withdrawn.toFixed(2)} | ${status} |\n`;
      count++;
    }

    const reportPath = 'scratch/final_hotel_wallet_summary.md';
    fs.writeFileSync(reportPath, md);
    console.log(`✅ Final report saved to ${reportPath}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

generateReport();
