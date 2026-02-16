const testCases = [100, 134, 999];

function calculateCommissions(totalAmount) {
  const hotelPct = 10;
  const adminPct = 20;
  const restaurantPct = 70;

  const hotelAmount = Math.round(totalAmount * (hotelPct / 100) * 100) / 100;
  const adminAmount = Math.round(totalAmount * (adminPct / 100) * 100) / 100;

  // Ensure perfect sum by calculating restaurant as remainder
  const restaurantAmount =
    Math.round((totalAmount - hotelAmount - adminAmount) * 100) / 100;

  return {
    total: totalAmount,
    hotel: hotelAmount,
    admin: adminAmount,
    restaurant: restaurantAmount,
    sum: Math.round((hotelAmount + adminAmount + restaurantAmount) * 100) / 100,
  };
}

console.log("--- Commission Calculation Verification ---");
testCases.forEach((total) => {
  const result = calculateCommissions(total);
  console.log(`\nTest Case: ₹${total}`);
  console.log(`  Hotel (10%): ₹${result.hotel}`);
  console.log(`  Admin (20%): ₹${result.admin}`);
  console.log(`  Restaurant (70%): ₹${result.restaurant}`);
  console.log(`  Validation Sum: ₹${result.sum}`);

  const isValid = result.sum === total;
  console.log(`  Result: ${isValid ? "✅ PASS" : "❌ FAIL"}`);

  // Check percentages
  const hPct = (result.hotel / result.total) * 100;
  const aPct = (result.admin / result.total) * 100;
  const rPct = (result.restaurant / result.total) * 100;

  console.log(
    `  Actual %: Hotel ${hPct.toFixed(2)}%, Admin ${aPct.toFixed(2)}%, Restaurant ${rPct.toFixed(2)}%`,
  );
});
