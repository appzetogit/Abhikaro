#!/usr/bin/env node

/**
 * Kill process running on a specific port (Windows/PowerShell compatible)
 * 
 * Usage: node scripts/kill-port.js [port]
 * Example: node scripts/kill-port.js 5000
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const port = process.argv[2] || '5000';

console.log(`🔍 Finding process on port ${port}...`);

try {
  // Windows PowerShell command to find and kill process on port
  const command = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`;
  
  await execAsync(command);
  console.log(`✅ Port ${port} is now free!`);
  console.log(`\nYou can now start your server with: npm run dev`);
} catch (error) {
  // If no process found, that's okay
  if (error.message.includes('Cannot find a process')) {
    console.log(`✅ Port ${port} is already free!`);
  } else {
    console.log(`\n⚠️  Could not automatically kill process on port ${port}`);
    console.log(`\nManual steps:`);
    console.log(`1. Open PowerShell`);
    console.log(`2. Run: Get-NetTCPConnection -LocalPort ${port} | Select-Object OwningProcess`);
    console.log(`3. Note the PID, then run: Stop-Process -Id <PID> -Force`);
    console.log(`\nOr use Task Manager to find and end the Node.js process`);
  }
}
