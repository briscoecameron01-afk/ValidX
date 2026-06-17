# ValidX — Marketing Site + PWA

The Uber-style marketplace that connects startups and small businesses to real testers. Launch micro-experiments, get market signals in days.

## What's in here

```
validx-site/
├── index.html        Marketing homepage (hero, pricing, CTA)
├── app.html          The full PWA — business + tester flows
├── offline.html      Offline fallback page served by the SW
├── manifest.json     PWA manifest (icons, shortcuts, theme)
├── sw.js             Service worker (network-first pages, cache-first assets)
├── robots.txt        Crawler rules
├── sitemap.xml       Sitemap for indexing
├── netlify.toml      Netlify deployment config
├── vercel.json       Vercel deployment config
└── icons/
    ├── favicon.ico
    ├── favicon-16.png, favicon-32.png
    ├── apple-touch-icon.png      180x180
    ├── icon-192.png, icon-256.png, icon-384.png, icon-512.png
    └── icon-maskable-512.png     Android adaptive icon
```

There is no build step. Everything is plain HTML/CSS/JS — the app uses React + Babel loaded from a CDN and compiles JSX in the browser.

## Local development

Because service workers and the manifest require a real HTTP origin (not `file://`), serve the folder over HTTP:

```sh
# Option 1 — Python (no install)
cd validx-site
python3 -m http.server 8080

# Option 2 — Node
npx serve -p 8080

# Then open http://localhost:8080
```

Then visit:

- http://localhost:8080/            — marketing site
- http://localhost:8080/app.html    — the PWA

## Deploying

### Netlify (easiest)
1. Drag-and-drop the `validx-site` folder to https://app.netlify.com/drop
2. Or connect a Git repo — `netlify.toml` is already configured.

### Vercel
1. Run `vercel` from inside the folder, or
2. Import the repo on vercel.com — `vercel.json` is already configured.

### GitHub Pages
1. Push the folder to a repo.
2. Settings → Pages → deploy from branch → `main` / root.
3. Note: the service worker scope needs to be at the root of the repo, so either use a user/org page (`username.github.io`) or put the files at the root of the repo.

### Cloudflare Pages
1. Connect the repo, set the build output directory to `.`, no build command needed.

## Hooking up a custom domain (validx.com)

1. Buy `validx.com` from any registrar (Namecheap, Cloudflare, Porkbun, etc.).
2. In your host's dashboard (Netlify/Vercel/etc.) add the custom domain.
3. Update DNS to the host's CNAME/A records (your provider will walk you through this).
4. HTTPS is automatic on all the hosts above.

Then update the absolute URLs in:
- `sitemap.xml` (currently `https://validx.com/...`)
- `robots.txt` (sitemap link)
- The `og:url` meta in `index.html`

## PWA install flow

Once deployed over HTTPS:

- **iOS Safari**: Share → "Add to Home Screen"
- **Android Chrome**: The install banner appears automatically. Users can also use ⋮ → "Install app"
- **Desktop Chrome/Edge**: An install icon appears in the address bar

The manifest ships with three shortcuts (Create Experiment, Browse, Earnings) that appear when you long-press the installed icon on Android.

## Next steps for launch

- [ ] **Wire up real payments** — Stripe Checkout for business payments, PayPal Payouts API for tester cashouts. The UI is already in place in `app.html`.
- [ ] **Add a backend** — right now all state lives in `localStorage`. For real users you'll want Supabase or Firebase (auth + a Postgres/Firestore DB + storage for uploaded files).
- [ ] **Auth** — add magic-link / Google / Apple sign-in so users can sync across devices.
- [ ] **Analytics** — add Plausible or GA4 to `index.html` to track conversion.
- [ ] **Transactional email** — Resend or Postmark for experiment notifications and payout confirmations.
- [ ] **Legal pages** — Terms of Service, Privacy Policy (required before accepting payments and for App Store / Play Store submission).

## Tech stack

- HTML5 + CSS (custom, no framework) for the marketing site
- React 18 via CDN + in-browser Babel for the app (single-file, no build)
- Service worker with a network-first strategy for pages and cache-first for assets
- LocalStorage for client-side persistence
- Web Manifest with shortcuts, maskable icon, and portrait lock

## License

© 2026 ValidX. All rights reserved.
