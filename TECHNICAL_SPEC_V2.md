# SignalFlow — Technical Specification (v2, Internal Tool)

**Version:** 2.0
**Status:** Revised for internal MVP
**Date:** 2026-06-11
**Supersedes:** [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) (v1, public-SaaS framing)

> Internal revenue intelligence platform for *our* SDR team. Single organization. Apollo is the primary enrichment source; Google Sheets is a first-class ingestion path. CRM and Re-Engagement ship before Funding/Hiring signals.

---

## 0. What Changed From v1 (summary)

| Area | v1 (public SaaS) | v2 (internal tool) |
|---|---|---|
| Tenancy | Org-scoped, Clerk Orgs, RLS, Prisma tenant extension | **Single org. No `orgId`. No RLS.** Clerk for user login only |
| Enrichment | Pluggable abstract source adapters | **Apollo is the concrete primary source** (+ Sheets ingestion) |
| Ingestion | CSV upload | **Google Sheets daily sync** (first-class) + CSV |
| Async infra | BullMQ + Redis + separate worker tier | **Deferred.** Vercel Cron + resumable batch sync in v1 |
| Repo | pnpm + Turborepo monorepo (web + worker) | **Single Next.js app** |
| First feature set | Monitoring → Intent Feed → AI | **CRM + Re-Engagement first**, signals/AI last |
| AI | Dual-model (GPT-5 + Claude) from the start | **Claude primary**, OpenAI optional, introduced in Phase 3 |
| Snapshot/Signal engine | Core, built early | **Postponed to Phase 3** |

The driving principle: **build the smallest thing that makes our SDRs faster this quarter**, and only add infrastructure when a real bottleneck demands it.

---

## 1. Architecture Review — Simplify / Postpone / Over-Engineered

### 1.1 What can be SIMPLIFIED

1. **No multi-tenancy.** Remove `Org`, every `orgId` column, the Clerk Organizations integration, org webhooks, the tenant-injecting Prisma extension, and Supabase RLS. Clerk is reduced to "is this person a logged-in member of our team?" One global dataset. This removes a column from every table, a filter from every query, and an entire class of bugs.

2. **Collapse the source-adapter framework into two concrete clients.** v1 designed a generic `SourceAdapter` plugin system for many future vendors. v2 has exactly two ingestion/enrichment sources we actually own: **Apollo** and **Google Sheets**. Write two focused clients (`lib/apollo.ts`, `lib/sheets.ts`). Keep a thin internal interface only where it costs nothing — don't build the plugin registry.

3. **Single Next.js app, no monorepo.** With the worker tier deferred (see below), there's no second deploy target to share Prisma with. One app on Vercel. Prisma client lives in `lib/db.ts`. Turborepo/pnpm-workspaces overhead is unjustified.

4. **Watchlists become lightweight optional "Lists," not mandatory.** v1 auto-created a default watchlist for every company and treated lists as core. For an internal team importing from a few sheets, the *sheet itself* is effectively the list. Keep a simple optional `List` grouping for segmentation, but drop the mandatory default-watchlist machinery.

5. **Re-engagement diffing is narrow, not a full snapshot engine.** v2's Phase-2 re-engagement only needs to compare **Apollo's current contact set** against our stored `Contact`s to find new hires / title changes / departures. That's a targeted contact diff, not the general field-by-field `Snapshot` hash engine. We don't build `Snapshot` until Phase 3 signals need it.

### 1.2 What can be POSTPONED

| Postpone to | Item | Why |
|---|---|---|
| Phase 3 | Funding signals | Lowest near-term ROI per your priorities; needs a data source we don't have cleanly (no Crunchbase paid) |
| Phase 3 | Hiring signals (as a *signal feed*) | Apollo gives headcount/role *indicators* in P1 enrichment; the full signal pipeline waits |
| Phase 3 | Intent Feed page + intent scoring | No signals to feed it until P3 |
| Phase 3 | `Snapshot` / `Signal` / `Recommendation` models | Only the signal engine needs them |
| Phase 3 | AI recommendations (Claude/OpenAI) | Apply AI once there are signals worth explaining |
| Later | BullMQ + Redis worker tier | Introduce only when sync volume or AI rate-limiting exceeds what cron-batching handles |
| Later | Role matrix (OWNER/ADMIN/MEMBER/VIEWER) | Internal team — a single `isAdmin` flag is enough |

