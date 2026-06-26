# Deploy the ValidX Vite UI on Vercel

Use `validx-site/VALIDX` as the Vercel project root for Git deployments.

If Vercel says `The specified Root Directory "validx-site/VALIDX" does not exist`,
check whether you are deploying with Git or the CLI. The same nested path should not
be applied twice.

## Project Settings

```txt
Framework Preset: Vite
Root Directory: validx-site/VALIDX
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

## Environment Variables

Add these to Vercel for Production and Preview:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY` to this UI project. The Vite variables are public browser configuration, so only use the Supabase URL and anon key.

## Supabase Setup

Run the migration before testing real auth/data flows:

```txt
supabase/migrations/20260625_validx_core.sql
```

In Supabase Auth settings, add the deployed Vercel URL:

```txt
Site URL: https://your-vercel-domain.vercel.app
Redirect URL: https://your-vercel-domain.vercel.app/app.html
```

## CLI Deployment

PowerShell users can use the `.cmd` commands if PowerShell blocks npm/vercel shims:

### Option A: Keep Root Directory set in Vercel

Run Vercel from the repository root so the configured Root Directory exists in the
uploaded project:

```powershell
cd C:\Users\danie\CodeProjects\ValidX
vercel.cmd link
vercel.cmd deploy
vercel.cmd deploy --prod
```

### Option B: Deploy from the app directory

If you deploy from inside the Vite app, clear the Vercel Project Settings value for
Root Directory first, or set it to `.`.

```powershell
cd C:\Users\danie\CodeProjects\ValidX\validx-site\VALIDX
npm.cmd install
vercel.cmd link
vercel.cmd env add VITE_SUPABASE_URL production
vercel.cmd env add VITE_SUPABASE_URL preview
vercel.cmd env add VITE_SUPABASE_ANON_KEY production
vercel.cmd env add VITE_SUPABASE_ANON_KEY preview
vercel.cmd deploy
vercel.cmd deploy --prod
```

## Git Deployment

When importing the repo in Vercel:

1. Pick the Git repository.
2. Set Root Directory to `validx-site/VALIDX`.
3. Use the Vite framework preset.
4. Add the two `VITE_SUPABASE_*` env vars.
5. Deploy.

Vercel will build with `npm run build` and publish `dist`.
