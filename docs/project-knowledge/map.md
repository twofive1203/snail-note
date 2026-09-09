# Project map

Snail Note is a self-hosted, Markdown-first web notes MVP. It reads and writes real `.md` files on the server. Purpose, stack, run commands, API list, and MVP bounds live in `README.md` — do not duplicate them here.

## Entry points

| Path | Role |
| --- | --- |
| `package.json` | Workspace scripts: `dev`, `build`, `start`, `typecheck`, `test` |
| `pnpm-workspace.yaml` | Workspace: `apps/*`, `packages/*` |
| `apps/server/src/main.ts` | Fastify process entry; loads root `.env` and serves `apps/web/dist` in production |
| `apps/server/src/app.ts` | HTTP app construction |
| `apps/web/src/main.tsx` | Vite / React UI entry |
| `apps/web/src/app/App.tsx` | Root UI |
| `packages/shared/src/index.ts` | Shared contracts (`@snail-note/shared`) |
| `apps/web/src/features/editor/MarkdownEditor.tsx` | CodeMirror 6 editor; live preview, paste, note image context |
| `apps/web/src/features/editor/paste-markdown.ts` | Clipboard HTML / image-file paste |
| `apps/web/src/features/editor/html-to-markdown.ts` | Turndown HTML → Markdown |
| `apps/web/src/features/editor/localize-images.ts` | Remote/clipboard images → `{note}.assets/` |
| `apps/web/src/features/editor/image-url.ts` | Markdown image URL normalize / display rewrite |
| `apps/web/src/features/editor/live-preview.ts` | Live-preview decorations (fences, mermaid, http(s) images) |
| `apps/server/src/notebook/notebook-routes.ts` | File API plus `GET/POST /api/notebooks/:id/asset` |
| `apps/server/src/notebook/asset-fetch.ts` | Remote image download, SSRF checks, magic-byte sniff |
| `docker-compose.yml`, `Dockerfile` | Container run |

## Required reading

| Doc | When |
| --- | --- |
| `README.md` | Product scope, local/Docker run, API overview, MVP boundary |
| `docs/usage/import-existing-folder.md` | Adding existing Markdown folders; Docker mount limits |
| `.env.example` | `PORT`, `HOST`, `SNAIL_NOTE_DATA_DIR`, `CORS_ORIGIN`, `NOTEBOOK_HOST_PATH` |
| `AGENTS.md` | Project Knowledge navigation only |

## Non-goals and conventions (already in-repo)

- No login in this MVP; APIs are for trusted local/LAN use only.
- Saves, renames, moves, and deletes mutate the real notebook directory. Back up first.
- The filesystem is the source of truth. Notes stay `.md`; pasted images become real files under `{note}.assets/`, not base64 in the document.
- Production on port 61666 serves `apps/web/dist`. After editor/API changes: `pnpm build`, restart `pnpm start`, then hard-refresh the browser.
- Notebook list is persisted under `.snail-note/` (override with `SNAIL_NOTE_DATA_DIR`). `NOTEBOOK_ROOT` is legacy bootstrap only when that file does not exist yet.
- Docker can browse only mounted paths (`NOTEBOOK_HOST_PATH` → `/notes`).
- This capture is WebUI project knowledge. Do not write `.pi/snflows/spec/`, run `/snflow-spec-review`, or write `.trellis/`.
