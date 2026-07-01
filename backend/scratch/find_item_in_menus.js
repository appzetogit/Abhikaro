import mongoose from 'mongoose';
import Menu from '../modules/restaurant/models/Menu.js';
import dotenv from 'dotenv';
dotenv.config();

const findItem = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const itemId = 'item-1775654380276-0.45381922624088167';
    console.log(`Searching for item ID: ${itemId}`);

    const menus = await Menu.find({}).lean();
    let found = false;

    for (const menu of menus) {
      if (menu.sections) {
        for (const section of menu.sections) {
          if (section.items) {
            for (const item of section.items) {
              if (item.id === itemId) {
                console.log(`Found match in Menu ID: ${menu._id}, Restaurant: ${menu.restaurant}`);
                console.log(`Section Name: ${section.name}`);
                console.log('Item details:', JSON.stringify(item, null, 2));
                found = true;
              }
            }
          }
          if (section.subsections) {
            for (const sub of section.subsections) {
              if (sub.items) {
                for (const item of sub.items) {
                  if (item.id === itemId) {
                    console.log(`Found match in Menu ID: ${menu._id}, Restaurant: ${menu.restaurant}`);
                    console.log(`Section Name: ${section.name}, Subsection Name: ${sub.name}`);
                    console.log('Item details:', JSON.stringify(item, null, 2));
                    found = true;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!found) {
      console.log('Item not found in any menu.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

findItem();
