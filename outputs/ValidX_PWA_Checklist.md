# ValidX — PWA Readiness Checklist

Use this checklist to audit every piece of your Progressive Web App before launch. Items marked ✅ are already done in your current build. Items marked ⬜ still need attention.

---

## 1. Web App Manifest

- ✅ `manifest.json` linked in both `app.html` and `index.html`
- ✅ `name` and `short_name` defined
- ✅ `start_url` set (`./app.html`)
- ✅ `scope` set (`./`)
- ✅ `id` set (`/validx`)
- ✅ `display: standalone` with `display_override` fallback to `minimal-ui`
- ✅ `theme_color` and `background_color` set (#6366F1 / #0F172A)
- ✅ `orientation: portrait`
- ✅ `categories` defined (business, productivity, finance)
- ✅ `shortcuts` defined — Create Experiment, Browse, Earnings
- ✅ `prefer_related_applications: false`
- ⬜ Add `screenshots` array (at least one wide + one narrow) — required for the richer install prompt on Android/Chrome
- ⬜ Add `description` to each shortcut icon entry (optional but improves discoverability)

---

## 2. Icons

- ✅ `icon-192.png` (192×192, purpose: any)
- ✅ `icon-256.png` (256×256)
- ✅ `icon-384.png` (384×384)
- ✅ `icon-512.png` (512×512)
- ✅ `icon-maskable-512.png` (512×512, purpose: maskable)
- ✅ `apple-touch-icon.png` (180×180)
- ✅ `favicon.ico`, `favicon-16.png`, `favicon-32.png`
- ⬜ Test maskable icon in [Maskable.app](https://maskable.app/) — confirm safe zone doesn't clip the "VX" text
- ⬜ Add a `monochrome` purpose icon (optional — used by some Android themes)

---

## 3. Service Worker

- ✅ `sw.js` registered from both `app.html` and `index.html`
- ✅ Version-based cache naming (`v3`) for clean upgrades
- ✅ Three cache buckets: static, pages, CDN
- ✅ Core assets pre-cached on install
- ✅ Network-first strategy for HTML pages
- ✅ Cache-first with background refresh for static assets and CDN libs
- ✅ Offline fallback to `offline.html`
- ✅ Old caches deleted on activate
- ✅ `SKIP_WAITING` message listener for push-button updates
- ⬜ Add a `/api/` bypass — service worker should **not** cache API calls once you wire up the backend (add `if (url.pathname.startsWith('/api')) return;` before the routing logic)
- ⬜ Add cache size limits — stale-while-revalidate caches can grow unbounded; cap CACHE_CDN and CACHE_PAGES at ~50 entries
- ⬜ Add error logging — wrap fetch failures in a `console.warn` so you can debug offline issues
- ⬜ Test the upgrade flow: change VERSION to `v4`, deploy, confirm old caches get cleaned up

---

## 4. Offline Experience

- ✅ `offline.html` exists with auto-reload on `online` event
- ✅ Core pages cached so the app shell loads offline
- ⬜ Test killing network after first load — does the app shell render? Do cached pages load?
- ⬜ Verify that `offline.html` is actually served when all caches miss (clear caches, go offline, navigate)
- ⬜ Add visible offline indicator in the app UI (e.g., a banner: "You're offline — some features unavailable")
- ⬜ Ensure localStorage data persists offline (it does, but test that dashboards still render with cached data)

---

## 5. Install Prompt

- ✅ `beforeinstallprompt` event captured in `app.html`
- ⬜ Add a visible "Install App" button in settings or onboarding that triggers the saved prompt
- ⬜ Handle `appinstalled` event — hide the install button, maybe show a "Thanks for installing!" toast
- ⬜ For iOS: add an in-app banner with instructions ("Tap Share → Add to Home Screen") since iOS Safari doesn't fire `beforeinstallprompt`

---

## 6. Meta Tags & Head

- ✅ `<meta name="theme-color">` set
- ✅ `<meta name="apple-mobile-web-app-capable" content="yes">`
- ✅ `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- ✅ `<meta name="apple-mobile-web-app-title" content="ValidX">`
- ✅ `<meta name="mobile-web-app-capable" content="yes">`
- ✅ `viewport` with `viewport-fit=cover` for notch handling
- ✅ Safe area insets via CSS `env()` variables
- ⬜ Add `<meta name="msapplication-TileColor" content="#0F172A">` for Windows tiles
- ⬜ Add `<link rel="mask-icon" href="..." color="#6366F1">` for Safari pinned tab (SVG required)

---

## 7. HTTPS & Security

- ⬜ Confirm the site is served over HTTPS (required for service workers)
- ⬜ Netlify auto-provisions TLS — verify `https://validx.com` loads with a valid cert
- ⬜ Confirm HSTS header is set (already in your `netlify.toml`)
- ⬜ Verify `Content-Security-Policy` doesn't block CDN scripts (React, Babel) or inline styles
- ⬜ Test that the service worker doesn't register on `http://localhost` in dev (it will, but just be aware)

---

## 8. Performance

- ⬜ Run Lighthouse PWA audit — target 100 on the PWA badge
- ⬜ Run Lighthouse Performance audit — target 90+
- ⬜ Check First Contentful Paint — the Babel in-browser compile step is slow; consider pre-compiled bundles for production
- ⬜ Lazy-load non-critical images and heavy components
- ⬜ Add `loading="lazy"` to any images below the fold
- ⬜ Confirm the splash screen shows correctly on Android (icon + background_color from manifest) and iOS (apple-touch-icon)

---

## 9. Push Notifications (future)

- ⬜ Register for Push API in the service worker
- ⬜ Backend endpoint to store push subscriptions
- ⬜ Backend trigger to send notifications (new experiment matches, submission approved, payout complete)
- ⬜ Handle `notificationclick` event to deep-link into the app
- ⬜ Ask for notification permission at the right moment (not on first load — after the user takes a meaningful action)

---

## 10. App Store Listing (optional, future)

- ⬜ Use [PWABuilder](https://www.pwabuilder.com/) to package for the Microsoft Store
- ⬜ Use [Bubblewrap](https://github.com/nickvdp/nickvdp.github.io) / TWA to wrap for the Google Play Store
- ⬜ Add `related_applications` to manifest if you publish a TWA
- ⬜ Apple App Store requires a native wrapper (Capacitor or similar)

---

## 11. Testing Matrix

Test on all of these before launch:

| Platform | Browser | What to check |
|----------|---------|---------------|
| Android phone | Chrome | Install prompt, offline, notifications, shortcuts |
| Android phone | Samsung Internet | Install, offline |
| iPhone | Safari | Add to Home Screen, standalone mode, safe areas |
| iPad | Safari | Layout at tablet width, standalone mode |
| Desktop | Chrome | Install prompt, window controls overlay |
| Desktop | Edge | Install prompt |
| Desktop | Firefox | Offline fallback (Firefox doesn't support install) |

---

## 12. Quick Validation Commands

Run these to sanity-check your setup before deploying:

```bash
# Validate manifest JSON
cat manifest.json | python3 -m json.tool

# Check all icons exist and aren't 0 bytes
ls -la icons/

# Verify service worker syntax
node --check sw.js 2>&1 || echo "SW has syntax errors"

# Start a local HTTPS server to test (requires mkcert)
npx serve --ssl-cert localhost.pem --ssl-key localhost-key.pem -l 8080

# Or just use plain HTTP for dev (SW still works on localhost)
python3 -m http.server 8080
```

---

## Current Score

| Category | Done | Remaining |
|----------|------|-----------|
| Manifest | 11/13 | screenshots, shortcut icon descriptions |
| Icons | 9/10 | maskable safe-zone test |
| Service Worker | 9/13 | API bypass, cache limits, error logging, upgrade test |
| Offline | 2/6 | real-world offline tests, UI indicator |
| Install Prompt | 1/4 | install button, appinstalled, iOS banner |
| Meta Tags | 7/9 | msapplication, mask-icon |
| HTTPS & Security | 0/5 | all post-deploy |
| Performance | 0/6 | all post-deploy |
| Push Notifications | 0/5 | future feature |
| App Store | 0/4 | future feature |

**Bottom line:** Your PWA foundation is solid — manifest, icons, service worker, and offline fallback are all in place. The remaining items are mostly testing, polish, and post-deploy verification. Run a Lighthouse audit as your single source of truth once you're live.
