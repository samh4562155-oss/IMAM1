'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.DEEPGRAM_API_KEY = 'test_secret_key_123456789';
process.env.TOKEN_RATE_LIMIT = '3';
const app = require('../server');
let server, base;
test.before(async () => { server = app.listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

test('Android app origin (https://localhost) is allowed by CORS', async () => {
  const r = await fetch(base + '/api/health', { headers: { Origin: 'https://localhost' } });
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://localhost');
});
test('unknown website origin is not allowed by CORS', async () => {
  const r = await fetch(base + '/api/deepgram-token', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
test('token endpoint is limited per device (limit 3 → 4th is 429)', async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await fetch(base + '/api/deepgram-token', { method: 'POST' })).status);
  assert.equal(codes[3], 429);
});
test('three.js is served locally so the 3D figure works without a CDN', async () => {
  const r = await fetch(base + '/vendor/three.min.js');
  assert.equal(r.status, 200);
});
test('mobile build contains no Deepgram key and points to the HTTPS server', () => {
  const root = path.join(__dirname, '..');
  execFileSync(process.execPath, ['scripts/build-mobile.js'], { cwd: root, env: { ...process.env, IMAM_API_BASE: 'https://imam.example.com' } });
  const www = path.join(root, 'www');
  const all = f => fs.statSync(f).isDirectory() ? fs.readdirSync(f).flatMap(n => all(path.join(f, n))) : [f];
  for (const f of all(www)) assert.ok(!fs.readFileSync(f, 'utf8').includes('test_secret_key_123456789'), f);
  assert.match(fs.readFileSync(path.join(www, 'config.js'), 'utf8'), /"https:\/\/imam\.example\.com"/);
  assert.ok(fs.existsSync(path.join(www, 'lib', 'prayer.js')) && fs.existsSync(path.join(www, 'vendor', 'three.min.js')));
});
test('mobile build refuses a non-HTTPS server address', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/build-mobile.js'], { cwd: path.join(__dirname, '..'), stdio: 'pipe', env: { ...process.env, IMAM_API_BASE: 'http://imam.example.com' } }));
});
