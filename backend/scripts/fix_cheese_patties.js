import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Menu from '../modules/restaurant/models/Menu.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

async function fixMenu() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    // Find all menus
    const menus = await Menu.find({});
    let fixedCount = 0;

    for (const menu of menus) {
      let changed = false;
      
      // Find 'Cheese Patties' in any section
      let itemToMove = null;
      let fromSectionIdx = -1;
      let fromItemIdx = -1;

      for (let i = 0; i < menu.sections.length; i++) {
        const section = menu.sections[i];
        if (section.name.toLowerCase() === 'burgers') {
          for (let j = 0; j < section.items.length; j++) {
            if (section.items[j].name === 'Cheese Patties') {
              itemToMove = section.items[j];
              fromSectionIdx = i;
              fromItemIdx = j;
              break;
            }
          }
        }
      }

      if (itemToMove) {
        console.log(`Found Cheese Patties in menu ID: ${menu._id}, removing from Burgers`);
        menu.sections[fromSectionIdx].items.splice(fromItemIdx, 1);
        
        let targetSection = menu.sections.find(s => s.name.toLowerCase() === 'patties');
        if (!targetSection) {
            console.log('Patties section not found, creating it');
            menu.sections.push({
                id: new mongoose.Types.ObjectId().toString(),
                name: 'Patties',
                items: [],
                subsections: [],
                isEnabled: true,
                order: menu.sections.length
            });
            targetSection = menu.sections[menu.sections.length - 1];
        }
        
        console.log('Adding Cheese Patties to Patties section');
        targetSection.items.push(itemToMove);
        changed = true;
      }

      if (changed) {
        await menu.save();
        console.log(`Saved menu ID: ${menu._id}`);
        fixedCount++;
      }
    }

    console.log(`Fix complete. Modified ${fixedCount} menus.`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixMenu();
