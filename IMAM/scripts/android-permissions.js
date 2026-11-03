'use strict';
// Adds the microphone permissions IMAM needs to the generated Android project.
// Run after `npx cap add android` (npm run android:setup does it for you). Safe to run again.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(file)) { console.error('android/ not found. Run: npx cap add android'); process.exit(1); }
let xml = fs.readFileSync(file, 'utf8');
const perms = ['android.permission.INTERNET', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'];
const missing = perms.filter(p => !xml.includes(`"${p}"`));
if (missing.length) {
  xml = xml.replace('</manifest>', missing.map(p => `    <uses-permission android:name="${p}" />`).join('\n') + '\n</manifest>');
  fs.writeFileSync(file, xml);
}
console.log(missing.length ? 'Added: ' + missing.join(', ') : 'Microphone permissions already present.');
