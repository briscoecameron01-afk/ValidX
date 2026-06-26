# ValidX UI

Vite + React app for the ValidX marketing site and PWA.

## Structure

```txt
validx-site/VALIDX/
  index.html              Marketing homepage
  app.html                Vite entry for the PWA
  src/
    App.jsx               Current app shell and screens
    main.jsx              React mount, service worker, browser hooks
    styles/app.css        Extracted PWA styles
  public/
    manifest.json
    sw.js
    offline.html
    icons/
  supabase/               Schema lives at repo root: ../../supabase
  vercel.json
  vite.config.js
```

## Local Development

Create `validx-site/VALIDX/.env.local`:

```txt
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then run:

```sh
cd validx-site/VALIDX
npm install
npm run dev
```

Open:

- `http://localhost:5173/` for the marketing page
- `http://localhost:5173/app.html` for the app

## Supabase

Before using auth-backed app flows, run the SQL migration in:

```txt
../../supabase/migrations/20260625_validx_core.sql
```

That creates the core Postgres tables and RLS policies.

## Vercel

For Git deployments from the full repo, use these project settings:

```txt
Framework Preset: Vite
Root Directory: validx-site/VALIDX
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

For CLI deployments, either run `vercel` from the repository root while keeping the
Root Directory above, or run `vercel` from this `validx-site/VALIDX` directory after
clearing Root Directory in Vercel Project Settings.

Environment variables:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY` to the UI project. Keep that for Supabase Edge Functions or other server-only code.

## Useful Commands

```sh
npm run dev
npm run build
npm run preview
```


```sh
cd C:\Users\danie\CodeProjects\ValidX
```

```sh
$env:Path = "C:\Program Files\nodejs;$env:Path"
```

```sh
& "$env:APPDATA\npm\vercel.cmd" deploy --prod
```
