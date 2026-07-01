import mongoose from 'mongoose';
import 'dotenv/config';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

async function testSync() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Create a temporary restaurant to test
    const testRest = await Restaurant.create({
      name: 'Temp Test Restaurant',
      ownerName: 'Test Owner',
      phone: '9999999999',
      ownerPhone: '9999999999',
      ownerEmail: 'temp@test.com'
    });
    console.log('Created test restaurant:', {
      id: testRest._id,
      phone: testRest.phone,
      ownerPhone: testRest.ownerPhone,
      email: testRest.email,
      ownerEmail: testRest.ownerEmail,
    });

    // Update ownerEmail and ownerPhone via document assignment and save
    testRest.ownerEmail = 'new-owner@test.com';
    testRest.ownerPhone = '8888888888';
    await testRest.save();

    const updated = await Restaurant.findById(testRest._id);
    console.log('After update of owner credentials:', {
      phone: updated.phone,
      ownerPhone: updated.ownerPhone,
      email: updated.email,
      ownerEmail: updated.ownerEmail,
    });

    // Verify synchronizations
    const pass = updated.phone === '918888888888' && updated.email === 'new-owner@test.com';
    console.log('Test result:', pass ? '✅ PASSED' : '❌ FAILED');

    // Cleanup
    await Restaurant.findByIdAndDelete(testRest._id);
    console.log('Cleaned up test restaurant');
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

testSync();
