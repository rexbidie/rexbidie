import { Link } from "react-router-dom";
import { Container } from "../components";
import {
    calcBuyerFee,
    buyerFeeSentence,
    SELLER_FEES_FREE_UNTIL,
    FEATURED_FEE_EUR,
    META_BOOST_PACKAGES,
    META_BOOST_MIN_HOURS_BEFORE_CLOSE,
    FEATURED_FEE_GBP,
    GBP_PER_EUR_EXTRAS,
    MIN_RESERVE_EUR,
    MIN_NO_RESERVE_START_EUR,
} from "../utils/fees";

const LAST_UPDATED = "14 November 2026";
const EXAMPLES = [1000, 2000, 5000, 10000, 20000];
const euro = (n) => `€${Number(n).toLocaleString("en-IE", { maximumFractionDigits: 2 })}`;

const Section = ({ id, title, children }) => (
    <div id={id} className="border-t pt-6 scroll-mt-28">
        <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
        <div className="text-gray-700 space-y-3">{children}</div>
    </div>
);

const List = ({ items }) => (
    <ul className="list-disc pl-5 space-y-2">
        {items.map((item, i) => (
            <li key={i}>{item}</li>
        ))}
    </ul>
);

const PaymentRefundPolicy = () => {
    return (
        <section className="pt-28 pb-16 bg-white">
            <Container>
                <div className="max-w-full mx-auto mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                        Payment, Fees &amp; Refund Policy
                    </h1>
                    <p className="text-gray-600 mb-6">
                        REXBID Limited | Effective and last updated: {LAST_UPDATED}
                    </p>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                        <p className="text-blue-800 text-sm">
                            This policy explains how payment, fees, collection and refunds work when you buy or sell
                            on RexBid. It forms part of, and should be read with, our{" "}
                            <Link to="/terms-conditions" className="underline">Terms &amp; Conditions</Link>,{" "}
                            <Link to="/buyer-agreement" className="underline">Buyer Agreement</Link>,{" "}
                            <Link to="/buyer-terms" className="underline">Bidder Terms</Link> and{" "}
                            <Link to="/seller-agreement" className="underline">Seller Agreement</Link>. If anything here
                            conflicts with the Terms &amp; Conditions, the Terms &amp; Conditions apply.
                        </p>
                    </div>
                </div>

                <div className="max-w-full mx-auto space-y-8">
                    <p className="text-gray-700">
                        RexBid is an online marketplace. Items are sold by independent sellers (private individuals
                        and businesses), not by RexBid. RexBid runs the auction, collects payment from the buyer and
                        releases it to the seller once the sale completes.
                    </p>

                    <Section id="buyer-fee" title="1. Buyer fee">
                        <p>
                            When you win an auction, or a seller accepts your offer, {buyerFeeSentence}, is added to
                            the winning price. The buyer fee is shown before you bid and is included in the amount due
                            when you win.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border border-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left p-2 border-b">Winning price</th>
                                        <th className="text-right p-2 border-b">Buyer fee</th>
                                        <th className="text-right p-2 border-b">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {EXAMPLES.map((p) => (
                                        <tr key={p}>
                                            <td className="p-2 border-b">{euro(p)}</td>
                                            <td className="p-2 border-b text-right">
                                                {euro(calcBuyerFee(p))}
                                                {calcBuyerFee(p) === 500 ? " (maximum)" : ""}
                                            </td>
                                            <td className="p-2 border-b text-right">{euro(p + calcBuyerFee(p))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm text-gray-600">
                            Totals exclude any VAT on the item and any transport costs. For listings priced in sterling
                            (£), the same percentages apply and the €500 maximum is converted at the exchange rate on the
                            day of sale.
                        </p>
                    </Section>

                    <Section id="vat" title="2. VAT">
                        <p>
                            Whether VAT applies to an item is set by the seller (for example, a VAT-registered business
                            selling in the course of business). Each listing shows whether VAT is applicable. Where it
                            is, VAT is charged on the item at the applicable rate in addition to the winning price.
                        </p>
                    </Section>

                    <Section id="seller-fees" title="3. Seller fees">
                        <List
                            items={[
                                <>
                                    <strong>There are no seller fees on sales completed before {SELLER_FEES_FREE_UNTIL}.</strong>{" "}
                                    We will give registered sellers at least 30 days' notice by email before any seller
                                    fee is introduced, and new fees will only apply to listings created after that notice.
                                </>,
                                <>
                                    <strong>Featured listings (optional):</strong> €{FEATURED_FEE_EUR} (£{FEATURED_FEE_GBP} for sterling sellers), paid by card
                                    when you submit the listing. Your listing is shown at the top of the homepage.
                                </>,
                                <>
                                    <strong>Facebook &amp; Instagram adverts (optional):</strong>{" "}
                                    {META_BOOST_PACKAGES.map((pkg) => `${pkg.name} €${pkg.priceEur} (£${pkg.priceEur * GBP_PER_EUR_EXTRAS})`).join(", ")}, paid by
                                    card when you submit the listing. We run a paid advert for your listing from approval
                                    until the sale closes. Reach figures are estimates, not guarantees. Adverts are only
                                    available when the sale closes at least {META_BOOST_MIN_HOURS_BEFORE_CLOSE} hours
                                    after you list.
                                </>,
                                <>
                                    <strong>Refunds on paid extras:</strong> we refund a paid extra in full if we don't
                                    approve your listing, if we can't feature it, or if Meta rejects the advert. Once a
                                    featured spot or advert has started, it is not refundable, even if the item sells
                                    early or is withdrawn.
                                </>,
                            ]}
                        />
                    </Section>

                    <Section id="minimums" title="4. Minimum prices for auctions">
                        <List
                            items={[
                                <>
                                    <strong>Reserve auctions:</strong> the reserve price must be at least €{MIN_RESERVE_EUR}.
                                </>,
                                <>
                                    <strong>No-reserve auctions:</strong> the starting bid must be at least €
                                    {MIN_NO_RESERVE_START_EUR}.
                                </>,
                                "For listings priced in sterling (£), the equivalent amount at the current exchange rate applies.",
                            ]}
                        />
                    </Section>

                    <Section id="how-to-pay" title="5. How to pay">
                        <List
                            items={[
                                <>
                                    All payments are made <strong>to RexBid</strong>. <strong>Never pay a seller directly</strong>{" "}
                                    or arrange payment outside RexBid. We cannot protect payments made outside the platform.
                                </>,
                                <>
                                    <strong>Purchases under €1,000:</strong> paid by debit or credit card through our secure
                                    checkout (processed by Stripe). The card saved on your account may be charged for the
                                    amount due.
                                </>,
                                <>
                                    <strong>Purchases of €1,000 or more:</strong> paid by bank transfer. We will email you a
                                    payment request with RexBid's bank details. Payment must come from a bank account in the
                                    buyer's (or the buyer's company's) name.
                                </>,
                                <>
                                    We will never ask you to pay into a different account by phone, text or WhatsApp. If in
                                    doubt, call us on <a href="tel:+353872039257" className="underline">087 203 9257</a>{" "}
                                    before paying.
                                </>,
                            ]}
                        />
                    </Section>

                    <Section id="when-to-pay" title="6. When to pay">
                        <List
                            items={[
                                "Full payment, including the buyer fee, is due within 48 hours of the auction closing or the offer being accepted.",
                                "If payment is not received in time, RexBid may cancel the sale, offer the item to the next highest bidder or relist it, suspend your account, and recover reasonable losses and fees, as set out in the Buyer Agreement and Bidder Terms.",
                            ]}
                        />
                    </Section>

                    <Section id="collection" title="7. Collection and transport">
                        <List
                            items={[
                                "Do not arrange collection until RexBid confirms that cleared funds have been received. We will then share the seller's collection details.",
                                "Items must be collected within 3 working days of payment confirmation, unless agreed otherwise with the seller.",
                                "Items not collected within 3 working days of payment confirmation may be subject to storage fines.",
                                <>
                                    Transport can be quoted through the “Request Delivery Quote” button or our{" "}
                                    <Link to="/delivery-partner-quote" className="underline">transport quote page</Link>.
                                    Transport is a separate service, paid by the buyer directly to the transport provider,
                                    on terms agreed with them.
                                </>,
                                "Responsibility for the item passes to the buyer on collection or delivery.",
                            ]}
                        />
                    </Section>

                    <Section id="seller-payment" title="8. When the seller is paid">
                        <p>
                            RexBid holds the buyer's payment and releases the sale price (less any applicable seller
                            fees) to the seller within 0–3 working days after collection is confirmed.
                        </p>
                    </Section>

                    <Section id="refunds" title="9. Refunds">
                        <p><strong>You will receive a full refund, including the buyer fee, if:</strong></p>
                        <List
                            items={[
                                "the seller cannot or will not complete the sale;",
                                "the item is withdrawn or is not available at collection;",
                                "you were charged in error or paid twice (refunded after verification).",
                            ]}
                        />
                        <p>
                            <strong>If the item is materially different from its listing</strong> (for example, a
                            significant fault that was not disclosed, or the wrong item), contact us within{" "}
                            <strong>24 hours</strong> of collection or delivery, with photos. We will review the case with
                            the buyer and seller and may cancel the sale and refund you. Refunds in these cases are
                            decided case by case and are not guaranteed.
                        </p>
                        <p>
                            <strong>Refunds are not given for:</strong> change of mind; faults or wear that were
                            disclosed in the listing or visible in its photos; issues you could reasonably have
                            identified by asking questions or inspecting before bidding; or delays caused by the buyer.
                        </p>
                        <p>
                            <strong>Your statutory rights.</strong> Nothing in this policy affects your rights under Irish
                            or (in Northern Ireland) UK consumer law.
                        </p>
                        <p>Approved refunds are paid to the original payment method within 10 working days.</p>
                    </Section>

                    <Section id="reserve-offers" title="10. Reserve not met and offers">
                        <List
                            items={[
                                "If an auction ends without meeting its reserve, the seller may accept the highest bid within 24 hours of the auction ending. If they do, the highest bidder has bought the item at their highest bid.",
                                "Otherwise there is no sale and nothing is charged, unless the seller later accepts your offer or you buy the item on Last Chance.",
                                "An accepted highest bid or accepted offer is a binding sale, and this policy applies to it in the same way as a winning bid.",
                            ]}
                        />
                    </Section>

                    <Section id="currency" title="11. Currency">
                        <p>
                            Listings are priced in euro (€) or sterling (£). You pay in the listing's currency.
                            Converted prices shown on the site are for guidance only.
                        </p>
                    </Section>

                    <Section id="contact" title="12. Disputes and contact">
                        <p>If you have a problem with a payment or a purchase, contact us first and we will try to resolve it quickly.</p>
                        <p>
                            <strong>REXBID Limited</strong>, Corfeehone, Co. Cavan, Ireland · CRO 819231
                            <br />
                            Email: <a href="mailto:admin@rexbid.ie" className="underline">admin@rexbid.ie</a> · Phone /
                            WhatsApp: <a href="tel:+353872039257" className="underline">087 203 9257</a>
                        </p>
                    </Section>

                    <Section id="changes" title="13. Changes to this policy">
                        <p>
                            We may update this policy. The version that applies to a purchase is the one published when
                            the auction closed or the offer was accepted. The date at the top shows when it was last
                            changed.
                        </p>
                    </Section>

                    <Section id="law" title="14. Governing law">
                        <p>
                            This policy is governed by the laws of Ireland. If you live in Northern Ireland, you also
                            keep any protections given to you by UK consumer law.
                        </p>
                    </Section>
                </div>
            </Container>
        </section>
    );
};

export default PaymentRefundPolicy;
