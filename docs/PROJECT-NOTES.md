# RexBid – project notes

A running record of changes, business rules and open work, so anyone working on
the site (owner, developer, or Claude in a new session) can pick up where things
were left. **This repository is public: never put passwords, API keys, personal
data or private business details in this file.**

_Last updated: 11 November 2026_

---

## 1. How the system fits together

| Part | Where | Notes |
|---|---|---|
| Website (React + Vite) | `frontend/` → Render static site → `rexbid.ie` | Client-rendered single-page app. |
| Backend API (Express + MongoDB) | `backend/` → Render web service → `rexbid-backend.onrender.com` | Also serves `/sitemap.xml` and `/share/*` (see below). |
| Images | `media.rexbid.ie` (Cloudflare R2) | |
| DNS, CDN, security | Cloudflare | |
| Payments | Stripe (card, under €1,000); bank transfer from €1,000 | |
| Email | Google Workspace, `admin@rexbid.ie` | Backend sends via `smtp.gmail.com` (Render env: `SMTP_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` = Google app password). |

### Render rewrite rules on the rexbid.ie static site (order matters)
| # | Source | Destination | Action |
|---|---|---|---|
| 1 | `/auction/*` | `https://rexbid-backend.onrender.com/share/auction/*` | Rewrite |
| 2 | `/catalogue/*` | `https://rexbid-backend.onrender.com/share/catalogue/*` | Rewrite |
| 3 | `/*` | `/index.html` | **Rewrite** (not Redirect) |

Rule 3 is what makes every page work. Never edit it into something else, and never set it to Redirect (this caused a ~10-minute outage on 9 Nov). Deleting rules 1 and 2 safely turns off server-side link previews.

### Email DNS (Cloudflare)
MX → `smtp.google.com` · SPF includes `_spf.google.com` (and `spf.reg365.net`, which can be removed once Register365 is fully retired) · DKIM `google._domainkey` (authenticating in Google Admin) · DMARC `_dmarc`: `v=DMARC1; p=none; rua=mailto:admin@rexbid.ie`.

---

## 2. Business rules (source of truth)

