const fs = require('node:fs');

const envText = fs.readFileSync('server/.env', 'utf8');
const rows = {};

for (const line of envText.split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const index = line.indexOf('=');
  if (index < 0) continue;
  rows[line.slice(0, index)] = line.slice(index + 1);
}

for (const key of [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'CLIENT_URL',
  'PORT'
]) {
  const value = rows[key] || '';
  console.log(key, value.includes('PASTE') ? 'PLACEHOLDER' : 'SET', `len=${value.length}`);
}

const privateKey = rows.FIREBASE_PRIVATE_KEY || '';
console.log('PRIVATE_KEY_HAS_BEGIN', privateKey.includes('BEGIN PRIVATE KEY'));
console.log('PRIVATE_KEY_HAS_ESCAPED_NEWLINES', privateKey.includes('\\n'));
console.log('PRIVATE_KEY_IS_QUOTED', privateKey.startsWith('"') && privateKey.endsWith('"'));