### 1.3 What was OVER-ENGINEERED for v1

- **BullMQ + Redis + a separate always-on worker service.** For an internal tool monitoring hundreds–low-thousands of accounts on a *daily* cadence, this is heavy. v2 replaces it with **Vercel Cron → a resumable, idempotent batch-sync endpoint** that processes companies in chunks until the backlog drains. (Threshold to revisit in §6.3.)
- **Org-scoped tenancy + RLS + Prisma middleware** — pure overhead for one org.
- **Monorepo** — no second deploy target in v1.
- **Cursor pagination + infinite-scroll feed, versioned prompt system, AIProvider with cross-fallback** — all tied to features now in Phase 3.
- **Mandatory auto-watchlists** — replaced by optional Lists; the sheet is the list.

---

## 2. Revised System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Vercel (single app)                       │
│                                                               │
│  Next.js 15 (App Router, RSC)                                 │
│   ├── (dashboard) pages: Companies, CRM, Contacts,            │
│   │                      Re-Engagement, Settings              │
│   ├── /api  route handlers (CRUD + sync triggers)             │
│   └── Clerk middleware (team login only)                      │
│                                                               │
│  Vercel Cron ──► POST /api/cron/sync   (Bearer secret)        │
│                    └─ resumable batch: pick N stale companies,│
│                       enrich via Apollo, dedupe, write back   │
└───────────┬───────────────────────────────────┬──────────────┘
            │ Prisma                             │ HTTP
            ▼                                     ▼
   ┌──────────────────┐              ┌────────────────────────────┐
   │ PostgreSQL        │             │ External APIs               │
   │ (Supabase)        │             │  • Apollo  (enrich/contacts │
   │  Companies,       │             │            /headcount)      │
   │  Contacts,        │             │  • Google Sheets API        │
   │  Outreach,        │             │            (service acct)   │
   │  Lists,           │             │  • Clay (free tier, manual/ │
   │  ReEngagement,    │             │            light use)       │
   │  SyncRun          │             │  • Claude API  (Phase 3)    │
   └──────────────────┘              └────────────────────────────┘
