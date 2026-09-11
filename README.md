# CalendarTodo — Weekly Planner (Cloudflare PWA, Online-First)

Google Calendar–like weekly view + color-coded todos (Red Super Urgent, Yellow Kinda, Green Chill). PWA on mobile/desktop, **online-first** sync via Cloudflare Pages + D1. Single-user, no auth (global table — add auth later).

## Quick Start

```bash
npm ci
npm test          # 87 tests
npm run build     # → dist/ + sw.js + manifest
npm run dev       # vite on 5173 (proxies /api → wrangler on 8788)
# in another terminal:
npm run dev:pages # wrangler pages dev dist --local --d1 DB=calendar-todo-db --port 8788
# then open http://127.0.0.1:5173
```

Test online-first sync:

```bash
curl -s http://127.0.0.1:8788/api/health
curl -s http://127.0.0.1:8788/api/todos
curl -s -X POST http://127.0.0.1:8788/api/todos -H 'Content-Type: application/json' -d '{"id":"test1","title":"Hello","date":"2026-09-10","time":"10:00","duration":60,"priority":"super","desc":""}' | jq .
```

## Architecture

- **PWA Shell:** `vite-plugin-pwa` + Workbox (`dist/sw.js`, `dist/manifest.webmanifest`), `public/_headers`, `public/_redirects`, `public/icons/*`, `src/pwa.js` (prompt + install)
- **Data:** `src/data/idb.js` (IndexedDB cache), `src/data/api.js` (fetch `/api/*`), `src/data/repo.js` (online-first: `repoList` tries network → cache fallback, writes network-first with `outbox` queue), `src/data/migrate.js` (localStorage → idb)
- **Backend:** `functions/api/*` (Pages Functions) + `migrations/0001_create_todos.sql` + D1 `calendar-todo-db` (global table, soft delete via `deletedAt`, LWW by `updatedAt`), `functions/_utils.js` ensures schema
- **UI:** `src/app.js` async `init()` online-first (fetch remote → LWW merge with local → render), `src/utils.js` pure helpers, `src/store.js` pure CRUD, offline banner + periodic sync every 30s + visibilitychange

## Deploy to Cloudflare (Free)

1. Create D1: `npm run d1:create` → copy `database_id` into `wrangler.toml`
2. Migrate local: `npm run d1:migrate:local`
3. Build: `npm run build`
4. Deploy: `npx wrangler pages deploy dist --project-name calendar-todo` (first time creates Pages project)
5. Migrate remote: `npm run d1:migrate:remote`
6. Set custom domain in Cloudflare dashboard → `calendar-todo.pages.dev` → auto HTTPS (PWA requires HTTPS)

Free tier: Pages unlimited bandwidth, Workers 100k req/day, D1 5GB — personal use far below limits.

### CI

`.github/workflows/deploy.yml` — on push to `main`: `npm test` → `npm run build` → deploy via `cloudflare/pages-action`. Add secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

## Single-User Note

No auth: all devices share one global `todos` table. `deviceId` is stored for debugging only. To share phone + desktop, both hit same `https://…pages.dev` — same DB. To add multi-user later, add `user_id` column + auth + RLS, no UI rewrite needed.

## Scripts

- `dev` — vite
- `dev:pages` — wrangler pages dev with D1
- `build` — vite build + PWA
- `test` — vitest
- `deploy` — build + pages deploy
- `d1:migrate:*` — apply SQL

## Verification Checklist (tested per component)

- [x] T1 prep split — utils/store tests pass
- [x] T2 idb cache — `src/data/idb.test.js` + `migrate.test.js`
- [x] T3 PWA — `dist/sw.js` + `manifest.webmanifest` + icons, `_headers` `sw.js no-cache`, Lighthouse PWA
- [x] T4 Worker D1 — `GET/POST/PATCH/DELETE /api/todos` via curl, soft delete, LWW
- [x] T5 online-first sync — vite proxy → wrangler, `init()` merge, offline banner, `flushOutbox` + 30s poll
- [x] T6 deploy config — `wrangler.toml`, `_headers/_redirects`, GH Actions
- [x] T7 hardening — Export JSON, offline banner, LWW (tests below)

> Last synced: 2026-09-11 — mobile 3-day view + drag & drop • Cloudflare Pages auto-deploy from `main`

