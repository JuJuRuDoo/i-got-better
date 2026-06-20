# CraftHost

A Minecraft server hosting panel — create and manage servers: start/stop, download real server JARs, install mods, view logs, run console commands, manage files, and configure settings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Railway Deployment (single service)

Railway runs everything from one service — Express serves both the API and the built frontend.

**Railway service settings:**
- **Build command:** `pnpm install && pnpm run build:railway`
- **Start command:** `node artifacts/api-server/dist/index.mjs`

**Required environment variables on Railway:**
- `DATABASE_URL` — PostgreSQL connection string (Railway provides this if you add a Postgres plugin)
- `PORT` — Railway injects this automatically
- `NODE_ENV=production`
- `DATA_DIR=/data` — directory for server JARs and mod files (attach a Railway volume at `/data` for persistence)

The frontend is pre-built into `artifacts/mchost/dist/public` and served statically by Express when `NODE_ENV=production`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (API) + Vite (frontend)

## Where things live

- `artifacts/mchost/` — React + Vite frontend
- `artifacts/api-server/` — Express 5 API server
- `artifacts/api-server/src/lib/serverProcess.ts` — simulated Minecraft server logic (start/stop/logs/commands)
- `artifacts/api-server/src/lib/virtualFiles.ts` — in-memory virtual file store
- `artifacts/api-server/src/lib/jarDownloader.ts` — downloads real server JARs from official APIs
- `artifacts/api-server/src/lib/modDownloader.ts` — downloads real mod JARs from Modrinth / CurseForge
- `lib/db/` — Drizzle schema + migrations
- `lib/api-spec/` — OpenAPI spec (source of truth for API contracts)

## Supported server types

| Type | JAR source |
|------|-----------|
| Vanilla | Mojang version manifest |
| Paper | PaperMC API (latest build) |
| Purpur | PurpurMC API |
| Fabric | FabricMC meta API (server launcher JAR) |
| NeoForge | Maven NeoForged repository (installer JAR) |
| Forge | Falls back to vanilla JAR |

Paper and Purpur do **not** show the loader-version picker — only Fabric, Forge, NeoForge, and Quilt do.

Paper and Purpur servers get a **Plugins tab** instead of Mods, searching Modrinth (`project_type:plugin`) and Hangar (`hangar.papermc.io`). Plugins download to `{serverDir}/plugins/` and are stored in `installed_mods` with `category="plugin"`.

## File storage

Server JARs and mod JARs are stored on disk under `DATA_DIR`:

```
{DATA_DIR}/servers/{serverId}/server.jar
{DATA_DIR}/servers/{serverId}/mods/{filename}.jar
```

Default `DATA_DIR` in dev: `./server-data` (relative to the API server's CWD).  
On Railway: set `DATA_DIR=/data` and mount a volume at `/data`.

Download status is tracked per-server (`jar_download_status`) and per-mod (`download_status`) in the DB:  
`pending` → `downloading` → `ready` | `error`

## Architecture decisions

- Server processes are simulated (no real Java). Replit and Railway don't expose TCP 25565 so real Minecraft clients can't connect; the panel manages files and config.
- On first start, the API downloads the real server JAR and streams progress into the server console log.
- Mod JARs are downloaded in the background after install; the DB record updates when complete.
- In-memory state for server process status and virtual files — resets on API restart.
- Frontend uses relative `/api/...` paths so it works behind any reverse proxy without config.
- In production, Express serves the Vite build output as static files (SPA fallback to index.html).
- Server type enums in the OpenAPI spec drive codegen — add new types there first, then run `codegen`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/db run push` after any schema changes before the API server will work.
- Virtual file changes (in `virtualFiles.ts`) are in-memory only — they reset on restart.
- The Vite config requires `PORT` and `BASE_PATH` at dev time but skips those checks during `vite build`.
- Adding a new server type requires: (1) add to all three `enum` entries in `openapi.yaml`, (2) run `codegen`, (3) add download logic in `jarDownloader.ts`, (4) add to `SERVER_TYPES` arrays in `CreateServer.tsx` and `ServerDetail.tsx`, (5) add badge color in `Dashboard.tsx` and `PublicServer.tsx`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
