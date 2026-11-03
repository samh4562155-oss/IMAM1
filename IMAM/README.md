# IMAM – Smart Prayer Companion

An Arabic RTL web application prototype for deaf and hard-of-hearing Muslims following congregational prayer. It uses a two-screen interface, a procedural Three.js 3D prayer character, Node.js/Express, browser microphone capture, Deepgram Nova-3 Arabic streaming transcription, and a deterministic prayer-state machine.

## Requirements
- Node.js 20 or newer (Node 22 LTS recommended)
- npm
- A Deepgram API key with permission to create temporary tokens (Member permission or higher)
- A modern browser (Chrome/Edge recommended)

## Windows installation
1. Install Node.js LTS from https://nodejs.org/.
2. Extract the ZIP file.
3. Open the extracted `IMAM` folder.
4. Copy `.env.example` and rename the copy to `.env`.
5. Open `.env` in Notepad and replace the placeholder with your Deepgram key:
   `DEEPGRAM_API_KEY=your_real_key`
6. Open Command Prompt or PowerShell in the project folder.
7. Run `npm install`.
8. Run `npm test` to run automated tests.
9. Run `npm start`.
10. Open http://localhost:3000 in Chrome or Edge.
11. Choose a prayer and microphone, then click **ابدأ الصلاة والاستماع** and allow microphone access.
12. The prayer screen shows the 3D character and the two supported phrases. Three.js is loaded from a CDN, so an internet connection is needed for the 3D model.

Do not share `.env` or upload it to GitHub. The permanent API key is used only by the backend. The backend requests a short-lived Deepgram JWT and returns that temporary token to the browser.

## Deepgram details
- Temporary token endpoint: `POST https://api.deepgram.com/v1/auth/grant`
- Token authentication: `Authorization: Token <permanent API key>`
- Live transcription: `wss://api.deepgram.com/v1/listen`
- Model/language: `model=nova-3&language=ar`
- The browser WebSocket uses the temporary JWT with the `bearer` WebSocket subprotocol because browser WebSocket APIs do not allow custom Authorization headers.

## API endpoints
- `GET /api/health` – backend health check
- `POST /api/deepgram-token` – creates a short-lived Deepgram token

## What's new in this version
- **Two-step Tasleem and completion.** After the final tashahhud, the first recognized `السلام عليكم ورحمة الله` turns the figure's head to the right (التسليم يمينًا); the second turns it to the left (التسليم يسارًا) and shows **تمت الصلاة / Prayer Completed**. Exactly two tasleems; further speech is ignored, the figure stays seated, no new cycle starts, and listening stops automatically.
- **Improved 3D figure.** A jointed procedural figure (pelvis, spine, chest, neck, head, shoulders, elbows, wrists, hips, knees, ankles) built from smooth capsules in a white thobe and kufi, on a prayer rug, with soft shadows. Every pose is a set of joint rotations blended with quaternion interpolation, so limbs stay connected and transitions are smooth. The camera moves to a closer view for sitting/sujud and a front view for tasleem so the head turn is clear. No external model file is used (no licensing concerns); built only with three.js r160 (already used).
- **Screen flash.** When a phrase is accepted (الله أكبر، سمع الله لمن حمده، السلام عليكم ورحمة الله) the whole screen lights up once with the phrase in very large dark text, then fades out (~1.1 s). It never blocks touches and never strobes. With the system "reduce motion" setting on, a steady panel is shown briefly instead of an animated flash.
- **Flash on/off setting** on the home screen (on by default, remembered on the device). Turning it off changes nothing else: recognition, movements and the phrase under the figure keep working.
- **Minimal prayer screen:** the figure, the current position (with rakah number), the recognized phrase under the figure, a small listening dot, and one small "إنهاء" (exit) button.
- **Recognition safety:** the state machine now lives in `lib/prayer.js` and is shared by the browser (`/lib/prayer.js`) and the tests. Interim results are ignored; low confidence (<0.72) ignored; the same Deepgram segment is never processed twice; the same phrase within 1.4 s is treated as a duplicate; phrases that don't fit the current stage do nothing (no skipped stages, no early completion). A Deepgram KeepAlive is sent every 8 s for long sessions.
- Testing hook (browser console): `__imam.showPrayer()` then `__imam.say('الله أكبر')` simulates recognized speech without a microphone.

