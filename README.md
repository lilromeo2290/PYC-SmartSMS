# PYC SmartSMS — SMS Management & Automation

Complete SMS management and automation platform built for **Progressive Youth Club, Ho** (Ghana).
One central automation engine drives every automated message — birthdays, meeting reminders,
event reminders, dues collection and custom schedules — all on **Africa/Accra** time.

## Features

- **Members** — register, groups, categories, import (CSV), SMS permission flag per member
- **SMS** — single send, group send, scheduled sends, history, delivery reports
- **Automation engine** — one central scheduler (30s tick) powering birthday wishes,
  meeting/event reminders, dues reminders and custom automations, with duplicate protection
- **Message templates & variables** — `{{first_name}}`-style placeholders resolved per recipient
- **BMS Africa gateway** (mNotify API) — approved sender ID, live wallet balance + credit
  expiry shown on the dashboard, server-side API key (AES-256-GCM encrypted, never exposed
  to the frontend)
- **RBAC** — SUPER_ADMIN / SMS_MANAGER / EVENT_COORDINATOR / VIEWER with fine-grained permissions
- **Audit log** — every action trail-checked

## Tech Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma ORM · SQLite

## Quick Start

```bash
# 1. Install dependencies
npm install            # or: bun install

# 2. Environment
cp .env.example .env   # defaults are fine for local development

# 3. Create the database schema
npx prisma db push     # or: npm run db:push

# 4. (Optional) seed demo data + user accounts
npm run seed

# 5. Run
npm run dev            # http://localhost:3000
```

## Default Accounts (created by the seed)

| Username    | Role              | Default password |
|-------------|-------------------|------------------|
| admin       | SUPER_ADMIN       | Admin@2026       |
| smsmanager  | SMS_MANAGER       | Sms@2026         |
| coordinator | EVENT_COORDINATOR | Coord@2026       |
| viewer      | VIEWER            | View@2026        |

> ⚠️ **Change these passwords immediately before production use** (Users module in the app).
> The seed also creates demo members/events/automations — run
> `node scripts/wipe_for_handover.mjs` to reset to a clean, empty system.

## SMS Gateway Setup (BMS Africa)

1. Get an API key from [app.bms.africa](https://app.bms.africa) (mNotify).
2. Register a sender ID (max 11 chars, e.g. `PYC CLUB-HO`) and wait for approval.
3. In the app: **Settings → SMS Provider → BMS Africa**, paste the API key and sender ID.
   Optionally set the **credit expiry date** (shown on the dashboard hero).
   Or run `scripts/configure_bms.sh` with environment variables:

```bash
export BMS_API_KEY="your-mnotify-key"
export PYC_ADMIN_PASS="your-admin-password"
export PYC_SENDER_ID="PYC CLUB-HO"     # optional, this is the default
bash scripts/configure_bms.sh
```

The API key is stored AES-256-GCM encrypted and only ever used server-side; the dashboard
shows the live balance via an authenticated proxy endpoint with a 60s cache.

## Operations Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `bms_trial.sh` | Fire test SMS through the app pipeline — `./bms_trial.sh 024XXXXXXX …` (env: `BMS_API_KEY`, `PYC_ADMIN_PASS`) |
| `configure_bms.sh` | Configure the BMS provider via the settings API (env: `BMS_API_KEY`, `PYC_ADMIN_PASS`) |
| `wipe_for_handover.mjs` | Back up `db/custom.db`, then wipe all operational data to a clean handover state |
| `seed.ts` | Seed user accounts + demo data (`npm run seed`) |

## Security Notes

- Sender identity is enforced in the send pipeline: the approved sender ID is used for every
  message and any app/test prefix is stripped from message text.
- Never commit `.env`, `db/`, or real credentials. Ops scripts read secrets from environment
  variables only.
- If any secret is ever exposed, rotate it at the provider and update Settings.

## Timezone

All automation scheduling, birthdays and dashboards run on **Africa/Accra** time.