| Rule | Value | Where in code |
|---|---|---|
| Buyer fee | 6% on first €2,000, 3% above, **max €500** per item | Admin commission settings; wording in `frontend/src/utils/fees.js` |
| Seller fee | None on sales before **1 January 2027** (30 days' notice before any fee) | `fees.js` |
| Featured listing | **€30 / £24**, paid by card when listing, no VAT | Stated in policy. **Card payment at listing not yet built.** |
| Facebook & Instagram ad | **€10 / €20 / €40** (£8 / £16 / £32 at a fixed £8 = €10), paid by card when listing, no VAT (RexBid not VAT registered) | Choice saved as `metaBoostPackage` on the auction. **Card payment at listing not yet built.** Hidden within 48h of sale close. |
| Minimum reserve | **€500** (sterling equivalent for £ listings) | `backend/src/utils/listingRules.js`, `frontend/src/utils/listingRules.js` |
| Minimum no-reserve starting bid | **€400** (sterling equivalent) | same |
| Payment | Card under €1,000; bank transfer from €1,000; within 48 hours | `backend/src/utils/manualPayment.js` (threshold) |
| VAT on items | Only when the listing is "VAT Applicable". ROI 23%, NI 20%, on the item price only (never on the buyer fee: RexBid is not VAT registered). Cross-border or unclear-location sales are held for admin review; admin can zero-rate with a note. | `backend/src/utils/vat.js`, `backend/src/utils/region.js` |
| Collection | Within 3 working days of payment confirmation; storage fines after that | Policy, Buyer Agreement, FAQs, receipt |
| Seller payout | 0–3 working days after collection | Policy |
| Not as described | Report within 24 hours of collection/delivery | Policy |
| VAT on items | Set per listing by the seller | Listing field `vatIncluded` |
| Company | REXBID Limited, Corfeehone, Co. Cavan · CRO 819231 | Policy page |

If a fee or rule changes, update `fees.js` / `listingRules.js` **and** the admin commission settings **and** the legal pages listed in section 4.

---

## 3. Changes made (November 2026)

| PR | What | Status |
|---|---|---|
| #2 | Public API stopped returning reserve prices, rival proxy-bid maximums, offers, payment data and seller email/phone (`utils/publicAuction.js`) | Live |
| #3 | SEO step 1: per-page titles/descriptions/canonicals, Product & Organization schema, `robots.txt`, `/sitemap.xml`, not-found page, `/terms-of-use` redirect | Live |
| #4 | SEO step 2: server-rendered link previews for listings/catalogues via `/share/*` + Render rewrites | Live |
| #5 | `/index.html` → homepage redirect (safety after the 301 incident) | Open: merge when convenient |
| #6 | New Payment, Fees & Refund Policy; fee wording on FAQ, Sell, listing, agreements, footer; €500/€400 minimums enforced | Live |
| #7 | Share-page template cache 5 min → 30 s, so listing pages pick up new deploys quickly | Live |

Email (9 Nov, outside the code): sending moved from Register365 to Google; DKIM enabled; DMARC added. Outlook/Hotmail had been rejecting RexBid email ("lacks SPF/DKIM/DMARC").

Backend tests: `cd backend && npm test` (node:test).

The backend needs **Node 20.9 or newer** (`engines` in `backend/package.json`; required by nodemailer 10). Security audit 11 Nov 2026: backend 0 known vulnerabilities; frontend 4 low/moderate left (build-time `@tailwindcss/typography`, and `quill` in the listing editor) where npm's only suggested fix is a downgrade.

---

## 3a. After-sale process (sale records)

Every lot sold on or after `SALES_TRACKING_START` (default 10 Nov 2026) gets a **Sale** record (`backend/src/models/sale.model.js`) within 15 minutes (Agenda job `sync sales`, also run when the admin Sales page loads). It snapshots buyer, seller, price, buyer fee, VAT and total.

Stages: `sold` → `request_sent` → `paid` → `collected` → `payout_due` → `paid_out`.

- **Admin → Sales** (`/admin/sales`): tick sales, press *Send payment requests*. For each one the site creates a Stripe bank-transfer PaymentIntent (`customer_balance`, EU IBAN from Stripe Ireland; GB sort code for £ sales), so the buyer gets their own IBAN; renders the PDF; emails it; and saves it under the buyer's **Documents** (`/bidder/documents`).
- PDFs are not stored as files. Each document keeps a snapshot of what was printed and is re-rendered on download, behind login.
- When Stripe reports the payment (`payment_intent.succeeded` webhook), the sale and the auction are marked paid.
- Stripe webhook: `POST /api/v1/payments/webhook`, registered in `server.js` before the JSON parser. Needs `STRIPE_WEBHOOK_SECRET` on Render.

- **Receipts and seller statements** (Paid tab, tick and send): the buyer receipt shows the seller's name and phone, the collect-by date (3 working days after payment, weekends skipped, public holidays not; `COLLECTION_WORKING_DAYS`) and the storage-fines warning. The seller statement shows price + VAT collected − seller commission = amount due, and the seller's payout account (masked). The seller fee is read from the auction (`sellerCommissionAmount`, set from Admin → Commissions when the lot sold), so seller fees appear automatically once they are switched on.
- Every payment request, receipt and statement is BCC'd to `EMAIL_USER` (change with `PAYMENT_REQUEST_BCC`, or `none`).
- **Failed sales**: the red cross on an unpaid sale asks for a reason, cancels any open Stripe request and sets the auction's payment status to failed. *Reopen* puts it back in Ready to send.
- **Earlier sales**: *Import earlier sales* records lots sold before `SALES_TRACKING_START` with `historical: true`; status from the auction's payment status and any completed Payout. No emails, no Stripe calls. They live in the *Earlier sales* tab.
- Documents pages: `/bidder/documents`, `/seller/documents`, `/company/documents`.

- **Receipts are sent automatically** when a sale is paid (Stripe bank transfer, card checkout, or admin marking it paid). For any auction with a sale record, the old generic "Payment Confirmed" buyer email is skipped so the buyer gets one email.
- **Seller payouts use Stripe Connect Express accounts** (`user.stripeConnect`). Existing accounts made in the Stripe Dashboard are matched to sellers by email. Sellers set up or finish their account from Payout Methods (`/api/v1/stripe-connect/onboarding-link`); the "Item sold" email includes a setup button when the seller isn't ready, and admins can send a setup link from the Sales page. Status is refreshed at most hourly for sellers with open sales.

- **Emails per sale.** Buyer: auction won → payment request → receipt (automatic on payment) → reminders only if needed. Seller: item sold (+ payout setup if needed) → "buyer has paid" with statement and buyer contact (automatic on payment) → "you've been paid" with updated statement. The old generic "Payment Received"/"Payment Confirmed" emails are skipped for sales with a sale record.
- **Collection.** Buyer and seller each confirm on their Documents page; both → *Payout due*. Admin can *Release payout early* with a note.
- **Payouts.** *Payout due* tab → tick → *Pay sellers*: Stripe transfer of price + VAT − seller fee to the seller's Connect account (linked to the buyer's charge when possible, otherwise checked against available balance), recorded on the sale and as a `Payout` (method `stripeConnect`), then the "you've been paid" email. The old admin Payouts page is not used for these.
- **Manual payouts** (bank icon on a *Payout due* sale): for high-value sales paid from RexBid's own bank (BOI) to avoid Stripe fees. Shows the seller's saved bank details (Payout Methods) with copy buttons; admin enters amount (defaults to the amount due; a different amount needs a note), date and bank reference. Records the payout (`method: bank_transfer`, Payout record `manual-<saleId>`), makes no Stripe transfer, and emails the seller their statement.
- **Matching past payouts.** *Match past Stripe payouts* marks paid sales as paid out where a Dashboard transfer to that seller's account has exactly the seller's amount on or after the sale date. No emails.
- **Reminders** (`send sale reminders`, every 30 min, 08:00–20:00 Irish time, each once): payment due in 24h, payment overdue (+ office alert), collection due in 24h, collection overdue (+ office alert). Office alerts go to `ADMIN_ALERT_EMAIL` or `EMAIL_USER`.

