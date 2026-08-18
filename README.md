# Sign Shop ERP/CRM

A web-based ERP/CRM for a sign-making shop — banners, vehicle wraps, channel
letters, monument signs, ADA signage, decals and trade show graphics. It covers
the whole lifecycle: **lead → quote → order → production → install → invoice**,
plus the customer record, the shop schedule and the material inventory behind it.

## Quick start

### GitHub Codespaces (runs in a browser — nothing to install)

Open the repository on GitHub → **Code ▾ → Codespaces → Create codespace**.
The devcontainer builds Node and Postgres, installs dependencies, applies the
schema and loads the demo data on its own. When it finishes:

```bash
npm run dev
```

Click the forwarded **port 5173** to open the app. Useful when Docker cannot be
installed locally.

### Docker (nothing installed but Docker)

```bash
docker compose up --build                        # db + API + web

# In a second terminal, load the demo shop (optional but recommended):
docker compose exec server node dist/prisma/seed.js
```

The runtime image ships compiled JavaScript only, so seed the compiled script
rather than `prisma db seed` (which would look for the TypeScript sources).

The app is at **http://localhost:8080**, the API at **http://localhost:4000/api**.

### Local development

```bash
npm install                        # installs both workspaces

# 1. Point the server at a Postgres instance
cp server/.env.example server/.env # then edit DATABASE_URL

# 2. Create the schema and load demo data
npm run db:migrate
npm run db:seed

# 3. Run the API (:4000) and the web app (:5173)
npm run dev
```

Vite proxies `/api` to the server, so the browser only ever talks to one origin.

### Demo accounts

The seed creates a shop mid-flight — 10 customers, 12 opportunities across the
pipeline, 8 quotes, 10 jobs at every production stage, 18 materials, purchase
orders, invoices and payments. Every account uses the password `password123`:

| Email | Role | What they see |
| --- | --- | --- |
| `admin@inkzsigns.test` | Admin | Everything, including user management |
| `owner@inkzsigns.test` | Manager | All modules and reporting |
| `sales@inkzsigns.test` | Sales rep | CRM, quoting, jobs, invoicing |
| `shop@inkzsigns.test` | Production | Job board and inventory — **no pricing** |
| `install@inkzsigns.test` | Install crew | Today's installs, mobile-first |

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, TanStack Query, React Router |
| Backend | Node 22 + TypeScript, Fastify 5, Zod validation |
| Database | PostgreSQL 16 via Prisma |
| Auth | JWT bearer tokens, bcrypt hashes, role-based access control |
| Files | Local disk behind a driver interface (S3 driver stubbed) |
| Deploy | Docker Compose (Postgres + API + nginx-served SPA) |

## Modules

### CRM
Companies and contacts (many contacts per company, tags, notes), a **lead
pipeline** as a drag-and-drop kanban (New → Contacted → Quoted → Won/Lost), a
manually-logged communication history (calls, emails, meetings, site visits) and
follow-up tasks assigned to reps. Each customer has a merged **timeline** that
folds activities, quotes, jobs, invoices and tasks into one feed.

### Quoting and estimating
A line-item quote builder where each line carries sign type, dimensions,
material, quantity, finishing options and whether install is required. The
[pricing engine](server/src/modules/quotes/pricing.ts) is a pure module — no
database, no clock — so the shop's rules are testable in isolation:

```
area          = width × height ÷ 144 × quantity
material sell = area × price/sq ft            (snapshotted from the catalog)
finishing     = laminate + mounting + contour cut + grommets + hems
markup        = (material + finishing + labor) × markup %
line total    = max(material + finishing + labor + markup + install, minimum charge)
```

Quote level: `subtotal → discount → rush fee → tax → total`, applied in that
order. Every amount is a `Prisma.Decimal`, so cent rounding never drifts across
a hundred lines.

Quotes support **versioning** (a new version clones the lines and supersedes the
old one), acceptance with a recorded signature, and **one-click conversion to a
job** that copies the line items and snapshots the contract value.

### Jobs and orders
Accepting a quote opens a job with its own number (`J-2026-0001`) and a
customizable stage pipeline:

> Design/Proof → Client Approval → Materials Ordered → Production → Finishing →
> QC → Ready → Installed → Invoiced → Closed, plus On Hold and Cancelled

Transitions are enforced: a job moves **one stage forward** at a time, can be
sent **back to any earlier stage** for rework, and can be held from anywhere.
Every move writes a status event and an audit row with who and when. Each job
carries artwork files, versioned proofs with client approval status and
timestamps, internal comments, and a per-stage checklist.

