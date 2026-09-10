# Verity

An SEO + GEO (Generative Engine Optimization) toolkit: audit content, research
keywords, compare competitors, and score/rewrite content for AI answer
engines. Built with Next.js; the AI-backed modules call Claude through a
small server-side API route so your API key never reaches the browser.

**What's real vs. sample data:**
- Real, calling Claude on every run: Site audit, Keywords (angles/intent),
  Competitors, AI citations (Audit + Optimize).
- Sample/demo data (clearly labeled in the UI): rank-position trends,
  the AI-citation Track tab, and the entire Backlinks module. These need a
  real search index, an engine-polling backend, or a third-party backlink
  API (e.g. Ahrefs/Moz-style) to become real - that infrastructure is
  outside the scope of this repo.

## 1. Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local and paste a free key from https://cloud.cerebras.ai
npm run dev
```

Open http://localhost:3000.

### Model provider

`AI_PROVIDER` in `.env.local` picks which backend serves every request:

- `cerebras` (default) - free, generous daily limits, and their terms
  actually permit production/public use, unlike most free LLM tiers.
  Uses `gpt-oss-120b` by default; override with `CEREBRAS_MODEL`.
- `anthropic` - Claude, if you'd rather pay for stronger and more
  consistent JSON output across all 15+ tools. Requires `ANTHROPIC_API_KEY`.

Both go through the same `/api/claude` route and the same JSON-parsing
frontend code - switching providers is a one-line env var change, nothing
in `app/page.js` needs to change either way.

**Cerebras free-tier limits** (separate from this app's own rate limiter
below): roughly 30 requests/minute and 14,400 requests/day, shared across
all your app's modules. Fine for a small/early audience; if you outgrow
it, either upgrade your Cerebras plan or switch `AI_PROVIDER=anthropic`.

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

`.env` / `.env.local` are already in `.gitignore` - your API key will not be
committed. Double-check `git status` before your first push if you're unsure.

## 3. Deploy so the public can use it

Any Node host that supports Next.js works. Two straightforward options:

**Vercel** (easiest, generous free tier)
1. Import the GitHub repo at https://vercel.com/new
2. Add an environment variable: `ANTHROPIC_API_KEY` = your key
3. Optionally add `RATE_LIMIT_PER_HOUR` (default 20)
4. Deploy

Note: Vercel runs this as serverless functions, and the built-in rate
limiter (see below) keeps its counts in memory per instance. Under real
public traffic across multiple instances, the effective limit can end up
higher than what you set. Fine for a low-traffic launch; see "Hardening
for real public traffic" if you expect meaningful volume.

**Render / Railway / Fly.io** (single long-running process)
1. Create a new Web Service from the GitHub repo
2. Build command: `npm run build` - Start command: `npm run start`
3. Add the same environment variables as above

These run as one persistent process, so the in-memory rate limiter behaves
exactly as configured.

## 4. Protecting your API key on a public deployment

Every request to `/api/claude` uses up your quota with whichever provider
is active (Cerebras's free daily limit, or Anthropic usage if you switch to
Claude). This repo includes basic protection out of the box:

- The API key lives only in a server-side environment variable - it's never
  sent to or readable from the browser.
- A per-IP rate limiter (`lib/rateLimit.js`) caps requests per hour
  (`RATE_LIMIT_PER_HOUR`, default 20).
- Input length is capped server-side (20,000 characters) and output is
  capped at 2,000 tokens per request, regardless of what the client asks for.

### Hardening for real public traffic

If you expect meaningful traffic, consider:
- Swapping `lib/rateLimit.js` for a shared store like Upstash Redis
  (`@upstash/ratelimit`) so limits hold across serverless instances.
- Adding a lightweight CAPTCHA (e.g. Cloudflare Turnstile) before expensive
  actions like Competitors or Keywords.
- Adding a spend cap / usage alert in the Anthropic Console so a traffic
  spike can't run up an unbounded bill.
- Gating certain modules behind sign-in if you want to move from "public
  demo" to a real multi-user product with per-user quotas.

## 5. Customizing

- Brand name and copy: `app/page.js`, the `MODULES` array and the sidebar
  `brand` markup near the bottom of the file.
- Colors/fonts: the `<style>` block inside `app/page.js` (CSS custom
  properties at the top of `.verity-app`).
- Rate limit: `RATE_LIMIT_PER_HOUR` env var.
- Model or token limits: `app/api/claude/route.js`.

## Project structure

```
app/
  api/claude/route.js   server route that calls the Anthropic API
  layout.js             root layout
  page.js                the whole app UI (single client component)
  globals.css
lib/
  rateLimit.js           per-IP in-memory rate limiter
.env.example
```
