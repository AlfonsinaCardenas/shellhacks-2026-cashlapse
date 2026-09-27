# Cashlapse

Upload your bank statements and get a P&L that shows what your past spending is worth in today's dollars.

**Live app:** https://cashlapse.vercel.app

## Features

- **PDF upload:** drag and drop one or more checking, savings, or credit card statements. Password-protected PDFs are supported.
- **Privacy first:** names, addresses, emails, phone numbers, SSNs, and account numbers are redacted before anything reaches the AI. Every statement has a "What we sent to AI" view.
- **AI parsing:** Gemini extracts transactions as structured JSON. A balance check (`start + income − expenses = end`) flags statements that need a second look.
- **Inflation-adjusted P&L:** revenue, expenses by category, and net income, with nominal vs. real spending based on official CPI data.

## Tech stack

| Layer | Tools |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui (Base UI), Recharts, lucide |
| Auth | NextAuth.js v4, Google OAuth, database sessions |
| Database | Tiger Data (PostgreSQL + TimescaleDB): hypertable + continuous aggregate |
| AI | Gemini API (`@google/genai`) |
| PDF | pdf.js (`pdfjs-dist`) |
| Storage | Cloudflare R2 (private bucket) |
| Economic data | FRED (CPI-U, `CPIAUCNS`), BEA (PCE prices) |
| Hosting | Vercel (with a daily Vercel Cron CPI sync) |

## Getting started

**Requirements:** Node.js 24, `psql`, and a Tiger Data service.

```bash
git clone https://github.com/AlfonsinaCardenas/shellhacks-2026-cashlapse.git
cd shellhacks-2026-cashlapse
npm install
cp .env.example .env         # fill in the values below
npm run db:setup             # creates auth + app tables (run once)
npm run dev                  # http://localhost:3000
```

For a database created before statement balances were added, also run `db/migrations/001_statement_balances.sql`.

### Environment variables

| Variable | Where to get it |
|---|---|
| `TIGER_DATABASE_URL` | Tiger Data console |
| `NEXTAUTH_URL` | `http://localhost:3000` locally |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth client. Redirect URI: `http://localhost:3000/api/auth/callback/google` |
| `GEMINI_API_KEY` | Google AI Studio |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Defaults: `gemini-3.8-flash`, `gemini-3.5-flash-lite` |
| `FRED_API_KEY` | fred.stlouisfed.org |
| `BEA_API_KEY` | apps.bea.gov |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare → R2. Leave empty in development to store PDFs in `.uploads/` |
| `CRON_SECRET` | Any random string; protects `/api/cron/sync-cpi` |

Never commit `.env` or `.env.local`.

### Load CPI data

The CPI sync runs daily on Vercel. To run it manually:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-cpi
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npm run test:inflation` | CPI and inflation tests |
| `npm run test:reports` | P&L and dashboard series tests |
| `npm run db:setup` | Create database tables |

## Project structure

```
app/
  page.tsx            landing + sign in
  (app)/              signed-in pages: dashboard, upload, statements, review, reports
  api/                auth, statements (upload/confirm), reports, inflation, cron/sync-cpi
components/           UI (shadcn in components/ui)
lib/                  database, auth, PDF parsing + redaction, queries, FRED/BEA clients, inflation math
db/                   authjs.sql, schema.sql, migrations/
scripts/              CPI/PCE sync and live checks
docs/                 design notes
```

## Team

- Alfonsina Cardenas
- Gabriel Izaguirre
- Nicholas Ali
- Zoili Paladino