Still to build: sales ledger export matching the finance tracker.


---

## 3b. Seller contact, Questions & Answers, public names (Nov 2026)

**Seller contact.** Each listing has a contact mode (`backend/src/utils/contactPolicy.js`), sent to the browser as `auction.contactMode`:
- `phone`: reserve lots whose reserve is at or above the Render setting `PHONE_CONTACT_MIN_RESERVE_EUR` (sterling lots use the equivalent). Signed-in users can reveal the seller's phone in the *Sold By* card, as before.
- `questions`: every other lot. No phone number is sent; the *Sold By* card says questions are answered on the listing and links to the Q&A tab.
- The threshold is a private business setting: it is **not** in this repository and never shown on the site. If the setting is missing, no lot shows a phone number. `SELLER_PHONE_CONTACT=off` turns phone numbers off everywhere.
- The phone is returned by `GET /api/v1/users/:id/seller-stats?auctionId=…` only for a `phone` lot and a signed-in viewer.
- Note: because the phone only appears on higher-reserve lots, its presence hints that the reserve is high.

**Questions & Answers** (listing tab "Questions", `frontend/src/components/QuestionsSection.jsx`, API `/api/v1/questions`, `backend/src/controllers/question.controller.js`):
- Buyers ask (signed in, lot upcoming or live, max 600 characters, 5 per lot per day). Only the seller or RexBid staff can answer. Everything is public on the listing.
- Phone numbers, emails, messaging apps and "deal privately" wording are blocked in questions, answers and old-style comments (`backend/src/utils/contactFilter.js`).
- Stored in the existing `Comment` collection (question = top-level, answer = reply), so Admin → Comments moderation and reporting still work.
- Emails: seller on each new question (always sent); the asker when it's answered (always sent); others who asked on the lot (respects their comment-email preference).
- Fixed at the same time: any signed-in user could delete any comment, and comment HTML was rendered unsanitised. Comments are now plain text.

