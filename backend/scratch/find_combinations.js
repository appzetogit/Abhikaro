import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

function getCombinations(items, target, currentCombo = [], currentIndex = 0) {
  const combinations = [];
  
  function solve(remaining, index, combo) {
    if (remaining === 0) {
      combinations.push([...combo]);
      return;
    }
    if (remaining < 0 || index >= items.length) {
      return;
    }
    
    const item = items[index];
    
    // Option 1: Include item (with different quantities)
    // We can limit quantity to e.g. 15 to avoid infinite loops
    const maxQty = Math.floor(remaining / item.price);
    for (let q = 1; q <= maxQty; q++) {
      combo.push({ name: item.name, price: item.price, quantity: q });
      solve(remaining - (item.price * q), index + 1, combo);
      combo.pop();
    }
    
    // Option 2: Skip item
    solve(remaining, index + 1, combo);
  }
  
  solve(target, 0, []);
  return combinations;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  const cases = [
    { name: 'Maa karni Restaurant', id: '69d0ef574222eff98f02cb92', target: 1658 },
    { name: 'Restaurant 2309', id: '6a0aef7f6c863eb14688a817', target: 562 },
    { name: 'Maa karni Restaurant', id: '69d0ef574222eff98f02cb92', target: 480 }
  ];

  for (const c of cases) {
    console.log(`\n========================================`);
    console.log(`Combinations for ${c.name} (Subtotal: ₹${c.target})`);
    
    const menu = await db.collection('menus').findOne({
      $or: [
        { restaurant: c.id },
        { restaurant: new mongoose.Types.ObjectId(c.id) }
      ]
    });
    
    if (!menu) {
      console.log(`No menu found!`);
      continue;
    }
    
    const sections = menu.sections || [];
    let items = [];
    sections.forEach(sec => {
      const secItems = sec.items || [];
      secItems.forEach(it => {
        if (it.price > 0) {
          items.push({ name: it.name, price: it.price });
        }
      });
    });
    
    // Remove duplicates from menu items
    const seen = new Set();
    items = items.filter(it => {
      const key = `${it.name}-${it.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    console.log(`Menu items available: ${items.length}`);
    const combos = getCombinations(items, c.target);
    console.log(`Found ${combos.length} possible combinations:`);
    
    // Print top 5 combinations
    combos.slice(0, 10).forEach((combo, idx) => {
      console.log(`  Combo #${idx+1}:`);
      combo.forEach(it => {
        console.log(`    - ${it.quantity}x ${it.name} (₹${it.price} each)`);
      });
    });
    if (combos.length > 10) {
      console.log(`  ... and ${combos.length - 10} more combinations.`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