```

**No Redis, no BullMQ, no worker service in v1.** All work runs inside the Vercel app, triggered either by user requests or Vercel Cron.

---

## 3. Data Sources

### 3.1 Apollo (primary enrichment)
Single client `lib/apollo.ts` wrapping the Apollo API. Responsibilities:
- **Company enrichment**: industry, employee count, location, description, `apolloOrganizationId` (stable join key), website normalization.
- **Contact discovery**: people at a company, with title + seniority + (where available) email/LinkedIn.
- **Headcount & hiring indicators**: employee count and growth, open-role hints — stored as enrichment fields in P1; promoted to signals in P3.
- **New-contact detection** (P2): re-pull contacts for tracked companies; diff against stored `Contact`s.

Concerns handled in-client: rate limiting (simple concurrency cap + exponential backoff), credit-aware batching, partial-failure tolerance (one company failing never aborts the batch).

### 3.2 Google Sheets (first-class ingestion)
Single client `lib/sheets.ts` using the Google Sheets API via a **service account** (no per-user OAuth in v1).
- **Connect a sheet** in Settings: store `spreadsheetId`, `sheetRange`, and a **column mapping** (which column is Name / Website / LinkedIn / Status / external id).
- **Daily sync** (via the same cron): read rows → normalize → **upsert by `normalizedDomain`** (and/or a stable `externalRef` from the sheet) → update existing companies → insert new → never duplicate.
- **Idempotent**: re-running the sync on an unchanged sheet is a no-op.
- Direction is **read-only from the sheet** in v1 (sheet is source of truth for the import set). Write-back to Sheets is out of scope for v1.

### 3.3 Clay (free tier)
Light/manual use only — not wired into the automated pipeline in v1 (free-tier limits make it unreliable for daily automation). Treated as an analyst's manual enrichment tool whose outputs can be brought in via the Sheets path.

### 3.4 Claude / OpenAI
Not used until **Phase 3**. Claude is primary (recommendations + signal explanation); OpenAI optional for structured scoring. A minimal wrapper, not the v1 dual-provider abstraction.

---

## 4. Revised Data Model

`orgId` is gone from every model. Tables introduced per phase are marked.

### 4.1 Phase 1 models

- **User** — mirrors Clerk user (`clerkUserId`, email, name, `isAdmin`). Used for attribution on outreach. No role matrix.
- **Company** — `name`, `website`, `normalizedDomain` (unique), `linkedinUrl`, `status (NEW | REACHED_OUT | CUSTOMER)`, enrichment cache (`industry`, `headcount`, `location`, `description`, `apolloOrganizationId`), `source (SHEET | CSV | MANUAL | APOLLO)`, `externalRef` (sheet row key for dedupe), `lastEnrichedAt`, `lastSyncedAt`.
- **List** *(optional grouping)* — `name`, `description`; many-to-many with Company via `ListCompany`.
- **Outreach** — `companyId`, optional `contactId`, `channel (EMAIL | LINKEDIN | CALL | OTHER)`, `status (NOT_REACHED_OUT | REACHED_OUT | REPLIED | MEETING_BOOKED)`, `notes`, `occurredAt`, `userId` (who logged it).
- **SheetSource** — connected-sheet config: `spreadsheetId`, `sheetRange`, `columnMapping (Json)`, `lastSyncedAt`, `enabled`.
- **SyncRun** — audit of each sync (Sheets or Apollo): `kind`, `startedAt`, `finishedAt`, `processed`, `inserted`, `updated`, `skipped`, `errors (Json)`, `status`.

### 4.2 Phase 2 models (CRM contacts + re-engagement)

- **Contact** — `companyId`, `apolloContactId`, `name`, `title`, `seniority`, `email`, `linkedinUrl`, `firstSeenAt`, `lastSeenAt`, `departedAt?` (set when no longer returned by Apollo). The living record we diff against.
- **StakeholderChange** — log of detected people changes: `companyId`, `contactId?`, `changeType (NEW_HIRE | PROMOTION | DEPARTURE | EXEC_CHANGE)`, `detail (Json)`, `detectedAt`.
- **ReEngagementAlert** — `companyId`, `reason`, `detail (Json)`, `score`, `resolved`, `createdAt`. Generated for `REACHED_OUT`/`CUSTOMER` companies when qualifying `StakeholderChange`s occur. Powers the "Accounts Worth Revisiting" dashboard.

### 4.3 Phase 3 models (signals + AI)

- **Snapshot** — point-in-time company state + `hash` (only introduced now, for the general signal engine).
- **Signal** — `type (HIRING | FUNDING | PRODUCT_LAUNCH | EXPANSION | PARTNERSHIP | LEADERSHIP_CHANGE)`, `summary`, `intentScore`, `payload`, `detectedAt`.
- **Recommendation** — `signalId` (1:1), `whyItMatters`, `outreachAngle`, `stakeholders (Json)`, `channel`, `model`.

> Re-engagement (P2) does **not** depend on `Snapshot`/`Signal` — it uses the narrow `Contact` diff. The general engine arrives only when broader signals do.

---

## 5. Revised API Surface (v1 / Phase 1–2)

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/api/companies` | List (filter status/list/search) / create |
| `GET/PATCH/DELETE` | `/api/companies/[id]` | Detail / update status / remove |
| `POST` | `/api/companies/import/csv` | One-off CSV import (parse, dedupe, upsert) |
| `GET/POST` | `/api/sheets/sources` | Manage connected sheets |
| `POST` | `/api/sheets/sources/[id]/sync` | Manual "sync now" |
| `POST` | `/api/companies/[id]/enrich` | On-demand Apollo enrichment |
| `GET/POST/PATCH` | `/api/contacts` | (P2) Contacts |
| `GET/POST/PATCH` | `/api/outreach` | CRM logging + status |
| `GET/PATCH` | `/api/re-engagement` | (P2) Alerts list / resolve |
| `GET/POST` | `/api/lists` | Optional lists + membership |
| `POST` | `/api/cron/sync` | **Cron-only** (Bearer secret): resumable batch — Sheets sync + Apollo enrichment of stale companies; (P2) contact re-pull + diff |

