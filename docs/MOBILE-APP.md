# RexBid iPhone & Android app

The app is the website's own React code wrapped with [Capacitor](https://capacitorjs.com/),
so it looks and works like rexbid.ie: same listings, bidding, dashboards, Stripe payments
and emails. It talks to the same backend (`rexbid-backend.onrender.com`), so nothing about
payments or email is set up twice.

**Not in the app:** the admin dashboard (admins use the website), the cookie banner,
Google Analytics and the Meta Pixel. The app collects no advertising data.

**Extra in the app:**

| Feature | Where in the code |
|---|---|
| Push notifications + in-app inbox (Alerts tab) | `frontend/src/native/push.jsx`, `frontend/src/pages/Notifications.jsx`, `backend/src/utils/push.js` |
| Face ID / Touch ID / fingerprint sign-in | `frontend/src/native/biometric.js`, `frontend/src/pages/Login.jsx` |
| Take photo / pick from library when listing | `frontend/src/native/camera.js`, `frontend/src/components/listing/CreateListingForm.jsx` |
| Vibration on bid placed / outbid / won, outbid alert while watching a lot | `frontend/src/native/haptics.js`, `frontend/src/pages/SingleAuction.jsx` |
| Share button on listings (WhatsApp, Messages, Facebook…) | `frontend/src/native/share.js` |
| PDFs (payment requests, receipts) open in the phone's viewer | `frontend/src/native/files.js` |
| Stripe payout setup opens in an in-app browser and refreshes on close | `frontend/src/components/payouts/StripePayoutCard.jsx` |

---

## 1. Notifications: what is sent and when

The backend sends a push **at the same moment as an existing email**, from
`backend/src/utils/nodemailer.js`. Every push is also saved to the in-app inbox
(kept 90 days), so people who said no to notifications still see them under **Alerts**.

| Who | Notification | Sent with email |
|---|---|---|
| Bidder | You've been outbid | `outbidNotificationEmail` |
| Bidder / watcher | Ending soon | `auctionEndingSoonEmail` |
| Bidder | You won | `sendAuctionWonEmail` |
| Buyer | Payment request | `paymentRequestEmail` |
| Buyer | Payment due soon / overdue, collection due soon / overdue | `saleReminderEmail` |
| Bidder / watcher / asker | Now on Buy It Now | `postAuctionBinBuyerEmail` |
| Asker | Your question was answered | `questionAnsweredEmail` |
| Seller | New question on your listing | `newQuestionSellerEmail` |
| Seller | Your item sold | `sendAuctionEndedSellerEmail` |
| Seller | The buyer has paid / You've been paid | `sellerStatementEmail` |

