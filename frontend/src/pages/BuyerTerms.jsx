import { Link } from "react-router";
import { Container } from "../components";
import { otherData } from "../assets";

const { email, address } = otherData;

const BuyerTerms = () => {
    const formattedDate = "9 November 2026";

    return (
        <section className="pt-28 pb-16 bg-white">
            <Container>

                {/* Header */}
                <div className="max-w-full mx-auto mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                        Bidder Terms
                    </h1>

                    <p className="text-gray-600 mb-6">
                        RexBid | Last Updated: {formattedDate}
                    </p>

                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                        <p className="text-blue-800 font-semibold mb-2">
                            IMPORTANT – PLEASE READ CAREFULLY
                        </p>

                        <p className="text-blue-700 text-sm">
                            These Bidder Terms govern every bid placed through RexBid.
                            By placing a bid, you agree to these terms.
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-full mx-auto">
                    <div className="space-y-8">

                        {/* Introduction */}
                        <div className="mb-8">
                            <p className="text-gray-700 mb-4">
                                <strong>RexBid</strong> ("we", "our", "us") and you, the bidder ("Bidder"),
                                enter into these Bidder Terms governing all bids placed through our platform.
                            </p>

                            <p className="text-gray-700">
                                By placing a bid, you agree to be bound by these terms.
                            </p>
                        </div>

                        {/* Section 1 — Bid is binding */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                1. Bids are binding
                            </h2>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5 mb-3">
                                <li>
                                    Every bid is a binding commitment to purchase the item if you become the
                                    highest bidder and the reserve price is met.
                                </li>
                                <li>
                                    If the reserve is not met, the seller may still accept your highest bid within
                                    24 hours of the auction ending. If they do, you have bought the item at that
                                    bid, exactly as if you had won the auction.
                                </li>
                                <li>
                                    You must not pay the seller directly or attempt to complete the transaction
                                    outside RexBid.
                                </li>
                            </ul>

                            <div className="bg-gray-50 p-4 rounded">
                                <p className="text-red-600 font-semibold text-sm">
                                    All bids are legally binding. Do not bid unless you intend to complete the purchase.
                                </p>
                            </div>
                        </div>

                        {/* Section 2 — Payment */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                2. Payment
                            </h2>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5">
                                <li>
                                    You must pay RexBid the full amount due, including the buyer fee (6% on the
                                    first €2,000 and 3% above that, maximum €500), within 48 hours of the bidding
                                    closing. See the{" "}
                                    <a href="/payment-refund-policy" className="underline">Payment, Fees &amp; Refund Policy</a>.
                                </li>
                                <li>
                                    Collection must not be arranged until RexBid confirms that cleared funds
                                    have been received.
                                </li>
                            </ul>
                        </div>

                        {/* Section 3 — Inspection */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                3. Inspection
                            </h2>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5">
                                <li>
                                    You must inspect the listing carefully and ask any questions before bidding.
                                </li>
                                <li>
                                    Where an inspection is available, you are responsible for arranging it
                                    before bidding closes.
                                </li>
                            </ul>
                        </div>

                        {/* Section 4 — Failure to pay */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-3">
                                4. Failed payments or refusal to complete
                            </h2>

                            <p className="text-gray-700 mb-3">
                                Failed payments or refusal to complete a successful purchase may result in:
                            </p>

                            <ul className="text-gray-700 space-y-2 list-disc pl-5">
                                <li>Fees</li>
                                <li>Account suspension</li>
                                <li>Recovery of RexBid's reasonable losses</li>
                            </ul>
                        </div>

                        {/* Contact */}
                        <div className="border-t pt-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">
                                Questions
                            </h2>

                            <p className="text-gray-700 mb-4">
                                If you have any questions, just give us a call.
                            </p>

                            <div className="bg-gray-50 p-4 rounded">
                                <p className="font-semibold text-gray-900 mb-2">
                                    RexBid
                                </p>

                                <p className="text-gray-700 text-sm mb-1">
                                    {address}
                                </p>

                                <p className="text-gray-700 text-sm mb-1">
                                    Email:{" "}
                                    <a
                                        href={`mailto:${email}`}
                                        className="text-blue-600 hover:underline"
                                    >
                                        {email}
                                    </a>
                                </p>

                                <p className="text-gray-700 text-sm">
                                    Phone:{" "}
                                    <Link
                                        to={`tel:0872039257`}
                                        className="hover:text-[#D19F3E] transition"
                                    >
                                        087 203 9257
                                    </Link>
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t pt-6 mt-8">
                            <p className="text-gray-500 text-sm">
                                These Bidder Terms were last updated on {formattedDate}.
                                They apply to all bids placed through RexBid.
                            </p>
                        </div>
                    </div>

                    {/* Navigation Links */}
                    <div className="mt-12 pt-8 border-t">
                        <div className="flex flex-wrap gap-3">
                            <Link
                                to="/terms-conditions"
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                            >
                                Terms & Conditions
                            </Link>

                            <Link
                                to="/privacy-policy"
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                            >
                                Privacy Policy
                            </Link>

                            <Link
                                to="/buyer-agreement"
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                            >
                                Buyer Agreement
                            </Link>
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
};

export default BuyerTerms;