All inputs validated with Zod. Single auth check = "logged-in team member"; `isAdmin` gates Settings mutations (sheet config, members).

---

## 6. Sync & Scheduling (no queue in v1)

### 6.1 Daily cron
`Vercel Cron` (e.g., `0 6 * * *`) → `POST /api/cron/sync` with a Bearer secret. Steps:
1. **Sheets sync** — for each enabled `SheetSource`, read rows, upsert companies by `normalizedDomain`/`externalRef`.
2. **Apollo enrichment** — select up to **N companies** where `lastEnrichedAt` is null/stale, enrich, write back enrichment fields.
3. **(P2) Contact refresh** — for `REACHED_OUT`/`CUSTOMER` companies due for refresh, re-pull Apollo contacts, diff → `StakeholderChange` → `ReEngagementAlert`.
4. Record a `SyncRun`.

### 6.2 Staying within the function time limit (resumability)
Each invocation processes a **bounded batch** (e.g., 25–50 companies) ordered by staleness, and marks progress via `lastEnrichedAt`/`lastSyncedAt`. If the backlog is large, run the cron **on a tight schedule during a nightly window** (e.g., every 5 min from 02:00–04:00) so successive invocations drain it. Because each step is **idempotent and cursor-driven by staleness**, overlapping or repeated runs are safe.

### 6.3 When to introduce BullMQ + Redis (the trigger, not now)
Add the real queue/worker tier only when one of these is true:
- Daily company count × Apollo latency can't drain within the nightly cron window, **or**
- We need **per-second rate-limit shaping** beyond simple in-process backoff (e.g., heavy Phase-3 AI calls), **or**
- We add near-real-time signal processing.
Until then, cron-batching is simpler, cheaper, and sufficient.

---

## 7. Revised Folder Structure (single app)

```
signalflow/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/                 # Clerk sign-in
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # sidebar + topbar shell
│   │   │   ├── dashboard/          # home summary
│   │   │   ├── companies/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── contacts/           # P2
│   │   │   ├── crm/
│   │   │   ├── re-engagement/      # P2 — "Accounts Worth Revisiting"
│   │   │   └── settings/           # sheet sources, members, ICP (P3)
│   │   ├── api/
│   │   │   ├── companies/ ...
│   │   │   ├── sheets/sources/ ...
│   │   │   ├── contacts/ ...        # P2
│   │   │   ├── outreach/ ...
│   │   │   ├── re-engagement/ ...   # P2
│   │   │   ├── lists/ ...
│   │   │   └── cron/sync/route.ts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                      # shadcn primitives
│   │   ├── layout/                  # Sidebar, Topbar, PageHeader
│   │   ├── companies/               # CompanyTable, StatusBadge, CompanyDetailSheet
│   │   ├── crm/                     # OutreachKanban, StatusSelect, OutreachTimeline
│   │   ├── contacts/                # P2
│   │   ├── reengagement/            # P2 — RevisitCard
│   │   └── shared/                  # DataTable, EmptyState, Loading
│   ├── lib/
│   │   ├── db.ts                    # Prisma singleton
│   │   ├── auth.ts                  # getUser(), requireAdmin()
│   │   ├── apollo.ts                # Apollo client (enrich/contacts/headcount)
│   │   ├── sheets.ts                # Google Sheets client + upsert
│   │   ├── sync.ts                  # batch sync orchestration (used by cron)
│   │   ├── dedupe.ts                # domain normalization + upsert helpers
│   │   ├── validators/             # Zod schemas
│   │   └── ai/                      # P3 — Claude client + prompts
│   ├── hooks/
│   └── types/
├── middleware.ts                    # Clerk auth gate
├── next.config.ts
└── tailwind.config.ts
```

---

## 8. Pages (v1 → P2)

| Page | Phase | Purpose |
|---|---|---|
| **Dashboard** | 1 | Counts by status, recent outreach, last sync health; (P2) top "revisit" alerts |
| **Companies** | 1 | Master table; filter by status/list/search; detail sheet with enrichment; CSV import + "sync now"; on-demand enrich |
| **CRM** | 1 | Outreach pipeline (Not Reached → Reached → Replied → Meeting Booked); per-company history |
| **Contacts** | 2 | People directory from Apollo; seniority/title; linked to companies |
| **Re-Engagement** | 2 | "Accounts Worth Revisiting" — ReEngagementAlerts from new hires / promotions / exec changes |
| **Settings** | 1 | Connected Google Sheets (id, range, column mapping), members/`isAdmin`, sync schedule; (P3) ICP config |
| **Intent Feed** | 3 | Signal feed once the signal engine exists |

