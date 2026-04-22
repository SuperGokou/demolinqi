# AOI · Vision — Company Site

Industrial-blueprint-aesthetic single-page site for an AI industrial vision inspection company, with an embedded chat assistant powered by DeepSeek.

## Run locally

1. Ensure Node 18+:
   ```bash
   node -v
   ```
2. Put your DeepSeek key in `.env`:
   ```
   DEEPSEEK_API_KEY=sk-xxxxxxxx
   DEEPSEEK_MODEL=deepseek-chat
   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
   PORT=3100
   ```
3. Install and start:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3100

Hot-reload during development:
```bash
npm run dev
```

## File layout

```
site/
├── index.html              # Markup only (nav, 4 sections, footer, chat FAB)
├── css/style.css           # Design system + all styles
├── js/
│   ├── script.js           # Nav, scroll, reveal
│   └── chat.js             # Chat UI + SSE client
├── server.js               # Express static + DeepSeek SSE proxy
├── package.json
├── .env                    # Never commit (in .gitignore)
└── .gitignore
```

## Architecture

```
Browser  →  POST /api/chat  →  server.js  →  api.deepseek.com/v1/chat/completions
                                   ↑
                              .env (server-side only — key never reaches the browser)
```

The DeepSeek API key lives only in `.env`, read by `server.js` at startup. The frontend calls `/api/chat` with `{ message, context }` and receives Server-Sent Events streaming tokens back.

## Endpoints

- `GET  /api/health` — `{ ok: true, model: 'deepseek-chat' }`
- `POST /api/chat` — body `{ message: string, context?: { current_path } }` → SSE stream of `data: { token }` lines, ending with `data: { done: true }`
- `GET  /*` — serves static files from `site/`

## Security

- Rate limited 20 req / 60s per IP (in-memory)
- Request body capped at 16KB, message at 2000 chars
- Upstream fetch timeout 30s
- Key absent from all client assets — verify with:
  ```bash
  grep -r "DEEPSEEK_API_KEY" . --exclude-dir=node_modules --exclude=.env
  ```
  should return no matches in HTML/CSS/JS.

## Deployment

### Vercel (recommended)

1. Import this repo on [vercel.com](https://vercel.com/new).
2. Leave framework preset as "Other" — Vercel will detect the static files and the `api/` directory automatically.
3. In **Project → Settings → Environment Variables**, add:
   - `DEEPSEEK_API_KEY` = your DeepSeek key (server-side only)
   - `DEEPSEEK_MODEL` = `deepseek-chat` *(optional, defaults to this)*
4. Click **Deploy**. Chat will work at `https://<your-project>.vercel.app/`.

> **Note.** GitHub repository "secrets" or "environment variables" are only for GitHub Actions workflows.
> They do **not** reach Vercel or any other host. Env vars must be set in the host's own dashboard.

### Netlify

Works similarly — `api/*.js` is auto-detected as Netlify Functions. Set `DEEPSEEK_API_KEY` in Site Settings → Environment variables.

### GitHub Pages (site) + Vercel (API) — hybrid

GitHub Pages only serves static files, so the chat API must live elsewhere. Set it up once:

1. **Deploy the API to Vercel**:
   - Import this repo on [vercel.com](https://vercel.com/new)
   - Settings → Environment Variables → add `DEEPSEEK_API_KEY`
   - Deploy. You'll get a URL like `https://aoi-xxx.vercel.app`
   - Verify: visit `https://aoi-xxx.vercel.app/api/health` → should say `"key_configured": true`
2. **Point the client at that API**: edit `js/config.js` in this repo:
   ```js
   window.AOI_CONFIG = {
     API_BASE: 'https://aoi-xxx.vercel.app',  // ← your Vercel URL
   };
   ```
3. **Commit & push** — GitHub Pages re-deploys automatically.
4. **Enable Pages** in repo Settings → Pages → Source: `main` branch, `/` root.

CORS is already enabled on the API so the cross-origin call works.

### Self-hosted Node (Render / Railway / Fly.io / VPS)

`server.js` runs the same proxy as a long-lived Express process. Set `DEEPSEEK_API_KEY` in the host's env panel, deploy, expose port 3100.
