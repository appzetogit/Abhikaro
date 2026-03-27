import assert from 'assert';
import { normalizeIp, getClientIp } from '../shared/utils/ipUtils.js';

console.log('🧪 Starting Rate Limit & IP Normalization Tests...');

// 1. IP Normalization Tests
try {
  console.log('Testing IP Normalization...');
  
  assert.strictEqual(normalizeIp('::1'), '127.0.0.1', 'Should normalize IPv6 localhost');
  assert.strictEqual(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1', 'Should normalize IPv4-mapped IPv6');
  assert.strictEqual(normalizeIp('192.168.1.1:8080'), '192.168.1.1', 'Should strip port from IPv4');
  assert.strictEqual(normalizeIp('  1.2.3.4  '), '1.2.3.4', 'Should trim whitespace');
  assert.strictEqual(normalizeIp(null), '0.0.0.0', 'Should handle null');
  
  console.log('✅ IP Normalization tests passed!');
} catch (err) {
  console.error('❌ IP Normalization tests failed:', err.message);
  process.exit(1);
}

// 2. Client IP Extraction Tests (X-Forwarded-For)
try {
  console.log('Testing X-Forwarded-For Extraction...');
  
  const mockReq = {
    headers: {
      'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178'
    },
    connection: { remoteAddress: '127.0.0.1' }
  };
  
  const clientIp = getClientIp(mockReq);
  assert.strictEqual(clientIp, '203.0.113.195', 'Should take the first IP in the list');
  
  console.log('✅ Client IP extraction tests passed!');
} catch (err) {
  console.error('❌ Client IP extraction tests failed:', err.message);
  process.exit(1);
}

// 3. Rate Limit Key Generation Logic (Manual Check)
console.log('\n--- Key Generation Summary ---');
console.log('User Authenticated Key Example: rl:sw:u:654321:r:user');
console.log('Anonymous IP-based Key Example: rl:sw:ip:203.0.113.195');

console.log('\n🎉 All tests passed successfully!');
process.exit(0);