**Text messages to sellers (Twilio)** – `backend/src/utils/sms.js`. Off until these are set on Render: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (an SMS-capable number that can receive replies), `SMS_INBOUND_URL` (`https://rexbid-backend.onrender.com/api/v1/sms/inbound`, also entered in Twilio as the number's "A message comes in" webhook, HTTP POST). `SMS_ENABLED=false` pauses texts.
- New question → the seller gets a text with the question and a link. Replying to the text posts the answer to the most recent question texted to them (contact-details rule applies; they get a confirmation text).
- Twilio's own STOP/START handling manages opt-outs.

**Public names** (`backend/src/utils/displayName.js`): individuals are shown by first name only; company names in full. Applied to listings, the *Sold By* card, seller reviews page, buyer "My offers", Q&A and SEO data. Receipts, statements and the winner's *Won auctions* page still show full names.

---

## 3c. Buy It Now after the auction (Nov 2026)

When a **reserve** lot ends without meeting its reserve, the seller can offer it at a fixed price for **48 hours** on the public page **`/buy-it-now`** (also in the header menu and sitemap).

Rules (`backend/src/utils/postAuctionBin.js`):
- Price at least **10% below the reserve** and **above the top bid**. If the top bid is already within 10% of the reserve, Buy It Now isn't available (the seller is told to contact RexBid to sell to the top bidder).
- **First buyer to confirm wins** (atomic claim, so two buyers at the same moment can't both buy). Buyer must be signed in, active and verified, and ticks a binding-purchase box. Normal buyer fee.
- One 48-hour window per lot. Sellers can **lower** the price while live but can't withdraw it; staff can take it down (`DELETE /api/v1/buy-it-now/lot/:id/setup`).

How sellers use it (dashboard → All Auctions → lot menu → **Buy It Now (48 hours)**, or the box on their own listing):
- **Before or during the auction:** set a backup price. If the reserve isn't met it starts automatically (re-checked against the final top bid; if it no longer fits, the seller is emailed and can set a new one).
- **After the auction:** start it within **72 hours** of the end. With no backup price, the seller gets an email inviting them to.

When it goes live: emails to the seller, the top bidder (first, always sent), other bidders, watchers and people who asked a question (these respect email preferences). The usual "reserve not met" email to the top two bidders is skipped when the lot went straight onto Buy It Now.

When it sells: the lot becomes `sold` at the Buy It Now price with the winner set, so the normal **Sale record**, payment request, receipts and payout all follow (section 3a), plus the usual won / sold / admin emails.

When it ends unsold: Agenda job `end post-auction buy it now` (scheduled at the end time, plus a 15-minute sweep) marks it expired and emails the seller to relist. If the lot sold another way during the window (e.g. an accepted offer) it's marked cancelled.

Data: `auction.postAuctionBin` (price in the lot's own currency, status `scheduled` / `live` / `processing` / `sold` / `expired` / `cancelled` / `not_started`, start/end times). The public only sees price, status and times for live/sold/expired lots; a backup price is never public (it would hint at the reserve). API: `/api/v1/buy-it-now` (`backend/src/controllers/postAuctionBin.controller.js`, `backend/src/services/postAuctionBinService.js`). Frontend: `frontend/src/pages/BuyItNow.jsx`, `frontend/src/components/buyItNow/`.

Note: a Buy It Now price shows bidders roughly where the reserve was (it is at most 90% of it).

**Homepage:** while any lot is live on Buy It Now, a Buy It Now strip (up to 4 lots, ending soonest first, "See all") is the first thing on the homepage, above the "Closing now" banner (`frontend/src/components/home/HomeBuyItNow.jsx`).

**Admin → Buy It Now** (`/admin/buy-it-now`): lists unsold reserve lots from the last 36 hours / 3 days / 7 days. Tick lots, **Preview email** (the exact email each seller will get), **Send test to me** (first seller's email, to the signed-in admin only), then **Send** (asks to confirm). One email per seller covering all their lots, with a "Set my Buy It Now price" button (their dashboard) and a link to `/buy-it-now`. Sending records `postAuctionBin.invitedAt` and gives the seller a fresh 72 hours from the email (`postAuctionBin.startDeadline`). Already-invited lots are unticked by default.

**Undoing a purchase** (test or accidental): Admin → Buy It Now → *Bought on Buy It Now* → **Undo purchase** (unpaid sales only). It checks Stripe that nothing has been paid and cancels any payment request, removes the sale record (a copy is kept on the lot in `postAuctionBin.undone`, with the reason), puts the lot back to "reserve not met" with its top bid restored, and optionally puts it back on Buy It Now for the time it had left (at least 24 hours) and emails the seller to ignore the "item sold" email.

---

## 3d. Meta (Facebook & Instagram) tracking and ads (Nov 2026)

**Events sent to Meta** (`frontend/src/utils/metaPixel.js`), only after the visitor accepts "Advertisement" cookies (`window.__rexbidMetaConsent`, set in `index.html` from CookieYes):

| Event | When | Type |
|---|---|---|
| `CompleteRegistration` | any new account (`content_category` = user type) | standard |
| `SellerSignUp` | new seller or company account | custom |
| `ListingStart` | seller starts the listing form | custom |
| `Lead` | listing submitted | standard |
| `ViewContent` | listing page viewed | standard |
| `PlaceBid` | bid accepted by the server | custom |

Admin-created listings (`pages/admin/CreateAuction.jsx`) are deliberately not sent.

**Conversions API (server copy).** The browser also posts each event to `POST /api/v1/meta-events` (`backend/src/routes/metaEvent.route.js`), which forwards it to Meta with the signed-in user's hashed email/phone (`backend/src/utils/metaCapi.js`). Meta de-duplicates by the shared event ID. Off until these are set on Render: `META_PIXEL_ID` (`1342628734664826`), `META_CAPI_TOKEN` (Events Manager → the pixel → Settings → Conversions API → Generate access token). Optional `META_TEST_EVENT_CODE` sends events to Events Manager → Test events while checking.

**Advanced matching.** For signed-in visitors who accepted advertising cookies, the Pixel starts with their email, phone, first/last name, country and hashed account ID (`syncMetaUser` in `metaPixel.js`, called from `AuthContext`; `index.html` reads `window.__rexbidMetaUser`). The Conversions API copy also sends hashed first/last name, county, postcode and country from the account. An ad click ID (`fbclid`) is kept in memory for the visit (never stored on the device) and sent as `fbc` once cookies are accepted. Also turn on Events Manager → Pixel → Settings → *Automatic advanced matching*.

After deploying, in Events Manager create Custom Conversions for `PlaceBid` and `SellerSignUp` so campaigns can optimise for them.

**Ad link tags.** Use the same tags on every ad (Meta ad → Tracking → URL parameters):
`utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}`

**JPEG photos for social posts.** `GET https://rexbid-backend.onrender.com/media/jpeg/<folder>/<file>` returns a stored photo as a JPEG (max 1440px wide); add `?fit=instagram` to crop into Instagram's 4:5–1.91:1 range (`backend/src/utils/jpegMedia.js`). Only `auction-photos`, `catalogue-images` and `category-images` are allowed, never ID documents. Listing link previews (`og:image`) now use the JPEG copy. Optional Render setting `PUBLIC_BACKEND_URL` if the backend address changes.

**Seller-paid Meta ads** (`metaBoostPackage`): the seller's €10 / €20 / €40 includes Meta's 23% Irish VAT, so the ad's lifetime budget is the price ÷ 1.23 (€8.13 / €16.26 / €32.52), running until the lot closes.

---

## 4. Open to-do list (most important first)

0. **Seller contact / Q&A go-live:** set `PHONE_CONTACT_MIN_RESERVE_EUR` on Render (without it no lot shows a phone number); set up Twilio for seller texts if wanted. Owner review of phone numbers on higher-reserve lots due 25 Nov 2026.
1. **Cookie consent.** GA4 and the Meta Pixel load before consent (GDPR/ePrivacy). Needs a consent banner + Google Consent Mode v2. _In progress._
2. **Terms & Conditions clause 15** still says buyer fee 3% capped at €200 and seller fee 3%. Needs updating (solicitor) to match section 2.
3. **€30 featured fee** is stated but not charged. Decide and implement in payout calculation.
4. **DMARC showed FAIL** on a test on 9 Nov while SPF and DKIM passed. Re-test now the record is fixed.
5. **Conversion tracking:** sign-up, bid, listing started/submitted and listing views now go to Meta (section 3d; needs the Render settings). Still to do: contact/WhatsApp leads, delivery quote, purchase to Meta.
6. **Account-type check:** `requireSeller` is disabled in `auth.middleware.js`, so any logged-in account can create listings (ownership checks on edit/delete are fine).
7. **Forms:** labels/`required`/`autocomplete`, and `method="post"` on login/register/contact/delivery/rate-us forms.
8. **Two-step registration** (currently 15 fields before a first bid).
9. **Reviews:** `/reviews` is empty. Post-sale review request, Google Business Profile.
10. **Performance:** code-split admin/dashboard routes, load Stripe only at checkout, resize oversized images, Cloudflare edge-cache for `media.rexbid.ie`.
11. **Owner admin (non-code):** confirm ownership of every account (GitHub, Render, Cloudflare, MongoDB, Stripe, domain, Google), get a written list of environment secrets, and get a written IP assignment for the code. Remove leftover "speedways" references (`backend/package.json`).

The full SEO audit (15 page changelogs) was delivered separately as `RexBid-SEO-Report.pdf`.
