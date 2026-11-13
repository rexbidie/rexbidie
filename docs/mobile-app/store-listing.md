# App Store and Google Play listing text

Ready to paste. Character limits are noted; everything here fits.

---

## Both stores

**App name** (30): `RexBid: Machinery Auctions`

**Subtitle (Apple, 30) / Short description (Google, 80):**
- Apple: `Buy & sell machinery in Ireland`
- Google: `Bid on tractors, diggers, plant and vans across Ireland. Sell with no seller fees.`

**Description** (both, up to 4,000):

```
RexBid is Ireland's online auction for farm and construction machinery. Bid on tractors, diggers, plant, trailers and vans from sellers across Ireland and Northern Ireland, or sell your own machine without leaving the yard.

BUY
• Browse live auctions, catalogues and Buy It Now lots
• Bid in seconds, or set an automatic (proxy) bid up to your limit
• Get a notification the moment you're outbid, so you never miss a lot
• Reminders before lots you follow close
• Ask the seller questions on any listing
• Pay securely by card or bank transfer, with your receipt in the app

SELL
• No seller fees on sales before 1 January 2027
• List in minutes: take photos with your phone camera
• You set the reserve; the machine stays in your yard until it's sold
• Answer buyers' questions from a notification
• Get notified when your item sells, when the buyer pays and when you've been paid
• Payouts straight to your bank through Stripe

MADE FOR YOUR PHONE
• Sign in with Face ID or your fingerprint
• Notifications for bids, wins, payments and questions, and you choose which ones you get
• Share listings to WhatsApp, Messages or Facebook in one tap

Buyer fee: 6% on the first €2,000 and 3% above, capped at €500 per item. Full terms at rexbid.ie.

RexBid is run by REXBID Limited, Co. Cavan, Ireland.
```

**Keywords (Apple, 100, comma-separated, no spaces):**
`tractor,digger,auction,machinery,plant,farm,agri,excavator,trailer,bid,ireland,construction,van`

**Category:** Shopping. Secondary (Apple): Business.

**Support URL:** https://rexbid.ie/contact
**Marketing URL:** https://rexbid.ie
**Privacy policy URL:** https://rexbid.ie/privacy-policy
**Account deletion URL (Google):** https://rexbid.ie/delete-account

**Age rating:** answer "No" to every content question → 4+ (Apple) / Everyone (Google).
Real-money auctions of physical goods are **not** gambling; answer No to gambling.

**Price:** Free. **In-app purchases:** None (machinery is a physical good paid by card/bank
transfer through Stripe, which both stores allow).

**Countries:** Ireland and United Kingdom (add others later if wanted).

---

## Review notes (for Apple / Google reviewers)

```
RexBid is an auction marketplace for physical machinery (tractors, diggers, plant). Payments are for physical goods and are processed by Stripe on our website and in the app, so in-app purchase does not apply.

Test account (bidder):
Email: <create one and put it here>
Password: <password>

To see notifications: sign in, allow notifications, open any live listing and add it to your watchlist. Account deletion: Profile (Account tab) → Security → Delete my account.
```

Make the test account a **bidder with a test card on file** so the reviewer can browse and open
bidding screens without needing to place a real bid. Tell them not to bid on live lots.

---

## Apple: App Privacy ("nutrition label")

Data **linked to the user**, **not used for tracking**:

| Data type | Used for |
|---|---|
| Name, email address, phone number, physical address | App functionality, account |
| Payment info (handled by Stripe) | App functionality |
| Photos (sellers' listing photos only) | App functionality |
| User ID | App functionality |
| Device ID (push notification token) | App functionality |
| Purchase history (bids, sales) | App functionality |
| Other user content (questions, answers) | App functionality |

**Tracking:** No. No data used to track users across other companies' apps or websites.
(The app build has no Google Analytics or Meta Pixel.)

## Google Play: Data safety

- Data collected: Personal info (name, email, phone, address), Financial info (payment info via
  Stripe, purchase history), Photos, App activity (in-app actions), Device or other IDs (push token).
- Shared with third parties: No (processors such as Stripe and Firebase act on our behalf, which
  Google doesn't count as sharing).
- Encrypted in transit: Yes.
- Users can request deletion: Yes, in the app and at https://rexbid.ie/delete-account.

---

## Screenshots to take (from TestFlight / internal testing)

Apple needs 6.9" iPhone screenshots (1320 × 2868); Google needs at least 2 phone screenshots.
Suggested set of 6, in this order:

1. Home page with live auctions
2. A listing with photos and the bid button
3. Outbid notification on the lock screen
4. Alerts (notifications) list
5. Create listing with the Take photo button
6. Face ID sign-in
