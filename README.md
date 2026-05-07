# Portfolio Tracker

Personal portfolio tracker with Singapore-resident tax awareness, look-through analytics, planner, rebalancer, dividends, factor exposure, Monte Carlo goals, stress-test scenarios, and a deterministic plain-English portfolio summary.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL/key and (optional) Anthropic API key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

`.env.local` lives in the project root (next to `package.json`). It is loaded automatically by Next.js when the dev server starts. **Restart the dev server after editing it.**

| Variable | Required | What for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Your Supabase project URL — Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | The Supabase `anon` public key — Settings → API |
| `SENTRY_DSN` | optional | If set, client errors POSTed to `/api/log` are forwarded to Sentry. |

The dashboard "Portfolio summary" widget is fully deterministic — no API key required, no per-render cost. If you want LLM-powered narratives or chat in future, free options include [Groq](https://console.groq.com) (Llama 3.x, ~14k req/day free), [Google Gemini](https://aistudio.google.com) (Gemini Flash, 15 req/min, 1M tokens/day free), or running [Ollama](https://ollama.com) locally. The previous `/api/summary` and `/api/chat` Anthropic routes have been removed; you can re-add them on top of any provider that exposes a chat-completion endpoint.

### Database

Run `supabase-schema.sql` in your Supabase SQL editor once (Settings → SQL Editor → New query → paste → Run). The script is idempotent — safe to re-run when new tables/columns are added.

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run lint         # ESLint
npm test             # Vitest run-once
npm run test:watch   # Vitest in watch mode
```

## Tech stack

- Next.js 13 (app router) · TypeScript · Tailwind · shadcn/ui
- Supabase (auth + Postgres)
- Recharts for charts
- Yahoo Finance (prices, dividends, fundamentals) and frankfurter.app (FX)
