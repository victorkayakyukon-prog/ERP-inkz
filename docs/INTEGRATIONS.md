# Integration points

Third-party services are stubbed rather than half-built, as agreed in the spec.
Each one below names the exact seam, what it does today, and what wiring it up
actually involves. Nothing here is a hidden dependency — the app runs fully
without any of it.

---

## Stripe (card payments)

**Today:** payments are recorded manually with a method (`CASH`, `CHECK`,
`CARD`, `ACH`, `OTHER`) and a free-text reference. `Payment.stripePaymentIntentId`
and `Invoice.stripeInvoiceId` exist on the model and stay null.

**Seams:**
- `server/src/modules/invoicing/routes.ts` → `POST /invoices/:id/send` — the
  place to create a Stripe invoice or payment link and store its id.
- `POST /invoices/:id/payments` — already the single funnel that recalculates
  the balance and closes the job when the last invoice is paid.

**To wire it up:**
1. Add `stripe` and a `STRIPE_SECRET_KEY` env var.
2. On send, create a PaymentIntent or hosted Invoice for `invoice.balance`,
   store the id, and include the hosted URL in the customer's email.
3. Add `POST /api/webhooks/stripe` verifying the signature with
   `STRIPE_WEBHOOK_SECRET`. On `payment_intent.succeeded`, call the same code
   path `POST /invoices/:id/payments` uses — do not duplicate the balance math.
4. Make the webhook idempotent on `stripePaymentIntentId`; Stripe retries.

**Watch out for:** a webhook can beat the API response that created the record,
so look the invoice up by the stored Stripe id rather than assuming it exists.

---

## QuickBooks (accounting sync)

**Today:** `Invoice.quickbooksInvoiceId` exists and stays null. Invoices,
payments and customers are complete enough to push.

**Seams:** invoice creation and `POST /invoices/:id/send`; customers in
`server/src/modules/crm/routes.ts`.

**To wire it up:**
1. OAuth2 against the QuickBooks Online API; store the realm id and refresh
   token (a `Setting` column or a small `Integration` table).
2. Map `Company` → Customer, `Invoice` → Invoice, `Payment` → Payment, and
   `Material` → Item if you want inventory to sync too.
3. Push on send rather than on create, so drafts stay internal.
4. Sync is one-way to start (this system is the source of truth). Two-way means
   reconciling edits on both sides and needs a conflict rule first.

**Watch out for:** QuickBooks requires a customer to exist before its invoice,
and tax handling differs by region — map the flat rate onto a QuickBooks TaxCode
rather than sending a raw percentage.

---

## E-signature (DocuSign / Dropbox Sign)

**Today:** `POST /quotes/:id/accept` records a **typed name** plus the client IP
and timestamp (`Quote.signedName`, `Quote.signedIp`, `Quote.decidedAt`). That is
an honest internal record of who approved a quote — it is *not* a legally
binding e-signature, and the UI says so.

**Seams:** `server/src/modules/quotes/routes.ts` → `/send` and `/accept`.

**To wire it up:**
1. On send, render the quote as a PDF and create an envelope; store the envelope
   id on the quote (add a column).
2. Add a webhook for envelope completion that calls the existing accept path so
   job creation, opportunity closing and the audit entry all still happen in one
   transaction.
3. Keep the manual accept route — shops take verbal and in-person approvals, and
   removing it would make the system harder to use, not safer.

---

## Email delivery

**Today:** `/quotes/:id/send`, `/invoices/:id/send` and
`/purchase-orders/:id/send` change status and stamp a timestamp. They do not
send anything; each carries a `TODO`.

**To wire it up:** add a provider (SES, Postmark, Resend) behind a small
`server/src/lib/mailer.ts` interface mirroring `storage.ts`, then call it from
those three routes. Templates need the shop identity from `Setting` and a PDF
render of the document.

**Also needed:** PDF rendering. There is no PDF generator in the codebase; the
quote and invoice screens are the current "document". A server-side renderer
(Puppeteer or a PDF library) is the missing piece for both email and e-signature.

---

## S3-compatible file storage

**Today:** `server/src/lib/storage.ts` defines a `StorageDriver` interface with
`save`, `localPath` and `remove`. `LocalStorage` is complete and used by default.
`S3Storage` exists and throws a clear error — set `STORAGE_DRIVER=local` unless
you have implemented it.

**To wire it up:** add `@aws-sdk/client-s3`, implement the three methods, and
return a presigned URL from the file-content route instead of streaming from
disk. Nothing else in the codebase touches the filesystem, so this is genuinely
the only file to change.

---

## Tax by jurisdiction

**Today:** one flat rate in `Setting.defaultTaxRatePct`, with a per-customer
override (`Company.taxRatePct`) and a `Company.taxExempt` flag. Quotes and
invoices snapshot the rate at creation, so a later rate change never rewrites
history.

**To do it properly:** destination-based sales tax needs a rate table keyed by
jurisdiction (or an Avalara/TaxJar call) resolved from the **install or ship-to
address**, not the billing address — which matters for a sign shop, because the
sign goes up somewhere the customer may not be headquartered. The snapshot
columns already in place are what makes that upgrade safe.

---

## Single sign-on

**Today:** email and password with bcrypt, JWT bearer tokens, 12-hour expiry.

**To wire it up:** add an OIDC flow (`openid-client`) issuing the same JWT
payload, so `authenticate` and the permission guards need no changes. Map the
provider's groups onto the five roles in `server/src/lib/rbac.ts`. Keep local
passwords for the shop floor — install crews and shop staff often do not have
corporate identities.

---

## Notifications

**Not built.** Follow-up reminders (`Task.dueAt`) and proof-approval waits are
the obvious triggers. This needs a scheduler (a cron container or pg-boss) plus
the email seam above; there is no polling loop in the app today.
