'use strict';
require('dotenv').config();
const express = require('express');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

// ---- CORS: only the Android app (Capacitor WebView) and origins you list may call the API ----
// Capacitor Android serves the app from https://localhost (default) — older setups use http://localhost or capacitor://localhost.
const DEFAULT_APP_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost'];
const allowedOrigins = new Set([
  ...DEFAULT_APP_ORIGINS,
  ...String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
]);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,X-Imam-Client');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  next();
});

// ---- Simple per-IP rate limit for the token endpoint (protects your Deepgram balance) ----
const TOKEN_LIMIT = Number(process.env.TOKEN_RATE_LIMIT || 20);   // tokens per IP per window
const TOKEN_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();
function tokenRateLimit(req, res, next) {
  const now = Date.now(), key = req.ip || 'unknown';
  const entry = hits.get(key);
  if (!entry || now - entry.start > TOKEN_WINDOW_MS) { hits.set(key, { start: now, count: 1 }); return next(); }
  if (++entry.count > TOKEN_LIMIT) return res.status(429).json({ error: 'طلبات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.' });
  next();
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > TOKEN_WINDOW_MS) hits.delete(k); }, 60 * 1000).unref();

app.use(express.static(path.join(__dirname, 'public')));
// Shared prayer state machine (same file the tests use) and the locally bundled three.js.
app.get('/lib/prayer.js', (_req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'lib', 'prayer.js')));
app.get('/vendor/three.min.js', (_req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'node_modules', 'three', 'build', 'three.min.js')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'IMAM', timestamp: new Date().toISOString() }));

// The permanent key remains on the server. Deepgram issues a short-lived JWT for browser use.
app.post('/api/deepgram-token', tokenRateLimit, async (_req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'لم يتم إعداد مفتاح Deepgram على الخادم. أضفه إلى ملف .env.' });
  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: 60 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Deepgram token error:', response.status, data);
      return res.status(response.status).json({ error: 'تعذر إنشاء رمز Deepgram. تحقق من المفتاح وصلاحياته.' });
    }
    return res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (error) {
    console.error('Deepgram request failed:', error.message);
    return res.status(502).json({ error: 'تعذر الاتصال بخدمة Deepgram.' });
  }
});

module.exports = app;
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Not found' }) : res.sendFile(path.join(__dirname, 'public', 'index.html')));
if (require.main === module) app.listen(PORT, () => console.log(`IMAM running at http://localhost:${PORT}`));
