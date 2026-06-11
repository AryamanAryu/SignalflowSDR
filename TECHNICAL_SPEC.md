# SignalFlow — Technical Specification

**Version:** 1.0
**Status:** Draft for review
**Date:** 2026-06-11

> AI-powered revenue intelligence platform. Users upload companies; SignalFlow continuously monitors them, detects intent signals, and recommends accounts and people to contact.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack & Rationale](#3-tech-stack--rationale)
4. [Multi-Tenancy & Auth Model](#4-multi-tenancy--auth-model)
5. [Data Model & ERD](#5-data-model--erd)
6. [Prisma Schema](#6-prisma-schema)
7. [Folder Structure](#7-folder-structure)
8. [API Architecture](#8-api-architecture)
9. [Intent Signal Engine](#9-intent-signal-engine)
10. [Daily Monitoring & Snapshot Diffing](#10-daily-monitoring--snapshot-diffing)
11. [AI Recommendation Layer](#11-ai-recommendation-layer)
12. [Re-Engagement Engine](#12-re-engagement-engine)
13. [Queue & Job Architecture](#13-queue--job-architecture)
14. [UI Architecture & Design System](#14-ui-architecture--design-system)
15. [Page-by-Page Spec](#15-page-by-page-spec)
16. [Security, Compliance & Rate Limiting](#16-security-compliance--rate-limiting)
17. [Observability](#17-observability)
18. [Implementation Plan (Phased)](#18-implementation-plan-phased)
19. [Open Questions & Assumptions](#19-open-questions--assumptions)

---

## 1. Product Overview

### 1.1 Problem
SDRs and AEs waste time on cold accounts and miss the narrow windows when a prospect is actually buyable. Buying intent is leaked through public signals — funding rounds, hiring sprees, product launches, leadership changes — but these signals are scattered and noisy. By the time a rep notices, a competitor already booked the meeting.

### 1.2 Solution
SignalFlow lets a team upload their target accounts once, then continuously watches every company for intent signals, scores them, explains *why they matter*, and tells the rep *who to contact and how*. It closes the loop with a CRM and a re-engagement engine that resurfaces dormant-but-now-hot accounts.

### 1.3 Primary Personas
| Persona | Goal | Key Pages |
|---|---|---|
| **SDR** | Find the hottest accounts today, know who to email | Intent Feed, Companies, Contacts |
| **AE** | Re-engage stalled deals when something changes | Re-Engagement, CRM |
| **Sales Ops / Manager** | Manage account lists, watchlists, team data hygiene | Companies, Watchlists, Settings |

### 1.4 Core Loop
```
Upload companies (CSV) → auto-added to a Watchlist → daily scan creates Snapshots
→ diff vs prior Snapshot → new Signals → AI scores + explains → Intent Feed
→ rep acts (Outreach) → CRM tracks status → Re-Engagement re-surfaces when changed
```

### 1.5 Success Metrics (product)
- Time-to-first-signal after upload < 5 min (initial enrichment) and < 24h (full scan).
- ≥ 70% of signals rated "useful" by users.
- Re-engagement engine drives X% of booked meetings (tracked via CRM outcomes).

---

## 2. System Architecture

### 2.1 High-Level Diagram
```
┌──────────────────────────────────────────────────────────────────────┐
│                          Vercel (Edge + Node)                          │
│                                                                        │
│  ┌────────────────┐     ┌─────────────────────────────────────────┐   │
│  │  Next.js 15    │     │       Next.js API Routes / Route         │   │
│  │  App Router    │────▶│       Handlers (REST + RSC actions)      │   │
│  │  (RSC + Client)│     │   - /api/companies  /api/signals  ...    │   │
│  └────────────────┘     └──────────────┬──────────────────────────┘   │
│         │                               │                              │
│   Clerk (Auth/Org)              Prisma Client                          │
└─────────┼───────────────────────────────┼─────────────────────────────┘
          │                               │
          ▼                               ▼
   ┌──────────────┐            ┌────────────────────────┐
   │   Clerk      │            │  PostgreSQL (Supabase) │
   │  (sessions,  │            │  - Prisma migrations   │
   │   orgs,      │            │  - RLS optional        │
   │   webhooks)  │            └────────────────────────┘
   └──────────────┘
                                          ▲
                                          │ writes Signals/Snapshots
          ┌───────────────────────────────┴───────────────────────────┐
          │              Worker Tier (separate deploy)                 │
          │   Railway / Fly.io / Render — long-running Node process    │
          │                                                            │
          │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
          │  │ BullMQ      │  │ Scan Worker  │  │ AI Worker        │  │
          │  │ Schedulers  │─▶│ (enrichment, │─▶│ (GPT-5 / Claude  │  │
          │  │ (repeatable)│  │  diffing)    │  │  scoring + recs) │  │
          │  └─────────────┘  └──────────────┘  └──────────────────┘  │
          └────────────────────────────┬──────────────────────────────┘
                                        │
                                ┌───────▼────────┐      ┌──────────────────┐
                                │ Redis (Upstash)│      │ External Sources  │
                                │ BullMQ backing │      │ - News/Funding API│
                                └────────────────┘      │ - Jobs/Hiring API │
                                                         │ - LinkedIn-ish    │
                                                         │ - Web scrape/RSS  │
                                                         └──────────────────┘
```

### 2.2 Key Architectural Decision: Worker Tier is NOT on Vercel
Vercel serverless functions are time-bounded (max ~300s) and not suited to long-running BullMQ workers or persistent Redis connections. The **queue workers run as a separate always-on Node service** (Railway/Fly/Render). Vercel hosts the app + API. They share the same Postgres and Redis. This is the single most important scalability decision in the spec.

- **Vercel app**: serves UI, handles user-facing API calls, *enqueues* jobs.
- **Worker service**: consumes jobs, calls external data sources + AI, writes results.
- **Cron**: a repeatable BullMQ job (or Vercel Cron hitting an authenticated endpoint that enqueues) triggers the daily scan fan-out.

### 2.3 Request vs Async Boundary
- **Synchronous (request path):** auth, CRUD on companies/watchlists/contacts, reading the feed, CSV parse + insert.
- **Asynchronous (queue path):** company enrichment, daily scans, snapshot diffing, signal generation, AI scoring/recommendations, re-engagement evaluation.

---

## 3. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC) | Unified FE/BE, server components reduce client JS, streaming UI |
| Language | TypeScript (strict) | Type safety across full stack, shared types via Prisma + Zod |
| Styling | TailwindCSS + shadcn/ui | Fast, consistent, themeable, owns the components (no vendor lock) |
| ORM | Prisma | Type-safe queries, migrations, great DX with Postgres |
| DB | PostgreSQL (Supabase) | Relational integrity, JSONB for flexible signal payloads, full-text search |
| Auth | Clerk | Orgs/teams out of the box, webhooks, hosted UI |
| Queue | BullMQ + Redis (Upstash) | Repeatable jobs, rate limiting, concurrency control, retries |
| AI | OpenAI GPT-5 + Claude API | Dual-model: GPT-5 for structured scoring, Claude for long-form reasoning/copy |
| Hosting | Vercel (app) + Railway/Fly (workers) | Best-in-class Next hosting; separate tier for long jobs |
| Validation | Zod | Runtime validation at API + queue boundaries |
| Email | Resend (optional) | Outreach send + notifications |

### 3.1 Dual-AI Strategy
- **GPT-5** → deterministic, schema-constrained tasks: intent score (0–100), signal classification, structured field extraction. Use JSON mode / structured outputs.
- **Claude** → nuanced reasoning + copy: "why this matters," outreach angle, stakeholder rationale, re-engagement narrative. Larger context for digesting multiple signals per account.
- A thin `AIProvider` abstraction lets either model serve either role; routing is config-driven and fall-back-able.

---

## 4. Multi-Tenancy & Auth Model

### 4.1 Tenancy
**Org-scoped multi-tenancy** using Clerk Organizations. Every domain row carries an `orgId`. A user belongs to one or more orgs; the active org scopes all data.

- **Isolation:** every Prisma query is filtered by `orgId` derived from the Clerk session (never from client input).
- **Defense in depth:** a Prisma middleware/extension injects `orgId` into all `where` clauses for tenant-scoped models; optionally Supabase RLS as a second layer.

### 4.2 Roles
| Role | Permissions |
|---|---|
| `OWNER` | Billing, member management, all data |
| `ADMIN` | Manage watchlists, settings, all data |
| `MEMBER` | CRUD companies/contacts/outreach, read feed |
| `VIEWER` | Read-only |

Roles map to Clerk org roles. Enforced in a server-side `requireRole()` guard.

### 4.3 Webhooks
Clerk webhooks (`organization.created`, `user.created`, `organizationMembership.*`) sync into local `Org` and `User` tables so the app can join on them without a Clerk round-trip.

---

## 5. Data Model & ERD

### 5.1 Entity Overview
```
Org 1───* User
Org 1───* Watchlist 1───* WatchlistCompany *───1 Company
Org 1───* Company 1───* Contact
                  1───* Snapshot
                  1───* Signal 1───1 Recommendation
                  1───* Outreach *───1 Contact
                  1───* ReEngagementAlert
Org 1───* Upload (CSV import audit)
Signal *───1 SignalType (enum)
```

### 5.2 Core Entities

- **Org** — tenant. Mirrors Clerk org.
- **User** — mirrors Clerk user; membership + role.
- **Company** — canonical account. Unique on `(orgId, normalizedDomain)`. Holds status (`NEW | REACHED_OUT | CUSTOMER`), enrichment fields.
- **Watchlist** — named grouping (e.g., "AI Startups"). A default watchlist receives every uploaded company; companies can belong to many watchlists (many-to-many via `WatchlistCompany`).
- **Contact** — a person at a company (name, title, seniority, LinkedIn, email). Powers stakeholder recommendations + re-engagement.
- **Snapshot** — point-in-time captured state of a company's monitored surfaces (headcount, open roles, funding total, leadership set, recent posts). JSONB payload + hash for cheap diffing.
- **Signal** — a detected change/event. Has `type`, `summary`, `intentScore`, `payload`, `detectedAt`, link back to the snapshot pair that produced it.
- **Recommendation** — AI output attached to a signal: `whyItMatters`, `stakeholders[]`, `outreachAngle`, `suggestedChannel`.
- **Outreach** — a logged touch: channel, status (`NOT_REACHED_OUT | REACHED_OUT | REPLIED | MEETING_BOOKED`), notes, linked contact + (optional) signal.
- **ReEngagementAlert** — generated for already-contacted/customer companies when qualifying changes (new hire, promotion, exec change) are detected.
- **Upload** — audit record of a CSV import (row counts, errors, dedupe results).

### 5.3 Enums
```
CompanyStatus:  NEW | REACHED_OUT | CUSTOMER
SignalType:     FUNDING | HIRING | PRODUCT_LAUNCH | EXPANSION | PARTNERSHIP | LEADERSHIP_CHANGE
OutreachStatus: NOT_REACHED_OUT | REACHED_OUT | REPLIED | MEETING_BOOKED
OutreachChannel:EMAIL | LINKEDIN | CALL | OTHER
MemberRole:     OWNER | ADMIN | MEMBER | VIEWER
JobStatus:      QUEUED | RUNNING | SUCCESS | FAILED
```

### 5.4 Indexing Strategy
- `Company (orgId, normalizedDomain)` unique; `(orgId, status)`.
- `Signal (orgId, detectedAt DESC)` — drives the feed; `(companyId, type)`.
- `Snapshot (companyId, capturedAt DESC)` — latest-snapshot lookups.
- `Outreach (orgId, status)`, `Contact (companyId)`.
- GIN index on JSONB `Signal.payload` and on full-text search vectors for company name.

---

## 6. Prisma Schema

> Target Prisma schema. JSONB fields hold flexible, source-dependent payloads; structured fields are first-class columns for indexing/filtering.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // Supabase pooled vs direct (migrations)
}

// ─── Tenancy ────────────────────────────────────────────────

model Org {
  id         String   @id @default(cuid())
  clerkOrgId String   @unique
  name       String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  users        User[]
  companies    Company[]
  watchlists   Watchlist[]
  contacts     Contact[]
  signals      Signal[]
  uploads      Upload[]
  outreaches   Outreach[]
  reEngagements ReEngagementAlert[]
}

model User {
  id          String     @id @default(cuid())
  clerkUserId String     @unique
  orgId       String
  email       String
  name        String?
  role        MemberRole @default(MEMBER)
  createdAt   DateTime   @default(now())

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
}

// ─── Companies & Watchlists ─────────────────────────────────

model Company {
  id               String        @id @default(cuid())
  orgId            String
  name             String
  website          String?
  normalizedDomain String?       // e.g. "stripe.com" for dedupe
  linkedinUrl      String?
  status           CompanyStatus @default(NEW)

  // enrichment cache (denormalized latest values)
  industry     String?
  headcount    Int?
  location     String?
  description  String?
  lastScannedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  org           Org                 @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contacts      Contact[]
  snapshots     Snapshot[]
  signals       Signal[]
  outreaches    Outreach[]
  watchlists    WatchlistCompany[]
  reEngagements ReEngagementAlert[]

  @@unique([orgId, normalizedDomain])
  @@index([orgId, status])
}

model Watchlist {
  id          String   @id @default(cuid())
  orgId       String
  name        String
  description String?
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())

  org       Org                @relation(fields: [orgId], references: [id], onDelete: Cascade)
  companies WatchlistCompany[]

  @@unique([orgId, name])
  @@index([orgId])
}

model WatchlistCompany {
  watchlistId String
  companyId   String
  addedAt     DateTime @default(now())

  watchlist Watchlist @relation(fields: [watchlistId], references: [id], onDelete: Cascade)
  company   Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@id([watchlistId, companyId])
  @@index([companyId])
}

// ─── Contacts ───────────────────────────────────────────────

model Contact {
  id          String   @id @default(cuid())
  orgId       String
  companyId   String
  name        String
  title       String?
  seniority   String?  // e.g. C_LEVEL, VP, DIRECTOR, IC
  email       String?
  linkedinUrl String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org        Org        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  company    Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  outreaches Outreach[]

  @@index([companyId])
  @@index([orgId])
}

// ─── Monitoring: Snapshots & Signals ────────────────────────

model Snapshot {
  id         String   @id @default(cuid())
  companyId  String
  capturedAt DateTime @default(now())
  hash       String   // content hash for fast equality check
  payload    Json     // { headcount, openRoles[], fundingTotal, leadership[], posts[] ... }

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, capturedAt])
}

model Signal {
  id          String     @id @default(cuid())
  orgId       String
  companyId   String
  type        SignalType
  summary     String
  intentScore Int        @default(0) // 0-100
  payload     Json       // structured diff detail + source links
  sourceUrl   String?
  detectedAt  DateTime   @default(now())
  createdAt   DateTime   @default(now())

  org            Org             @relation(fields: [orgId], references: [id], onDelete: Cascade)
  company        Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  recommendation Recommendation?

  @@index([orgId, detectedAt])
  @@index([companyId, type])
}

model Recommendation {
  id            String   @id @default(cuid())
  signalId      String   @unique
  whyItMatters  String
  outreachAngle String
  stakeholders  Json     // [{ name, title, contactId?, rationale }]
  channel       OutreachChannel @default(EMAIL)
  model         String   // which AI model produced it
  createdAt     DateTime @default(now())

  signal Signal @relation(fields: [signalId], references: [id], onDelete: Cascade)
}

// ─── CRM: Outreach ──────────────────────────────────────────

model Outreach {
  id        String          @id @default(cuid())
  orgId     String
  companyId String
  contactId String?
  channel   OutreachChannel @default(EMAIL)
  status    OutreachStatus  @default(NOT_REACHED_OUT)
  notes     String?
  signalId  String?         // optional: outreach triggered by a signal
  occurredAt DateTime       @default(now())
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  org     Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  company Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  contact Contact? @relation(fields: [contactId], references: [id])

  @@index([orgId, status])
  @@index([companyId])
}

// ─── Re-Engagement ──────────────────────────────────────────

model ReEngagementAlert {
  id          String   @id @default(cuid())
  orgId       String
  companyId   String
  reason      String   // "New VP Sales hired", "CEO change", ...
  detail      Json
  score       Int      @default(0)
  resolved    Boolean  @default(false)
  createdAt   DateTime @default(now())

  org     Org     @relation(fields: [orgId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([orgId, resolved])
}

// ─── Import audit ───────────────────────────────────────────

model Upload {
  id          String   @id @default(cuid())
  orgId       String
  filename    String
  totalRows   Int
  insertedRows Int
  skippedRows Int
  errors      Json?
  createdAt   DateTime @default(now())

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
}

// ─── Enums ──────────────────────────────────────────────────

enum CompanyStatus   { NEW REACHED_OUT CUSTOMER }
enum SignalType      { FUNDING HIRING PRODUCT_LAUNCH EXPANSION PARTNERSHIP LEADERSHIP_CHANGE }
enum OutreachStatus  { NOT_REACHED_OUT REACHED_OUT REPLIED MEETING_BOOKED }
enum OutreachChannel { EMAIL LINKEDIN CALL OTHER }
enum MemberRole      { OWNER ADMIN MEMBER VIEWER }
```

---

## 7. Folder Structure

```
signalflow/
├── apps/
│   ├── web/                          # Next.js 15 app (Vercel)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/      # public landing
│   │   │   │   ├── (auth)/           # Clerk sign-in/up
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── layout.tsx    # shell: sidebar + topbar
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── companies/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   ├── [id]/page.tsx
│   │   │   │   │   │   └── upload/page.tsx
│   │   │   │   │   ├── watchlists/
│   │   │   │   │   ├── intent-feed/
│   │   │   │   │   ├── contacts/
│   │   │   │   │   ├── crm/
│   │   │   │   │   ├── re-engagement/
│   │   │   │   │   └── settings/
│   │   │   │   ├── api/
│   │   │   │   │   ├── companies/route.ts
│   │   │   │   │   ├── companies/[id]/route.ts
│   │   │   │   │   ├── upload/route.ts
│   │   │   │   │   ├── watchlists/route.ts
│   │   │   │   │   ├── signals/route.ts
│   │   │   │   │   ├── contacts/route.ts
│   │   │   │   │   ├── outreach/route.ts
│   │   │   │   │   ├── re-engagement/route.ts
│   │   │   │   │   ├── cron/scan/route.ts        # enqueue daily fan-out
│   │   │   │   │   └── webhooks/clerk/route.ts
│   │   │   │   ├── layout.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn primitives
│   │   │   │   ├── layout/           # Sidebar, Topbar, PageHeader
│   │   │   │   ├── companies/        # CompanyTable, StatusBadge, CompanyCard
│   │   │   │   ├── feed/             # SignalCard, IntentScoreBadge, FeedFilters
│   │   │   │   ├── crm/              # OutreachKanban, StatusSelect
│   │   │   │   ├── watchlists/
│   │   │   │   └── shared/           # DataTable, EmptyState, Loading
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts           # getOrg(), requireRole()
│   │   │   │   ├── db.ts             # Prisma client singleton + tenant ext
│   │   │   │   ├── queue.ts          # BullMQ enqueue helpers (producer)
│   │   │   │   ├── validators/       # Zod schemas (shared with API)
│   │   │   │   └── utils.ts
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── middleware.ts             # Clerk auth + org gating
│   │   ├── next.config.ts
│   │   └── tailwind.config.ts
│   │
│   └── worker/                       # BullMQ worker service (Railway/Fly)
│       ├── src/
│       │   ├── index.ts              # boot all workers
│       │   ├── queues.ts             # queue definitions + schedulers
│       │   ├── workers/
│       │   │   ├── scanCompany.ts    # enrich + snapshot
│       │   │   ├── diffSnapshot.ts   # produce signals
│       │   │   ├── scoreSignal.ts    # AI score + recommendation
│       │   │   └── reEngage.ts       # re-engagement evaluation
│       │   ├── sources/              # external data adapters
│       │   │   ├── funding.ts
│       │   │   ├── hiring.ts
│       │   │   ├── news.ts
│       │   │   ├── leadership.ts
│       │   │   └── index.ts          # SourceAdapter interface
│       │   ├── ai/
│       │   │   ├── provider.ts       # AIProvider abstraction
│       │   │   ├── openai.ts
│       │   │   ├── claude.ts
│       │   │   └── prompts/
│       │   └── lib/                  # shares db/types with web via packages
│       └── Dockerfile
│
├── packages/
│   ├── db/                           # Prisma schema + client (shared)
│   │   ├── prisma/schema.prisma
│   │   └── src/index.ts
│   ├── types/                        # shared TS types + Zod schemas
│   └── config/                       # eslint, tsconfig, tailwind preset
│
├── package.json                      # pnpm workspaces / turborepo
├── turbo.json
└── README.md
```

**Why a monorepo:** the worker tier and the web app must share the Prisma client, types, and Zod validators. A pnpm + Turborepo monorepo prevents schema drift between the two deploy targets.

---

## 8. API Architecture

### 8.1 Principles
- **REST-ish route handlers** under `app/api/*` for client-driven CRUD; **Server Actions** for form mutations inside RSC where it reduces boilerplate.
- Every handler: `auth → validate (Zod) → authorize (role) → service call → typed response`.
- **Services layer** (`lib/services/*`) holds business logic; route handlers stay thin. Workers reuse the same services where applicable.
- Consistent envelope: `{ data, error, meta }`. Pagination via cursor (`?cursor=&limit=`).

### 8.2 Endpoint Map
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Parse CSV, dedupe, insert companies, add to default watchlist, enqueue enrichment |
| `GET/POST` | `/api/companies` | List (filter by status/watchlist/search) / create |
| `GET/PATCH/DELETE` | `/api/companies/[id]` | Detail / update status / remove |
| `GET/POST` | `/api/watchlists` | List / create |
| `POST/DELETE` | `/api/watchlists/[id]/companies` | Add/remove company membership |
| `GET` | `/api/signals` | Intent feed (cursor paginated, filters: type, score, watchlist, date) |
| `GET/POST/PATCH` | `/api/contacts` | CRM contacts |
| `GET/POST/PATCH` | `/api/outreach` | Log + update outreach status |
| `GET/PATCH` | `/api/re-engagement` | List alerts / resolve |
| `POST` | `/api/cron/scan` | Auth'd cron trigger → enqueues daily fan-out |
| `POST` | `/api/webhooks/clerk` | Sync org/user membership |

### 8.3 CSV Upload Flow (detailed)
```
Client uploads file → /api/upload
  1. Stream-parse CSV (Papaparse) with header mapping
  2. Validate each row (Zod): name required; normalize website→domain
  3. Dedupe within file + against existing (orgId, normalizedDomain)
  4. Bulk insert Companies (createMany, skipDuplicates)
  5. Attach all to org default watchlist (+ chosen watchlist if provided)
  6. Create Upload audit row (counts + per-row errors)
  7. Enqueue `scanCompany` jobs (one per new company) for immediate enrichment
  8. Return { inserted, skipped, errors }
```

### 8.4 Validation & Error Contract
- All inputs parsed with Zod at the boundary; failures → `422` with field-level errors.
- AuthZ failures → `403`; missing tenant context → `401`.
- Errors normalized through a single `handleApiError` helper; never leak Prisma internals.

---

## 9. Intent Signal Engine

### 9.1 What a Signal Is
A signal is a **detected, time-stamped change** in a company's monitored surface that implies buying readiness. Each signal has a `type`, human `summary`, structured `payload`, source link, and an AI `intentScore` (0–100).

### 9.2 Monitored Surfaces → Signal Types
| Surface | Source Adapter | Produces |
|---|---|---|
| Funding databases / news | `funding.ts` | `FUNDING` |
| Job boards / careers page | `hiring.ts` | `HIRING`, `EXPANSION` |
| Product/news/blog/RSS | `news.ts` | `PRODUCT_LAUNCH`, `PARTNERSHIP` |
| Leadership/LinkedIn-ish | `leadership.ts` | `LEADERSHIP_CHANGE` |

### 9.3 Source Adapter Interface
```ts
interface SourceAdapter {
  key: string;
  fetch(company: Company): Promise<SourceFacts>; // normalized facts
}
// SourceFacts → merged into a Snapshot.payload
```
New data providers are added by implementing this interface — the rest of the pipeline is source-agnostic.

### 9.4 Signal Lifecycle
```
Snapshot(today) vs Snapshot(prev) → diff → candidate changes
→ classify into SignalType (rules + GPT-5) → dedupe vs recent signals
→ create Signal → enqueue scoreSignal (AI) → attach Recommendation
→ appears in Intent Feed
```

### 9.5 Intent Scoring Model
A blended score, computed by `scoreSignal`:
- **Base weight by type** (e.g., FUNDING 40, LEADERSHIP_CHANGE 35, HIRING 25...).
- **Recency decay** (newer = higher).
- **Magnitude** (Series C > seed; 50 open roles > 2).
- **Fit modifiers** (matches user's ICP filters in Settings).
- **AI adjustment** (GPT-5 returns a calibrated 0–100 with rationale; we blend rule score + AI score).

The rule layer guarantees explainability and a sane floor even if AI is unavailable.

---

## 10. Daily Monitoring & Snapshot Diffing

### 10.1 The 24h Scan
- A repeatable BullMQ job (`daily-scan`, cron `0 6 * * *`) — or Vercel Cron hitting `/api/cron/scan` — fans out **one `scanCompany` job per company**, spread across a window to respect source rate limits.
- `scanCompany`:
  1. Run all `SourceAdapter.fetch()` → assemble `SourceFacts`.
  2. Build a normalized `payload`, compute a stable `hash`.
  3. If `hash === latestSnapshot.hash` → **no-op** (skip, update `lastScannedAt`).
  4. Else persist new `Snapshot`, enqueue `diffSnapshot`.

### 10.2 Diffing → Signals
`diffSnapshot` compares the two latest snapshots field-by-field:
- Funding total increased → `FUNDING` signal with delta + round.
- Open roles set grew / new departments → `HIRING` / `EXPANSION`.
- New blog/product entry → `PRODUCT_LAUNCH` / `PARTNERSHIP`.
- Leadership set changed (added/removed/title change) → `LEADERSHIP_CHANGE` + feeds re-engagement.

**Signals are only created on detected change** — this is the core requirement and the diff hash is the cheap gate that enforces it.

### 10.3 Idempotency & Dedupe
- Snapshot `hash` prevents duplicate snapshots.
- Signal dedupe key: `(companyId, type, normalizedPayloadHash)` within a rolling window prevents re-emitting the same event on the next scan.
- Jobs use deterministic `jobId`s (`scan:{companyId}:{yyyy-mm-dd}`) so retries don't double-process.

### 10.4 Backfill / First Scan
On first enrichment there's no prior snapshot → we create the baseline snapshot but emit **only high-confidence "current state" signals** (e.g., recent funding within 90 days) to avoid a noisy cold-start.

---

## 11. AI Recommendation Layer

### 11.1 Per-Signal Output (Recommendation)
For every signal, `scoreSignal` (then a recommendation pass) produces:
- **Why this matters** — 1–2 sentence relevance to the rep (Claude).
- **Recommended stakeholders** — ranked people to contact, matched against existing `Contact`s where possible, with rationale (Claude reasoning + Contact join).
- **Suggested outreach angle** — a concrete hook tied to the signal (Claude).
- **Suggested channel** — EMAIL/LINKEDIN/CALL heuristic.

### 11.2 Prompt Architecture
- Prompts are versioned files in `worker/src/ai/prompts/`.
- Inputs: signal payload + company enrichment + ICP from Settings + (for re-engagement) prior outreach history.
- **Structured outputs**: GPT-5 with JSON schema for the score object; Claude for prose fields, returned as JSON too.
- Token-budgeted: only relevant snapshot deltas are passed, not full history.

### 11.3 Provider Abstraction
```ts
interface AIProvider {
  scoreSignal(input): Promise<{ score: number; rationale: string }>;
  recommend(input): Promise<Recommendation>;
}
```
Config decides routing (GPT-5 → scoring, Claude → recommend), with cross-fallback on error/timeout. All calls are wrapped with retries, timeouts, and cost logging.

### 11.4 Cost & Caching
- Cache recommendations keyed by signal id (immutable once generated).
- Batch where possible; rate-limit AI calls inside the worker via BullMQ limiter.
- Track per-org AI spend for future billing/limits.

---

## 12. Re-Engagement Engine

### 12.1 Trigger
Evaluated for companies with `status ∈ {REACHED_OUT, CUSTOMER}` whenever a `LEADERSHIP_CHANGE` or relevant `HIRING` signal is detected, plus a weekly sweep.

### 12.2 Qualifying Events
- **New hire** in a buyer-relevant role (matched against ICP titles).
- **Promotion** (title change for an existing contact → "champion got promoted").
- **Executive change** (new CXO/VP → new decision-maker, reset of prior "no").

### 12.3 Output
A `ReEngagementAlert` with `reason`, `detail`, and a `score`, surfaced on the Re-Engagement page. AI adds a tailored re-engagement narrative ("Your old champion left; the new VP Eng came from a customer of yours — re-open with...").

### 12.4 Why It's Separate From the Feed
The Intent Feed is "find new accounts"; Re-Engagement is "revisit known accounts." Different mental model, different prioritization (prior relationship context matters), so it gets its own surface and its own alert entity.

---

## 13. Queue & Job Architecture

### 13.1 Queues
| Queue | Producer | Consumer | Concurrency | Notes |
|---|---|---|---|---|
| `scan` | cron fan-out, upload | `scanCompany` | high, rate-limited per source | dedupe by daily jobId |
| `diff` | `scanCompany` | `diffSnapshot` | medium | only when snapshot changed |
| `ai` | `diffSnapshot` | `scoreSignal` + recommend | low, rate-limited | cost-controlled |
| `reengage` | `diffSnapshot`, weekly | `reEngage` | medium | status-gated |

### 13.2 Reliability
- Exponential backoff retries (3–5 attempts), dead-letter handling, failed-job inspection.
- Idempotent workers (safe to retry).
- Graceful shutdown drains in-flight jobs.
- `JobStatus` optionally persisted for an admin "scan health" view.

### 13.3 Scaling
- Horizontal: run N worker replicas; BullMQ distributes.
- Per-source rate limiting via BullMQ `limiter` to respect external API quotas.
- Daily fan-out spread over a window (jitter) to smooth load.

---

## 14. UI Architecture & Design System

### 14.1 Design Language
Target the polish of **Linear / Attio / Clay / Common Room**:
- Dense but breathable; keyboard-friendly; fast.
- Neutral base palette + a single accent; subtle borders over heavy shadows.
- Generous use of tables, command palette (⌘K), inline status badges, slide-over panels for detail.
- Dark mode first-class (CSS variables via Tailwind + shadcn theming).

### 14.2 Component Layers
1. **Primitives** — shadcn/ui (`Button`, `Dialog`, `Table`, `Badge`, `Tabs`, `DropdownMenu`, `Sheet`, `Command`).
2. **Composites** — `DataTable` (sortable/filterable/paginated), `PageHeader`, `EmptyState`, `StatBlock`, `FilterBar`.
3. **Domain** — `CompanyTable`, `SignalCard`, `IntentScoreBadge`, `OutreachKanban`, `WatchlistChip`, `ReEngagementCard`, `RecommendationPanel`.

### 14.3 App Shell
- Persistent left **Sidebar** (nav: the 8 pages), top **Topbar** (org switcher via Clerk, search/⌘K, user menu).
- Content area renders RSC pages; mutations via Server Actions or fetch to API.
- **Slide-over detail panels** (shadcn `Sheet`) for company/signal/contact detail without losing list context — an Attio/Linear hallmark.

### 14.4 Data Fetching
- Lists rendered server-side (RSC) for first paint; client interactivity (filters, optimistic status updates) via lightweight client components + `useOptimistic`.
- Cursor pagination + infinite scroll on the Intent Feed.

### 14.5 State & Forms
- Server Actions + `react-hook-form` + Zod resolver for forms.
- Toasts (`sonner`) for feedback; skeleton loaders for streaming.

---

## 15. Page-by-Page Spec

| Page | Purpose | Key Components |
|---|---|---|
| **Dashboard** | At-a-glance: today's top signals, counts by status, re-engagement alerts, recent activity | StatBlocks, top SignalCards, mini charts |
| **Companies** | Master account table; filter by status/watchlist/search; row → slide-over detail; CSV upload entry | CompanyTable, StatusBadge, UploadDialog, CompanyDetailSheet |
| **Watchlists** | Manage lists; default list auto-populated; add/remove companies; per-list signal view | WatchlistGrid, WatchlistDetail, AddCompaniesDialog |
| **Intent Feed** | LinkedIn-style chronological feed of signals, newest first; filters (type, min score, watchlist, date) | SignalCard (Company, Type, Summary, Date, IntentScoreBadge), FeedFilters, infinite scroll |
| **Contacts** | People directory across accounts; link to companies; seniority/title | ContactTable, ContactSheet |
| **CRM** | Outreach pipeline; track status (Not Reached → Reached → Replied → Meeting Booked); per-company history | OutreachKanban / StatusSelect, OutreachTimeline |
| **Re-Engagement** | Alerts for contacted/customer accounts with qualifying changes; resolve/act | ReEngagementCard, ResolveAction, RecommendationPanel |
| **Settings** | Org profile, members/roles, ICP definition (titles/industries/regions used in scoring), data sources/API keys, scan schedule | SettingsTabs, MemberTable, ICPForm |

### 15.1 SignalCard (the centerpiece)
```
┌──────────────────────────────────────────────────────────┐
│ [logo] Acme Corp · acme.com            FUNDING   ◷ 2h ago │
│ ───────────────────────────────────────────  Intent 88 ● │
│ Raised $40M Series B led by Sequoia.                       │
│                                                            │
│ ▸ Why it matters: New budget + GTM expansion incoming.     │
│ ▸ Reach out to: Jane Doe (VP Sales) · John Lee (Head RevOps)│
│ ▸ Angle: "Congrats on the raise — teams scaling GTM..."    │
│ [ Log Outreach ]  [ View Company ]  [ Add Contact ]        │
└──────────────────────────────────────────────────────────┘
```

---

## 16. Security, Compliance & Rate Limiting

- **Tenant isolation** enforced server-side on every query (Prisma extension injecting `orgId`); never trust client-supplied org/ids. Optional Supabase RLS as second layer.
- **Auth** via Clerk middleware on all `(dashboard)` and `/api` routes except webhooks (verified by signature) and the cron endpoint (verified by a secret bearer token / Vercel Cron signature).
- **Input validation** with Zod everywhere; output never leaks ORM internals.
- **Secrets** in env (Vercel + worker host); separate keys for OpenAI/Claude/sources; no secrets in client bundle.
- **Rate limiting** on public-ish API routes (Upstash ratelimit) and on external/AI calls (BullMQ limiter).
- **PII handling**: contact emails are PII — encrypt-at-rest (Supabase) and gate export by role; honor deletion requests (cascade deletes).
- **Audit**: Upload audit rows; consider an `AuditLog` later for status changes.

---

## 17. Observability

- **Logging**: structured logs (pino) in worker; request logging in API.
- **Errors**: Sentry on both web and worker.
- **Queue health**: BullMQ board (protected) or a custom admin "Scan Health" view from `JobStatus`.
- **Metrics**: signals/day, scan success rate, AI latency & cost per org, feed engagement.
- **Tracing**: optional OpenTelemetry across enqueue → worker → AI.

---

## 18. Implementation Plan (Phased)

### Phase 0 — Foundation (Week 1)
- Monorepo (pnpm + Turborepo), shared `packages/db`, `packages/types`.
- Next.js 15 app scaffold, Tailwind + shadcn, base layout/shell, dark mode.
- Clerk auth + org middleware; Clerk webhook → `Org`/`User` sync.
- Supabase Postgres; Prisma schema + first migration; tenant Prisma extension.

### Phase 1 — Company Database & Watchlists (Week 2)
- CSV upload (parse, validate, dedupe, bulk insert, audit).
- Companies page (DataTable, filters, status, detail sheet).
- Default watchlist auto-population; Watchlists CRUD + membership.

### Phase 2 — Monitoring Pipeline (Weeks 3–4)
- Worker service scaffold (Railway/Fly), BullMQ queues + Redis (Upstash).
- `SourceAdapter` interface + first real adapters (start with funding/news/hiring).
- `scanCompany` → Snapshot + hash; `diffSnapshot` → Signals (rules-based).
- Daily repeatable job + manual trigger; idempotency + dedupe.

### Phase 3 — Intent Feed & Scoring (Week 5)
- Rule-based intent scoring.
- Intent Feed page (SignalCard, filters, infinite scroll).
- Dashboard summary tiles.

### Phase 4 — AI Layer (Week 6)
- `AIProvider` abstraction; GPT-5 scoring + Claude recommendations.
- Versioned prompts; Recommendation persisted + rendered in SignalCard.
- Blended score (rules + AI); cost logging + caching.

### Phase 5 — CRM & Contacts (Week 7)
- Contacts CRUD + directory.
- Outreach logging + status pipeline (Kanban/timeline); per-company history.

### Phase 6 — Re-Engagement (Week 8)
- `reEngage` worker; ReEngagementAlert generation on leadership/hiring signals.
- Re-Engagement page + AI re-engagement narrative.

### Phase 7 — Settings, Hardening, Launch (Weeks 9–10)
- ICP config feeding scoring; members/roles; data-source keys; scan schedule.
- Rate limiting, Sentry, queue health view, RLS pass, perf/index review.
- E2E tests (Playwright), seed/demo data, docs, deploy (Vercel + worker host).

### Cross-cutting
- Tests: unit (services, diffing, scoring), integration (API + Prisma), E2E (Playwright).
- CI: typecheck, lint, test, Prisma migrate check on every PR.

---

## 19. Open Questions & Assumptions

**Assumptions made:**
1. **Worker tier off Vercel.** Long-running BullMQ workers run on Railway/Fly/Render, not Vercel functions (their timeout makes them unsuitable). This is the recommended architecture.
2. **Monorepo** (pnpm + Turborepo) so web + worker share Prisma/types.
3. External data sources are pluggable adapters — the spec is source-agnostic. Specific vendors (funding API, jobs API, LinkedIn data) are TBD and may have ToS/legality constraints.
4. Org-scoped multi-tenancy via Clerk Organizations (team product, not single-user).

**Questions to resolve before build:**
- Which **external data providers** for funding/hiring/leadership? (Cost, ToS, coverage drive the adapter design and legality of LinkedIn scraping.)
- Is **outbound email sending** in scope (Resend integration) or only logging outreach done elsewhere?
- **Billing/plan limits** (companies monitored, AI spend) — in v1 or later?
- **Scan frequency** — fixed 24h, or per-plan / per-watchlist configurable?
- Real-time push (websockets) for the feed, or is daily-cadence polling acceptable for v1?

---

*End of specification. No application code has been generated yet — this document defines the architecture, data model, and plan. Next step on approval: scaffold Phase 0.*
```
