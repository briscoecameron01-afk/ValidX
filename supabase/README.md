# ValidX Supabase Setup

Run `migrations/20260625_validx_core.sql` in your Supabase project before deploying the Supabase-backed UI.

The migration creates:

- `profiles`
- `experiments`
- `experiment_claims`
- `submissions`
- `payouts`
- `audit_log`

It also enables Row Level Security and policies for business, tester, and admin access.

## Apply In The Dashboard

1. Open Supabase.
2. Go to SQL Editor.
3. Paste `supabase/migrations/20260625_validx_core.sql`.
4. Run it.

## Apply With The Supabase CLI

```sh
supabase link --project-ref your-project-ref
supabase db push
```

## Admin Users

Normal users can only create `business` or `tester` profiles. To create an admin, update the profile with the service role key or in the SQL editor:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

Admin UI migration is separate from the PWA migration. The PWA no longer needs the Express + SQLite backend for auth, experiments, tester submissions, or cashout requests after this schema is installed.
