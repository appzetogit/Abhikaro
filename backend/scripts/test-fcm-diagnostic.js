#!/usr/bin/env node

/**
 * Comprehensive FCM Diagnostic Script
 * 
 * Tests every part of the FCM flow and identifies issues:
 * 1. Environment variables check
 * 2. MongoDB connection
 * 3. Firebase Admin SDK initialization
 * 4. Database schema check
 * 5. Backend route accessibility
 * 6. Frontend integration points
 * 
 * Usage: node scripts/test-fcm-diagnostic.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import FcmToken from '../modules/fcm/models/FcmToken.js';
import { initializeFcm, sendNotification } from '../modules/fcm/services/fcmService.js';
import admin from 'firebase-admin';

async function checkEnvVars() {
  console.log('1️⃣ Checking Environment Variables...\n');
  
  const required = {
    'FIREBASE_PROJECT_ID': process.env.FIREBASE_PROJECT_ID,
    'FIREBASE_CLIENT_EMAIL': process.env.FIREBASE_CLIENT_EMAIL,
    'FIREBASE_PRIVATE_KEY': process.env.FIREBASE_PRIVATE_KEY,
    'FIREBASE_API_KEY': process.env.FIREBASE_API_KEY,
    'FIREBASE_AUTH_DOMAIN': process.env.FIREBASE_AUTH_DOMAIN,
    'FIREBASE_STORAGE_BUCKET': process.env.FIREBASE_STORAGE_BUCKET,
    'FIREBASE_MESSAGING_SENDER_ID': process.env.FIREBASE_MESSAGING_SENDER_ID,
    'FIREBASE_APP_ID': process.env.FIREBASE_APP_ID,
  };
  
  const optional = {
    'FIREBASE_VAPID_KEY': process.env.FIREBASE_VAPID_KEY || 'Not set (can be in Admin Panel)',
  };
  
  let allGood = true;
  
  console.log('   Required Variables:');
  Object.entries(required).forEach(([key, value]) => {
    const status = value && value !== '' ? '✅' : '❌';
    if (!value || value === '') allGood = false;
    console.log(`   ${status} ${key}: ${value ? (key.includes('KEY') ? value.substring(0, 20) + '...' : value) : 'MISSING'}`);
  });
  
  console.log('\n   Optional Variables:');
  Object.entries(optional).forEach(([key, value]) => {
    const status = value && !value.includes('Not set') ? '✅' : '⚠️';
    console.log(`   ${status} ${key}: ${value}`);
  });
  
  console.log('');
  return allGood;
}

async function checkMongoDB() {
  console.log('2️⃣ Checking MongoDB Connection...\n');
  
  try {
    await connectDB();
    const state = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    console.log(`   Status: ${states[state]}`);
    
    if (state === 1) {
      console.log('   ✅ MongoDB connected\n');
      return true;
    } else {
      console.log('   ❌ MongoDB not connected\n');
      return false;
    }
  } catch (err) {
    console.log(`   ❌ MongoDB connection failed: ${err.message}\n`);
    return false;
  }
}

async function checkFirebaseAdmin() {
  console.log('3️⃣ Checking Firebase Admin SDK...\n');
  
  try {
    const initialized = initializeFcm();
    if (initialized) {
      console.log('   ✅ Firebase Admin SDK initialized');
      
      // Try to verify it works
      try {
        const apps = admin.apps;
        if (apps.length > 0) {
          console.log(`   ✅ Firebase app found: ${apps[0].name}`);
        }
      } catch (e) {
        console.log('   ⚠️  Firebase app initialized but verification failed');
      }
      console.log('');
      return true;
    } else {
      console.log('   ❌ Firebase Admin SDK initialization failed');
      console.log('   Check: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n');
      return false;
    }
  } catch (err) {
    console.log(`   ❌ Firebase Admin SDK error: ${err.message}\n`);
    return false;
  }
}

async function checkDatabaseSchema() {
  console.log('4️⃣ Checking Database Schema...\n');
  
  try {
    const count = await FcmToken.countDocuments();
    console.log(`   📊 Total FCM tokens in DB: ${count}`);
    
    if (count > 0) {
      const latest = await FcmToken.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      
      console.log('\n   Latest tokens:');
      latest.forEach((t, idx) => {
        console.log(`   ${idx + 1}. Role: ${t.role}, Platform: ${t.platform}`);
        console.log(`      UserId: ${t.userId}`);
        console.log(`      Created: ${t.createdAt?.toISOString()}`);
        console.log(`      Token: ${t.fcmToken.substring(0, 30)}...`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  No tokens found in database');
    }
    
    console.log('');
    return true;
  } catch (err) {
    console.log(`   ❌ Database check failed: ${err.message}\n`);
    return false;
  }
}

async function checkBackendRoute() {
  console.log('5️⃣ Checking Backend Route...\n');
  
  try {
    const http = await import('http');
    
    return new Promise((resolve) => {
      const req = http.get('http://localhost:5000/firebase-messaging-sw.js', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('   ✅ Service worker route accessible');
            console.log(`   ✅ Response length: ${data.length} bytes`);
            if (data.includes('firebase.initializeApp')) {
              console.log('   ✅ Contains Firebase initialization');
            } else {
              console.log('   ⚠️  Missing Firebase initialization');
            }
            console.log('');
            resolve(true);
          } else {
            console.log(`   ❌ Route returned status: ${res.statusCode}\n`);
            resolve(false);
          }
        });
      });
      
      req.on('error', (err) => {
        console.log(`   ❌ Backend not running or route not accessible: ${err.message}`);
        console.log('   Make sure backend is running on port 5000\n');
        resolve(false);
      });
      
      req.setTimeout(3000, () => {
        req.destroy();
        console.log('   ❌ Request timeout - backend may not be running\n');
        resolve(false);
      });
    });
  } catch (err) {
    console.log(`   ❌ Route check failed: ${err.message}\n`);
    return false;
  }
}

async function generateReport(results) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 DIAGNOSTIC REPORT\n');
  
  const allPassed = Object.values(results).every(r => r === true);
  
  if (allPassed) {
    console.log('✅ All checks passed!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Restart frontend server');
    console.log('   2. Clear browser cache & service workers');
    console.log('   3. Login from app and allow notifications');
    console.log('   4. Run: node scripts/test-fcm-tokens.js');
  } else {
    console.log('❌ Issues found:\n');
    
    if (!results.envVars) {
      console.log('   • Missing required environment variables');
      console.log('     Fix: Add missing vars to backend/.env\n');
    }
    
    if (!results.mongodb) {
      console.log('   • MongoDB connection failed');
      console.log('     Fix: Check MONGODB_URI in backend/.env\n');
    }
    
    if (!results.firebase) {
      console.log('   • Firebase Admin SDK not initialized');
      console.log('     Fix: Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n');
    }
    
    if (!results.backendRoute) {
      console.log('   • Backend route not accessible');
      console.log('     Fix: Start backend server: npm run dev\n');
    }
    
    if (results.dbSchema && results.dbSchema === 0) {
      console.log('   • No FCM tokens in database');
      console.log('     This is normal if you haven\'t logged in yet');
      console.log('     After fixing other issues, login and allow notifications\n');
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function main() {
  try {
    console.log('🔍 FCM Diagnostic Test\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const results = {
      envVars: await checkEnvVars(),
      mongodb: await checkMongoDB(),
      firebase: await checkFirebaseAdmin(),
      dbSchema: await checkDatabaseSchema(),
      backendRoute: await checkBackendRoute(),
    };
    
    await generateReport(results);
    
  } catch (err) {
    console.error('❌ Diagnostic test failed:', err.message);
    console.error(err.stack);
  } finally {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }
}

main();