Pushes do not follow the email-preference settings (a person turns pushes off in their
phone's Settings). A failed push never stops an email.

**Render settings (backend):**

| Setting | Value |
|---|---|
| `FCM_SERVICE_ACCOUNT` | The Firebase service-account key: paste the whole JSON file (or the same, base64-encoded). Without it, notifications are still saved to the inbox but no pushes are sent. |
| `PUSH_ENABLED` | `false` pauses all pushes and inbox entries. Leave unset normally. |

New API (signed-in users only): `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`,
`POST /api/v1/notifications/read`, `POST|DELETE /api/v1/notifications/devices`.

The backend now also accepts requests from the app's own addresses
(`capacitor://localhost`, `https://localhost`, `http://localhost`) in `server.js`.
**This backend change must be live on Render before the app can sign in or load listings.**

---

## 1a. Sign-in, notification settings and account deletion

**Keep me signed in.** Each device now has its own sign-in, so being signed in on the phone no
longer signs you out of the website. On the website, ticking *Keep me signed in* keeps you signed in
for 90 days without use (otherwise 7 days, as before). The app always keeps you signed in.
Resetting a forgotten password signs out every device. Render settings (optional):
`REMEMBER_ME_REFRESH_EXPIRY` (default `90d`), `REFRESH_TOKEN_EXPIRY` (default `7d`).

**Notification settings** (Profile → Notifications, website and app). Users switch each category
on or off for email and, in the app, for notifications: Bidding, Ending soon, Watchlist, Offers,
Buy It Now, Questions, My listings, New listings, News. **Always sent:** payments (requests,
reminders, receipts, payouts), auction won, offer accepted, your item sold, account and security.
Rules in `backend/src/utils/emailPreferences.js`.

**Account deletion** (Profile → Security, and rexbid.ie/delete-account). Needs the password and
typing DELETE. Refused while the user has live/upcoming listings, a leading or proxy bid on a live
lot, an open offer, or an unfinished sale or payout. The account is anonymised: personal details,
saved cards (Stripe customer), ID document, devices, notifications, watchlist and reminders are
removed; sale records and payouts are kept. The user gets a confirmation email and the office gets
a note. Code: `backend/src/services/accountDeletionService.js`.

---

## 2. One-off setup (owner)

### Accounts
1. **Apple Developer Program** (€99/year), enrolled as **REXBID Limited**. Needs a D-U-N-S number (free, 1–2 weeks).
2. **Google Play Console** ($25 once), as an organisation.
3. **Firebase** (free): <https://console.firebase.google.com> → *Add project* → "RexBid". Turn **off** Google Analytics.

### Firebase (push notifications)
1. In the Firebase project, add an **iOS app** with bundle ID `ie.rexbid.app`. Download `GoogleService-Info.plist`.
2. Add an **Android app** with package `ie.rexbid.app`. Download `google-services.json`.
3. Apple Developer → *Keys* → create a key with **Apple Push Notifications service (APNs)**. Download the `.p8` file (once only), note the Key ID and your Team ID.
   Firebase → Project settings → *Cloud Messaging* → *Apple app configuration* → upload the `.p8` with the Key ID and Team ID.
4. Firebase → Project settings → *Service accounts* → **Generate new private key**. Paste the file's contents into Render as `FCM_SERVICE_ACCOUNT` on the backend service.

**These files are private: never commit them** (the repository is public; `.gitignore` already blocks them):
- `GoogleService-Info.plist` goes in `frontend/ios/App/App/` (drag into Xcode under *App* and tick "Copy items if needed").
- `google-services.json` goes in `frontend/android/app/`.

### Stripe key for the app build
Create `frontend/.env.app.local` (not committed) with the same publishable key the website uses:
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 3. Building the app

Needs Node 20+. iPhone builds need a Mac with Xcode 16+; Android builds need Android Studio.

```bash
cd frontend
npm install
npm run app:build        # builds the app version of the site and copies it into ios/ and android/
npm run app:ios          # opens Xcode
npm run app:android      # opens Android Studio
```

Run `npm run app:build` again after any website code change, then rebuild in Xcode / Android Studio.
Website builds (`npm run build`) are unaffected by the app.

### iPhone (Xcode)
1. *App* target → *Signing & Capabilities* → choose the REXBID Limited team. Xcode turns on
   **Push Notifications** and **Associated Domains** from `App.entitlements`.
2. Set *Version* (e.g. 1.0.0) and *Build* (1, 2, 3… one higher for every upload).
3. Test on an iPhone: plug it in, choose it at the top, press ▶.
4. Upload: *Product → Archive → Distribute App → App Store Connect*. Then in
   [App Store Connect](https://appstoreconnect.apple.com) add it to **TestFlight** to try it, and submit for review.
5. Before release, in `ios/App/App/App.entitlements` change `aps-environment` from `development`
   to `production` (or let Xcode's archive do it; check the archived entitlements).

### Android (Android Studio)
1. *Build → Generate Signed App Bundle* → create an upload key (keep the `.jks` file and its
   passwords safe and **off GitHub**; losing it makes updates harder).
2. Upload the `.aab` to Google Play Console → *Testing → Internal testing* first, then *Production*.
3. Turn on **Play App Signing** (default). Copy its SHA-256 fingerprint for app links (below).

### App icon and splash screen
Made from the website logo (`frontend/assets/`). To change them, replace the images in
`frontend/assets/` and run `npm run app:assets`.

---

## 4. Store listings: answers you'll need

- **Name:** RexBid · **Subtitle:** Machinery auctions in Ireland
- **Category:** Shopping (secondary: Business)
- **Privacy policy URL:** https://rexbid.ie/privacy-policy
- **Support URL:** https://rexbid.ie/contact
- **Payments:** physical goods (machinery). Stripe card payments are allowed; no Apple / Google in-app purchase needed.
- **Sign-in for the reviewer:** create a bidder test account and give Apple/Google its email and password in the review notes.
- **Apple privacy "nutrition label":** collects name, email, phone, address (account and purchases),
  payment info (via Stripe), photos (seller listings), device ID for notifications. **No tracking**, no third-party advertising.
- **Google Play Data safety:** the same; data encrypted in transit; users can request deletion via admin@rexbid.ie.
- **Account deletion:** in the app and website at Profile → Security → Delete my account, and
  explained at https://rexbid.ie/delete-account (give this link to Google).
- Ready-to-paste store text, keywords and privacy answers: `docs/mobile-app/store-listing.md`.
- Privacy policy additions for the app (draft, needs your approval): `docs/mobile-app/privacy-policy-app-section.md`.

Screenshots: 6.7" and 6.5" iPhone, plus phone screenshots for Google Play. Take them from the
TestFlight / internal-testing build.

---

## 5. Optional: rexbid.ie links open the app

Emails and shared links already work in the browser. To have them open the app for people who have it:

1. Fill in and publish the two files in `docs/mobile-app/`:
   - `apple-app-site-association`: replace `TEAMID` with your Apple Team ID.
   - `assetlinks.json`: replace the fingerprint with the **Play App Signing** SHA-256 fingerprint.
2. Copy them to `frontend/public/.well-known/` and deploy the website. They must be served at
   `https://rexbid.ie/.well-known/apple-app-site-association` (JSON, no redirect) and
   `https://rexbid.ie/.well-known/assetlinks.json`. Check the Render rewrite rules don't send
   `/.well-known/*` to `index.html` (existing files are served first, so they shouldn't).

The app side is already set up (entitlements, Android intent filter, `appUrlOpen` handling).

---

## 6. Things to check on a real phone before release

These can't be fully tested in the cloud build environment:
- Notch / home-bar spacing on an iPhone with Face ID and on an Android phone with gesture navigation.
- Push: sign in → allow notifications → get outbid from another account → notification arrives and opens the lot.
- Face ID / fingerprint: sign in → "Use Face ID" → sign out → "Sign in with Face ID".
- Listing: *Take photo* and *From library* add photos; the listing submits.
- Card payment with 3D Secure (a card that asks for bank approval) and registration with a card.
- Seller payout setup via Stripe opens and returns, and the status updates.
- Opening a payment request PDF from Documents.
- Android back button.