## Important behavior and limitations
- Only exact normalized forms of `الله أكبر`, `سمع الله لمن حمده` and `السلام عليكم ورحمة الله` are eligible for state transitions.
- The 3D figure is a stylized procedural illustration, not photorealistic and not a religious authority.
- Sitting positions use iftirash. Middle tashahhud is modeled after the second rakah for prayers with more than two rakahs.
- This is a rule-based guide and not a substitute for following the imam. Room acoustics, microphone placement and transcription errors can affect recognition.

## Android app (Capacitor) — version 1.1

This project is **prepared** for Android packaging. It is not an APK yet; you build the APK yourself with Android Studio (steps below).

### What runs where
| Part | Where it lives | Why |
|---|---|---|
| `public/`, `lib/prayer.js`, three.js (screens, 3D figure, prayer sequence) | **Inside the APK** (`www/` folder) | Works offline; no CDN needed for the 3D model |
| `server.js` (Express): `/api/deepgram-token`, `/api/health` | **Must stay hosted on an HTTPS server** | It holds `DEEPGRAM_API_KEY`. The app only receives a 60-second token |
| Deepgram speech recognition | Deepgram cloud (`wss://api.deepgram.com`) | The phone streams audio directly with the short-lived token |

Never put the Deepgram key in the app: anything inside an APK can be extracted. `npm run build:mobile` stops if it finds the key in the bundle.

### 1. Host the backend
Deploy this folder to any Node host with HTTPS (Render, Railway, Fly.io, a VPS). Set these environment variables on the host (not in the app):
- `DEEPGRAM_API_KEY` – your key
- `ALLOWED_ORIGINS` – optional extra web origins. The Android app origin (`https://localhost`) is always allowed.
- `TOKEN_RATE_LIMIT` – optional, default 20 tokens per device per 10 minutes

Check: `https://YOUR-SERVER/api/health` returns `{"status":"ok"}`.

### 2. Build the Android project (on your computer)
Requirements: Node 20+, Android Studio (Android SDK + JDK 17+).
```
npm install
PowerShell:  $env:IMAM_API_BASE="https://YOUR-SERVER"
CMD:         set IMAM_API_BASE=https://YOUR-SERVER
npm run android:setup     # builds www/, creates android/, adds microphone permission, syncs
npm run android:open      # opens Android Studio
```
You can also put `IMAM_API_BASE=...` in `.env`. After any change in `public/`, run `npm run android:sync`.

### 3. Create the APK
In Android Studio: wait for Gradle sync, then **Build → Build App Bundle(s) / APK(s) → Build APK(s)**. Test APK: `android/app/build/outputs/apk/debug/app-debug.apk`. For the Play Store use **Build → Generate Signed App Bundle / APK** with your own signing key (keep it private).

On first start Android asks for microphone permission — tap **Allow**.

### Mobile changes in this version
- Bigger touch buttons, full-width buttons on phones, safe areas for notches and gesture bars, landscape support.
- Screen stays on during prayer (Wake Lock).
- Android back button/gesture on the prayer screen returns home and stops listening.
- three.js bundled locally (`/vendor/three.min.js`) with CDN fallback.
- Home screen shows a message if the server can't be reached.
- Server: CORS allow-list for the app and a per-device rate limit on Deepgram tokens.


## Install IMAM on an Android phone (PWA — no Android Studio)

This project now includes a web-app manifest, home-screen icons, and a service worker. After the site is deployed on an HTTPS address, open that address in Chrome on Android, open the three-dot menu, then choose **Install app** (or **Add to Home screen**).

**Important:** this ZIP is not an APK and does not publish the website by itself. The Express server must be deployed to a Node.js host with HTTPS. Set `DEEPGRAM_API_KEY` in the host's private environment-variable settings; never put the permanent key in `public/`, the manifest, the service worker, or a ZIP shared publicly. The `/api/deepgram-token` endpoint remains on the server. Live speech recognition requires internet access and a working Deepgram account/key. The service worker only caches the app shell; it does not make speech recognition work offline.

### Deployment checklist
1. Deploy this `IMAM` folder to a Node.js host that supports Node 20 or newer and provides HTTPS.
2. Set the host environment variable `DEEPGRAM_API_KEY` to your key using the host dashboard's secret/environment settings. Do not send the key in chat.
3. Set the host start command to `npm start` (the host should install dependencies from `package.json`).
4. Open `https://YOUR-DOMAIN/api/health`. It should return JSON with `"status":"ok"`.
5. Open `https://YOUR-DOMAIN` on the Android phone in Chrome and install it from the browser menu.

The free plans and limits of hosting providers change. Check the provider's current pricing and sleep/usage limits before deploying; do not add a payment method unless you choose to.
