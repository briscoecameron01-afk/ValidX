# ValidX Backend + Admin Panel

Node.js + Express API that powers the ValidX PWA and the admin panel. Uses SQLite for storage — zero external DB setup.

## What's in here

```
validx-backend/
├── server.js              Express app entry point
├── seed.js                Seeds demo businesses, testers, experiments
├── package.json
├── .env.example           Copy to .env and fill in secrets
├── lib/
│   ├── db.js              SQLite connection + schema
│   └── auth.js            bcrypt + JWT helpers
├── middleware/
│   └── authRequired.js    JWT verification + role guards
├── routes/
│   ├── auth.js            POST /register /login /google, GET /me
│   ├── experiments.js     CRUD + submissions
│   ├── payouts.js         Earnings summary, cashout requests
│   └── admin.js           Admin-only moderation endpoints
└── public/
    └── admin.html         Single-file React admin panel
```

## Quickstart

```sh
cd validx-backend
cp .env.example .env        # edit ADMIN_EMAIL / ADMIN_PASSWORD / JWT_SECRET
npm install
npm run seed                 # optional — creates demo data
npm start
```

You'll see:

```
✔ Admin account created: admin@validx.com
✔ ValidX API listening on http://localhost:4000
✔ Admin login at /admin.html with admin@validx.com
```

Now visit:
- **API health check**: http://localhost:4000/api/health
- **Admin panel**: http://localhost:4000/admin.html

Default admin credentials come from `.env` — change `ADMIN_EMAIL` and `ADMIN_PASSWORD` before deploying anywhere.

## Seeded demo accounts

After `npm run seed`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@validx.com` | (from `.env`) |
| Business | `jordan@acmelabs.com` | `password123` |
| Business | `sam@fitmeal.co` | `password123` |
| Tester | `alex@university.edu` | `password123` |
| Tester | `maya@campus.edu` | `password123` |
| Tester | `riley@tech.edu` | `password123` |

## API endpoints

### Public
- `POST /api/auth/register` — create a business or tester account
- `POST /api/auth/login` — returns `{ token, user }`
- `POST /api/auth/google` — accept Google OAuth payload from frontend
- `GET /api/health`

### Authenticated (requires `Authorization: Bearer <token>`)
- `GET /api/auth/me`
- `GET /api/experiments` — lists owned (business) or active (tester)
- `GET /api/experiments/:id` — with submissions
- `POST /api/experiments` — business only
- `PATCH /api/experiments/:id` — update status
- `POST /api/experiments/:id/submissions` — tester submits data
- `GET /api/payouts/earnings` — tester earnings summary
- `POST /api/payouts/cashout` — request cashout

### Admin only
- `GET /api/admin/stats` — dashboard metrics
- `GET /api/admin/users?role=&q=`
- `PATCH /api/admin/users/:id` — activate / suspend / ban
- `GET /api/admin/experiments`
- `PATCH /api/admin/experiments/:id`
- `GET /api/admin/submissions?status=`
- `PATCH /api/admin/submissions/:id` — approve / reject
- `GET /api/admin/payouts`
- `PATCH /api/admin/payouts/:id` — pending / processing / paid / failed

## Wiring the PWA to the backend

The PWA at `validx-site/app.html` currently uses `localStorage` for quick demos. To switch it to a real backend, add at the top of the app script:

```js
const API_BASE = 'https://api.validx.com/api';
async function api(path, opts = {}) {
  const token = localStorage.getItem('vx_token');
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.json();
}
```

Then:
- Register → `api('/auth/register', { method: 'POST', body: JSON.stringify(profile) })` → save `token` to localStorage
- Login → `api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })`
- Load experiments → `api('/experiments')` instead of `LS.get('vx_experiments')`
- Create experiment → `api('/experiments', { method: 'POST', body: JSON.stringify(exp) })`

Make sure `CORS_ORIGINS` in `.env` includes your frontend URL.

## Deployment

### Render (easiest)
1. Push this folder to a Git repo
2. New → Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env vars: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`

SQLite file persists on Render's disk for Starter plans and up.

### Railway / Fly.io
Same idea — both detect `package.json` automatically. On Fly.io, mount a volume for the SQLite file:

```sh
fly volumes create data --size 1
```

Then in `fly.toml`:
```toml
[mounts]
source = "data"
destination = "/app"
```

And set `DB_PATH=/app/validx.db` in your env.

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4000
CMD ["node", "server.js"]
```

## Going to production

Before launching, you should:

1. **Change JWT_SECRET** to a long random string (at least 32 chars)
2. **Change ADMIN_EMAIL / ADMIN_PASSWORD** in `.env`
3. **Wire up real Stripe** — add the webhook handler in `routes/experiments.js` to verify `checkout.session.completed` events before marking experiments as paid
4. **Wire up real PayPal Payouts** — in `routes/payouts.js`, fire the PayPal Payouts API when an admin marks a payout as "paid"
5. **Verify Google ID tokens** — install `google-auth-library` and verify tokens in `routes/auth.js` instead of trusting the frontend
6. **Move to Postgres** at ~1000 users — swap `better-sqlite3` for `pg`
7. **Add email** — Resend or Postmark for password resets, experiment notifications
8. **Set up backups** — cron `sqlite3 validx.db .dump > backup-$(date +%F).sql` daily
9. **Add HTTPS** — your host handles this (Render, Railway, Fly all do it automatically)
10. **Add a privacy policy + terms of service** before accepting payments

## License
© 2026 ValidX. All rights reserved.
