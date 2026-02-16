#!/usr/bin/env node

/**
 * Helper script to convert Firebase service account JSON to .env format
 * 
 * Usage:
 *   1. Save your service account JSON to a temporary file (e.g., temp-firebase-key.json)
 *   2. Run: node scripts/setup-firebase-env.js temp-firebase-key.json
 *   3. Copy the output to your backend/.env file
 *   4. DELETE the temporary JSON file immediately
 * 
 * SECURITY: Never commit the JSON file or .env file to git
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error('❌ Error: Please provide the path to your Firebase service account JSON file');
  console.log('\nUsage: node scripts/setup-firebase-env.js <path-to-json-file>');
  console.log('\nExample: node scripts/setup-firebase-env.js temp-firebase-key.json');
  process.exit(1);
}

if (!fs.existsSync(jsonFilePath)) {
  console.error(`❌ Error: File not found: ${jsonFilePath}`);
  process.exit(1);
}

try {
  const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
  const credentials = JSON.parse(jsonContent);

  // Extract values
  const projectId = credentials.project_id;
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Error: JSON file is missing required fields (project_id, client_email, private_key)');
    process.exit(1);
  }

  // Format private key: replace actual newlines with \n and wrap in quotes
  const formattedPrivateKey = privateKey
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\n/g, '\\n')   // Replace newlines with \n
    .replace(/"/g, '\\"');   // Escape quotes

  // Generate .env content
  const envContent = `# Firebase Admin SDK (for FCM push notifications)
# Generated from service account JSON - DO NOT COMMIT TO GIT
FIREBASE_PROJECT_ID=${projectId}
FIREBASE_CLIENT_EMAIL=${clientEmail}
FIREBASE_PRIVATE_KEY="${formattedPrivateKey}"
`;

  console.log('\n✅ Firebase credentials formatted successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Copy the following lines to your backend/.env file:\n');
  console.log(envContent);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⚠️  SECURITY REMINDERS:');
  console.log('   1. DELETE the JSON file immediately after copying to .env');
  console.log('   2. Never commit .env or the JSON file to git');
  console.log('   3. Restart your backend server after adding these credentials\n');

} catch (err) {
  console.error('❌ Error processing JSON file:', err.message);
  process.exit(1);
}
