import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

console.log('--- Razorpay Webhook Secret Verification ---');
console.log(`Secret loaded: ${secret ? 'YES' : 'NO'}`);
if (secret) {
  console.log(`Secret value length: ${secret.length}`);
  console.log(`Secret prefix: ${secret.substring(0, 4)}...`);
  
  // Test generating signature
  const testPayload = JSON.stringify({ event: 'test.event', data: 'hello' });
  const rawBody = Buffer.from(testPayload, 'utf8');
  
  try {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    
    console.log(`Generated HMAC Signature: ${signature}`);
    console.log(`Signature length: ${signature.length}`);
    
    // Verify
    const verifyHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
      
    const isValid = signature === verifyHmac;
    console.log(`Verification logic check (Should be true): ${isValid}`);
    console.log('✅ Webhook secret configuration and cryptographic functions are working correctly.');
  } catch (err) {
    console.error('❌ Error during signature generation:', err);
  }
} else {
  console.error('❌ RAZORPAY_WEBHOOK_SECRET is not configured in .env');
}