Design language unchanged from v1 (§14 there): Linear/Attio/Clay polish — dense tables, slide-over detail panels, ⌘K, dark mode. shadcn/ui primitives → composites → domain components.

---

## 9. Revised Implementation Roadmap

### Phase 0 — Foundation (short)
- Single Next.js 15 app, TypeScript strict, Tailwind + shadcn, dashboard shell + dark mode.
- Clerk auth (team login only — **no Organizations**), `middleware.ts` gate, `User` sync on first login.
- Supabase Postgres, Prisma, first migration (Phase-1 models).
- Env/secrets: Apollo key, Google service-account JSON, Clerk keys.

### Phase 1 — Company DB + Sheets Sync + Apollo + CRM  *(MVP core)*
- **Companies**: model, table UI, filters, status, detail slide-over, manual create, CSV import with domain-dedupe upsert.
- **Google Sheets**: `SheetSource` config UI in Settings; `lib/sheets.ts` read + column mapping; upsert-by-domain/externalRef; "sync now" + idempotent re-sync.
- **Apollo enrichment**: `lib/apollo.ts`; on-demand enrich endpoint; enrichment fields on Company.
- **Daily cron**: `/api/cron/sync` resumable batch (Sheets upsert + stale-company Apollo enrichment) + `SyncRun` audit + sync-health on Dashboard.
- **CRM**: `Outreach` model; logging + status pipeline (Kanban/timeline); per-company history.
- *Exit criteria:* SDR imports a sheet, sees enriched companies, works them through the CRM pipeline — all auto-refreshing daily.

### Phase 2 — Contacts + Re-Engagement
- **Contacts**: Apollo contact discovery per company; `Contact` directory UI; link to companies.
- **New-stakeholder detection**: cron re-pulls contacts for `REACHED_OUT`/`CUSTOMER` companies; diff vs stored `Contact`s → `StakeholderChange` (NEW_HIRE / PROMOTION / DEPARTURE / EXEC_CHANGE).
- **Re-Engagement Engine**: turn qualifying changes into `ReEngagementAlert`s with a simple rule-based score.
- **Accounts Worth Revisiting dashboard**: the Re-Engagement page + dashboard tile.
- *Exit criteria:* when a buyer-relevant person joins/changes at an account we've already touched, it surfaces as a revisit alert.

### Phase 3 — Signals + AI (last)
- **Hiring signals** (from Apollo headcount/role deltas) → introduce `Snapshot` + `Signal`.
- **Funding signals** — pending a viable source (revisit given no Crunchbase paid; may rely on Sheets-fed or free news).
- **Intent scoring** (rule-based first) + **Intent Feed** page.
- **AI recommendations** — Claude (OpenAI optional) for "why it matters / stakeholders / outreach angle"; `Recommendation` model; ICP config in Settings feeds scoring.
- **(Conditional) BullMQ + Redis + worker tier** — introduce here only if §6.3 thresholds are hit.

### Cross-cutting
- Zod validation at all boundaries; Sentry; idempotent sync; unit tests on dedupe/diff logic; Playwright on the core CRM flow.

---

## 10. Open Questions (v2)

1. **Apollo plan limits** — credits/rate per day? Determines batch size N and refresh cadence in §6.
2. **Sheet contract** — fixed column headers we control, or arbitrary user sheets needing flexible mapping? (Affects Settings UI complexity.)
3. **Contact refresh cadence** for re-engagement — how often to re-pull Apollo contacts for touched accounts (weekly? on status change?) given credit cost.
4. **Funding source** — with no Crunchbase paid, is Phase-3 funding worth it, or do we rely on manual/Sheets/free-news input?
5. **Team size & auth** — how many SDRs? Confirms that flat `isAdmin` (no role matrix) is enough.

---

*No application code generated yet. On approval, scaffold Phase 0 → Phase 1 MVP.*
```