### Production scheduling
A shop board with resources (printers, router, laminator, bench) down the side
and days across the top. Entries drag between machines and days; a cell turns
amber when the day exceeds that machine's daily capacity. Install scheduling
assigns a crew, address and time window, and the install list groups by day so a
crew can read its route.

### Inventory and materials
Material catalog with SKU, unit of measure, cost, sell price per square foot,
sheet geometry and vendor. Stock moves only through **movements** (receipt,
usage, adjustment, waste, return), so the ledger always explains the balance. A
job can deduct material automatically from its line items — square footage
converts into sheets using the material's geometry. Low-stock items are flagged
against their reorder point and can generate draft purchase orders per vendor in
one click; receiving a PO increments stock and updates standard cost.

### Invoicing and payments
Generate an invoice from a job as a full bill, a deposit (shop default
percentage), a milestone (any percentage or amount) or a final invoice that bills
the contract less whatever is already invoiced. Partial payments roll the status
DRAFT → SENT → PARTIAL → PAID, and paying the last invoice on a job closes it.
Tax is a flat configurable rate with a per-customer override and a tax-exempt
flag.

### Reporting
Pipeline value and win rate with lost-reason analysis; a **bottleneck view**
showing where open jobs are piling up and how long they have sat; revenue by
month, sign type and customer; **margin per job** comparing contract value to
material actually consumed against what was quoted; and aged receivables
bucketed current / 1–30 / 31–60 / 60+.

## Roles

| Permission area | Admin | Manager | Sales | Production | Install |
| --- | :-: | :-: | :-: | :-: | :-: |
| CRM | ✅ | ✅ | ✅ | read | — |
| Quoting | ✅ | ✅ | ✅ | — | — |
| Jobs / stage moves | ✅ | ✅ | ✅ | ✅ | read |
| Production schedule | ✅ | ✅ | read | ✅ | read |
| Installs | ✅ | ✅ | ✅ | read | ✅ |
| Inventory | ✅ | ✅ | read | ✅ | — |
| Invoicing | ✅ | ✅ | ✅ | — | — |
| Reports | ✅ | ✅ | ✅ | — | — |
| **Pricing visible** | ✅ | ✅ | ✅ | **no** | **no** |
| User management | ✅ | — | — | — | — |

Pricing is not merely hidden in the UI — `stripPricing` removes money fields
from the API response itself, so a shop-floor token never receives them.

## Non-functional

- **Mobile-responsive throughout**, and specifically designed for the phone on
  the install screens: tap-to-call the site contact, a maps link, camera capture
  for completion photos and full-width action buttons.
- **Audit trail** on every job status change and on creates/updates across
  customers, quotes, jobs, materials, POs and invoices. Admins read it in
  Settings.
- **File uploads** accept AI, PDF, EPS, SVG, PSD, CDR, PNG, JPG and more.
  Images preview inline; other formats show a format badge.
- **Global search** (⌘K) across customers, contacts, job numbers, quotes,
  invoices and materials, scoped to what your role may read.

## Testing

```bash
npm test           # 49 tests
```

- **Unit** — the pricing engine: area, markup, minimum charge, finishing rules,
  install billed outside markup, discount/rush/tax ordering, and a
  hundred-line rounding-drift check.
- **Unit** — RBAC: the permission matrix, and that `stripPricing` removes money
  while leaving `Decimal`/`Date` instances intact.
- **Integration** — real HTTP against a real Postgres: quote pricing and
  acceptance, quote versioning, quote → job conversion, stage transition rules,
  proof send/approve driving the pipeline, deposit + final invoice arithmetic,
  partial payments, stock deduction, PO receiving, kanban moves, overbooking
  detection, install completion and the reporting endpoints.

Integration tests need a database; point `TEST_DATABASE_URL` at one (it defaults
to `postgresql://postgres@127.0.0.1:5432/signshop_test`) and run
`DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy` once.

## Layout

```
server/
  prisma/schema.prisma     28 models across every module
  prisma/seed.ts           a shop already mid-flight
  src/lib/                 auth, rbac, money, numbering, audit, storage
  src/modules/             auth crm quotes jobs production inventory
                           invoicing reporting files search settings
  test/                    pricing, rbac, API flows
web/
  src/lib/                 api client, auth context, formatters, types
  src/components/          layout, modal, global search, UI primitives
  src/pages/               one folder per module
```

Modules are decoupled: each owns its routes and its service logic, and they meet
only through the shared libs and a handful of deliberate seams (accepting a
quote calls into the jobs service; completing an install advances the job).

## Not built — and deliberately so

Stripe, QuickBooks and e-signature providers are **stubbed with clear TODOs**
rather than half-integrated. See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for
exactly where each hook lives and what wiring one up involves.
