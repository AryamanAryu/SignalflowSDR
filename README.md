# SignalFlow

Internal revenue intelligence platform for the SDR team.

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase PostgreSQL via Prisma
- **Auth:** Clerk
- Single application · single organization · no queue/worker tier

## Getting started

See the step-by-step setup in the conversation, or in short:

```bash
npm install                       # install dependencies
cp .env.example .env              # then fill in your real keys
npx prisma migrate dev --name init  # create the database tables
npm run dev                       # start the app at http://localhost:3000
```

## Project layout

```
src/
  app/
    (auth)/        sign-in & sign-up (Clerk)
    (dashboard)/   the app shell + pages (Dashboard, Companies, CRM, ...)
    layout.tsx     root layout (Clerk + theme providers)
  components/
    ui/            shadcn/ui primitives (button, card, badge)
    layout/        sidebar, topbar, nav config
    shared/        page header, empty state
  lib/
    db.ts          Prisma client
    auth.ts        Clerk → local user sync
    utils.ts       cn() helper
prisma/
  schema.prisma    Phase 1 data models
```

## Status

Phase 0 (foundation) complete. Phase 1 (Company DB, Sheets sync, Apollo, CRM) next.
# Signalflow
