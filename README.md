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

## Deployment notes

- Static files can be served from any static host (Nginx, Vercel, Netlify, GitHub Pages)
- `server.js` can be deployed as:
  - A long-running Node process behind a reverse proxy
  - Ported to Vercel / Cloudflare Workers as a serverless function (adapt SSE response)
  - Ported to a Supabase Edge Function (compatible Deno runtime)
- Always set `DEEPSEEK_API_KEY` in the production environment's secret store, never in source.
