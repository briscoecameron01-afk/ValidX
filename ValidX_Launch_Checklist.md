# ValidX — Launch Checklist

A step-by-step path to get the PWA, backend, and admin panel running locally and then live on the internet.

---

## Phase 1 — Run everything on your own computer (30 min)

Goal: confirm the app, API, and admin all work together on `localhost`.

### Install prerequisites
- [ ] Install **Node.js 20 or newer** — https://nodejs.org (the "LTS" version)
- [ ] Install **Git** — https://git-scm.com
- [ ] Open a terminal (Terminal on Mac, PowerShell on Windows)

### Start the backend API
- [ ] `cd validx-backend`
- [ ] `cp .env.example .env` (on Windows: `copy .env.example .env`)
- [ ] Open `.env` and change three things:
  - `JWT_SECRET` — any long random string, e.g. mash the keyboard for 40+ characters
  - `ADMIN_EMAIL` — the email you want to log into the admin panel with
  - `ADMIN_PASSWORD` — a strong password you'll remember
- [ ] `npm install` (takes 1–2 minutes the first time)
- [ ] `npm run seed` — creates 2 demo businesses, 3 demo testers, 3 sample experiments
- [ ] `npm start`
- [ ] Confirm you see `✔ ValidX API listening on http://localhost:4000`
- [ ] Open http://localhost:4000/api/health in a browser — you should see `{"ok":true,...}`

