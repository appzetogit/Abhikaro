import fs from 'fs';
import path from 'path';

try {
  const logPath = path.resolve('error.log');
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf16le');
    console.log('--- error.log content ---');
    console.log(content);
  } else {
    console.log('error.log does not exist');
  }
} catch (err) {
  console.error('Failed to read error.log:', err);
}
