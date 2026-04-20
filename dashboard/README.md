# Recast Dashboard (Phase 1)

React + TypeScript + Vite + Tailwind + shadcn/ui + Supabase. Lives alongside the
existing Python scout server and Vercel Python API in the parent repo.

## First-time setup

```bash
cd dashboard
cp .env.example .env.local   # then paste the Supabase anon key
npm install
```

## Supabase

1. Open the existing project (`itcpjwzqwkvsrenjpppi`) in Supabase Studio.
2. Run each file under `supabase/migrations/` in order (`0001` → `0007`) in the
   SQL editor. They create: `profiles`, `brands`, `campaigns`, `creators`,
   `campaign_creators`, `payments`, `activity_log`, `briefs`, the
   `campaign_creators_public` view, RLS policies, and the activity-log +
   brief-promotion triggers.
3. Create the five auth users (Bruno, Harry, Max, Frazier, Gustavo) in
   **Authentication → Users → Invite user**. Profiles are auto-created.
4. Assign roles. In the SQL editor:

   ```sql
   update profiles set role = 'admin'   where email = 'bruno@…';
   update profiles set role = 'admin'   where email = 'harry@…';
   update profiles set role = 'admin'   where email = 'max@…';
   update profiles set role = 'partner' where email = 'frazier@…';
   update profiles set role = 'finance' where email = 'gustavo@…';
   ```

5. (Optional) Regenerate strict types:
   `supabase gen types typescript --project-id itcpjwzqwkvsrenjpppi > src/types/database.ts`,
   then re-add `<Database>` to `createClient` in `src/lib/supabase.ts`.

## Dev

```bash
npm run dev              # Vite on :5173
npm test                 # earnings engine Vitest suite
npm run build            # production build into dist/
```

The Scout page expects the local Python scout server: in the parent repo,
`python scout_server.py` on port 7433.

## Role map (enforced by RLS + Sidebar)

| Role    | Campaigns | Finance | Roster | Scout | Briefs | Activity |
| ------- | --------- | ------- | ------ | ----- | ------ | -------- |
| admin   | ✔︎         | ✔︎       | ✔︎      | ✔︎     | ✔︎      | ✔︎        |
| partner | ✔︎*        |         | ✔︎      | ✔︎     | ✔︎      |          |
| finance | ✔︎         | ✔︎       |        |       |        | ✔︎        |

*Partner sees campaigns without financial columns — the app queries
`campaign_creators_public` when role is `partner`.

## Deploy

Link this `/dashboard` folder as its own Vercel project:

```bash
cd dashboard
vercel link
vercel env add VITE_SUPABASE_URL         production
vercel env add VITE_SUPABASE_ANON_KEY    production
vercel env add VITE_SCOUT_SERVER_URL     production
vercel --prod
```