### Start the frontend marketing site + PWA
- [ ] Open a **second terminal** window (leave the backend running)
- [ ] `cd validx-site`
- [ ] `python3 -m http.server 8080` (or `npx serve -p 8080` if you don't have Python)
- [ ] Open http://localhost:8080 — you should see the marketing site
- [ ] Click "Launch App" — you should see the PWA splash screen, then onboarding, then role selection
- [ ] Click "I'm a Business" → the new **Register screen** should appear with name, email, password, company, industry fields
- [ ] Click "I'm a Tester" → the **Register screen** should show school, major, age (18+)
- [ ] Test the "Continue with Google" button — it should auto-fill a demo profile
- [ ] Test creating a real account — fill in all fields, click "Create Account"
- [ ] Confirm you land on the dashboard and your name/company shows in the topbar
- [ ] Click "Log out" → log back in to confirm credentials persist

### Open the admin panel
- [ ] Open http://localhost:4000/admin.html in your browser
- [ ] Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env`
- [ ] Click through all 5 sidebar sections — Dashboard, Users, Experiments, Submissions, Payouts
- [ ] Confirm you see the seeded data (2 businesses, 3 testers, 3 experiments)
- [ ] Try approving a pending submission — click "Review" → "Approve"
- [ ] Try marking the pending payout as paid in the Payouts tab

### Connect the PWA to the backend (optional for local dev)
- [ ] Decide if you want the PWA to talk to the real backend now or keep using localStorage for demos
- [ ] If connecting: open `validx-site/app.html`, follow the instructions in `validx-backend/README.md` → "Wiring the PWA to the backend"
- [ ] Update `CORS_ORIGINS` in `.env` to include `http://localhost:8080`
- [ ] Restart the backend

---

## Phase 2 — Buy your domain and set up accounts (20 min)

Goal: secure your brand and get the accounts you need for hosting and payments.

### Domain
- [ ] Buy `validx.com` from a registrar — Namecheap, Cloudflare, Porkbun, or Google Domains
- [ ] Also buy `.app`, `.co`, or `.io` variants if you want (optional)
- [ ] Write down your registrar login

### Hosting accounts (free tiers work to start)
- [ ] Sign up at **Netlify** (https://netlify.com) — for the marketing site + PWA
- [ ] Sign up at **Render** (https://render.com) — for the backend API
- [ ] Alternative: Railway, Fly.io, or Vercel also work — pick one

### Payment processors
- [ ] Sign up at **Stripe** (https://dashboard.stripe.com) — takes 10 min, needs your SSN or EIN for US
- [ ] Sign up at **PayPal Business** (https://developer.paypal.com)
- [ ] From Stripe dashboard, grab your **test mode** API keys (Publishable + Secret)
- [ ] From PayPal dev dashboard, create a **Sandbox** app and grab Client ID + Secret

### Google OAuth (optional but recommended)
- [ ] Go to https://console.cloud.google.com
- [ ] Create a new project named "ValidX"
- [ ] APIs & Services → OAuth consent screen → set it up as External
- [ ] Credentials → Create OAuth 2.0 Client ID → Web application
- [ ] Add authorized origins: `https://validx.com`, `http://localhost:8080`
- [ ] Copy the Client ID — you'll need it later

### Email delivery (for transactional email)
- [ ] Sign up at **Resend** (https://resend.com) — 3,000 free emails/month
- [ ] Verify your domain so emails don't land in spam
- [ ] Grab your API key

---

## Phase 3 — Deploy the backend (15 min)

Goal: your API reachable at `https://api.validx.com`.

- [ ] Push `validx-backend/` to a GitHub repo (make it private)
- [ ] On Render dashboard → New → Web Service → connect the repo
- [ ] Environment: Node
- [ ] Build command: `npm install`
- [ ] Start command: `npm start`
- [ ] Add environment variables from your local `.env`:
  - [ ] `JWT_SECRET` (new long random string, different from local)
  - [ ] `ADMIN_EMAIL`
  - [ ] `ADMIN_PASSWORD` (strong, different from local)
  - [ ] `CORS_ORIGINS` = `https://validx.com,https://www.validx.com`
  - [ ] `NODE_ENV` = `production`
  - [ ] `STRIPE_SECRET_KEY` (from Stripe)
  - [ ] `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` (from PayPal)
  - [ ] `GOOGLE_CLIENT_ID` (from Google Cloud)
- [ ] Deploy — watch the logs, confirm it says `ValidX API listening`
- [ ] In Render → Settings → Custom Domain → add `api.validx.com`
- [ ] Update your domain DNS: add a `CNAME` record `api` → Render's target
- [ ] Wait 5 minutes, then test `https://api.validx.com/api/health`
- [ ] Confirm the admin panel works at `https://api.validx.com/admin.html`

---

## Phase 4 — Deploy the frontend (10 min)

Goal: `validx.com` loads your marketing site and PWA over HTTPS.

- [ ] Go to https://app.netlify.com/drop
- [ ] Drag the entire `validx-site` folder into the browser
- [ ] Wait 30 seconds — you'll get a random URL like `brave-cat-1234.netlify.app`
- [ ] Test the URL — confirm the site and PWA both work
- [ ] Netlify → Site settings → Domain management → Add custom domain → `validx.com`
- [ ] Update your registrar DNS:
  - [ ] `A` record `@` → Netlify's IP (Netlify gives you the exact value)
  - [ ] `CNAME` record `www` → your Netlify subdomain
- [ ] Wait 10–30 min for DNS to propagate
- [ ] Visit `https://validx.com` — confirm the green padlock appears
- [ ] Confirm `https://validx.com/app.html` loads the PWA

### Update frontend to point at your live API
- [ ] In `validx-site/app.html`, update the API base URL to `https://api.validx.com/api`
- [ ] Redeploy (drag folder to Netlify again, or push to Git if you set up continuous deploy)

---

## Phase 5 — Wire up real payments (2–3 hours)

Goal: businesses can actually pay for experiments and testers can actually get paid.

### Stripe Checkout (business → ValidX)
- [ ] In `validx-backend/routes/experiments.js`, replace the mock payment with a real Stripe Checkout Session
- [ ] Add a webhook endpoint `/api/webhooks/stripe` that listens for `checkout.session.completed`
- [ ] In Stripe dashboard, add the webhook URL and copy the signing secret into `STRIPE_WEBHOOK_SECRET`
- [ ] Test with Stripe's test card: `4242 4242 4242 4242`, any future date, any CVC
- [ ] Confirm the experiment transitions from "draft" to "active" after payment

### PayPal Payouts (ValidX → testers)
- [ ] In `validx-backend/routes/admin.js`, when the admin marks a payout as "paid", call the PayPal Payouts API
- [ ] Test with a sandbox tester account
- [ ] Confirm the money actually arrives
- [ ] When you're ready for live, swap sandbox credentials for production ones in `.env`

### Testing with real money (small amounts)
- [ ] Create a real business account on your live site
- [ ] Run a real $29 Quick Test with your own credit card
- [ ] Have a friend (or yourself on another account) submit test data
- [ ] In the admin panel, approve the submission
- [ ] Process the payout to a real PayPal account
- [ ] Verify end-to-end flow works

---

## Phase 6 — Legal + compliance (before real users)

- [ ] Write a **Privacy Policy** — use https://www.termsfeed.com/privacy-policy-generator/ (free)
- [ ] Write **Terms of Service** — same generator has one
- [ ] Write a simple **Cookie Policy** if you add analytics
- [ ] Add links to all three in the site footer and in the app registration screen
- [ ] Add a **Contact** email — `hello@validx.com` (set up via your registrar or Google Workspace)
- [ ] If you have US testers: file **1099-NEC** forms for anyone who earns $600+ in a year (Stripe Connect handles this automatically if you migrate later)
- [ ] Check your state's requirements for **marketplace platforms** — some states require you to collect sales tax on the experiment fees
- [ ] Business formation: form an **LLC** or **C-Corp** before signing up testers for pay. Use Stripe Atlas ($500) or your state's DIY LLC filing (~$100)

---

## Phase 7 — Get your first users (the actually hard part)

### First 10 businesses
- [ ] Post in 3 startup communities: Indie Hackers, Y Combinator's Startup School forum, Reddit r/startups
- [ ] Offer your first 10 users a free Quick Test in exchange for a testimonial
- [ ] Reach out to 20 people in your network who are building something — DM them a link
- [ ] Join 2 local startup meetups and mention ValidX when people ask what you're building

### First 30 testers
- [ ] Post on 3 college subreddits in your area — r/UW, r/berkeley, r/UTAustin, etc. (read the rules first)
- [ ] Reach out to 5 university career centers — offer it as "paid market research for students"
- [ ] Post flyers on 2 nearby campuses with a QR code to `validx.com`
- [ ] Post in 2 college Facebook groups: "Free Stuff" and "Jobs for Students" groups

### Measure what's happening
- [ ] Add **Plausible Analytics** (https://plausible.io) to `index.html` — $9/mo, privacy-friendly
- [ ] Track: homepage visits → app launches → registrations → first experiment → payment
- [ ] Check the admin dashboard daily for pending submissions and payouts

---

## Phase 8 — Backups and monitoring (don't skip this)

- [ ] Set up **daily SQLite backups**: add a cron job that runs `sqlite3 validx.db .dump > backups/backup-$(date +%F).sql`
- [ ] Copy backups to S3, Backblaze B2, or Google Drive nightly
- [ ] Set up **UptimeRobot** (free) to ping `https://api.validx.com/api/health` every 5 min and email you on failure
- [ ] Set up **Sentry** (free tier) for error tracking in both the frontend and backend
- [ ] Monitor your Render logs daily for the first 2 weeks

---

## Quick "everything's broken" cheat sheet

| Symptom | Probable cause | Fix |
|---|---|---|
| Admin panel login fails with "Not an admin account" | Wrong role in DB | Check `.env` `ADMIN_EMAIL` matches what you're typing |
| CORS error in browser console | Frontend origin not allowed | Add URL to `CORS_ORIGINS` in backend `.env`, restart |
| Registration fails silently | Backend not running | `cd validx-backend && npm start` |
| PWA install banner doesn't appear | Not on HTTPS | PWAs only install over HTTPS (or localhost) |
| Icons don't show on install | Manifest path wrong | Verify `manifest.json` and `/icons/*` return 200 |
| Service worker won't update | Browser caching | In DevTools → Application → Service Workers → Unregister, then reload |
| Stripe test card rejected | Using live keys with test card | Ensure `STRIPE_SECRET_KEY` starts with `sk_test_` in dev |

---

## Current build status

- ✅ Marketing site (`validx-site/index.html`) — PWA-ready, SEO meta, deployed-config ready
- ✅ PWA app (`validx-site/app.html`) — mobile-native UX, registration + login, Google button, Stripe/PayPal UI
- ✅ Backend API (`validx-backend/`) — auth, experiments, submissions, payouts, admin endpoints
- ✅ Admin panel (`validx-backend/public/admin.html`) — dashboard, users, experiments, submissions, payouts moderation
- ✅ Pitch deck (`ValidX_Pitch_Deck.pptx`) — 10 slides, customer-facing
- ✅ Business plan (`ValidX_Business_Plan.docx`) — 14 sections, 3-year financials
- ⏳ Real Stripe integration (UI ready, server code stubbed)
- ⏳ Real PayPal Payouts integration (UI ready, server code stubbed)
- ⏳ Real Google OAuth verification (endpoint exists, needs `google-auth-library`)
- ⏳ Email delivery (Resend recommended, not yet wired)
- ⏳ Privacy Policy + Terms of Service
- ⏳ First users

---

*Work through this top-to-bottom. Don't skip Phase 1 — make sure it runs locally before you touch DNS or payments.*
