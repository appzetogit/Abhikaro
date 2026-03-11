import axios from 'axios';

/**
 * Script to test that a restaurant-added menu item is visible in the user menu.
 * 1) Login as restaurant
 * 2) Add a simple item to a section
 * 3) Fetch public menu and verify the item is present
 *
 * Fill in the TODO values before running.
 */

const BASE_URL = 'http://localhost:5000'; // Change if your backend runs on different host/port

// TODO: replace with a real restaurant credentials and IDs
const RESTAURANT_EMAIL = 'restaurant@example.com';
const RESTAURANT_PASSWORD = 'password123';
// This is the identifier used in /api/user/restaurants/:id/menu (could be restaurantId, slug, or mongo _id)
const PUBLIC_RESTAURANT_ID = 'RESTAURANT_ID_OR_SLUG_HERE';
// Section ID where item will be added
const SECTION_ID = 'SECTION_ID_HERE';

async function loginRestaurant() {
  const res = await axios.post(`${BASE_URL}/api/restaurant/auth/login`, {
    email: RESTAURANT_EMAIL,
    password: RESTAURANT_PASSWORD,
  });
  return res.data.data.accessToken;
}

async function addItem(token) {
  const payload = {
    sectionId: SECTION_ID,
    item: {
      name: 'Test Auto Approved Dish',
      price: 99,
      isAvailable: true,
    },
  };

  const res = await axios.post(
    `${BASE_URL}/api/restaurant/menu/item`,
    payload,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return res.data.data.item;
}

async function fetchUserMenu() {
  const res = await axios.get(
    `${BASE_URL}/api/user/restaurants/${PUBLIC_RESTAURANT_ID}/menu`,
  );
  return res.data.data.menu;
}

async function main() {
  try {
    console.log('Logging in as restaurant...');
    const token = await loginRestaurant();
    console.log('Restaurant logged in.');

    console.log('Adding test item...');
    const newItem = await addItem(token);
    console.log('Item created:', { id: newItem.id, approvalStatus: newItem.approvalStatus });

    console.log('Fetching user-facing menu...');
    const menu = await fetchUserMenu();

    const found = (menu.sections || []).some(section =>
      (section.items || []).some(i => String(i.id) === String(newItem.id)) ||
      (section.subsections || []).some(sub =>
        (sub.items || []).some(i => String(i.id) === String(newItem.id)),
      ),
    );

    if (found) {
      console.log('✅ Test passed: new dish is visible in user menu.');
    } else {
      console.error('❌ Test failed: new dish NOT visible in user menu.');
    }
  } catch (err) {
    console.error('Script error:', err.response?.data || err.message);
  }
}

main();

