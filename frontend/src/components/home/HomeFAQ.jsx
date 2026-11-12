import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import Container from "../Container";
import { FEATURED_FEE_EUR, FEATURED_FEE_GBP, SELLER_FEES_FREE_UNTIL, META_BOOST_PRICE_RANGE, META_BOOST_PRICE_RANGE_GBP } from "../../utils/fees";

import SectionHeading from "./SectionHeading";

const QA = [
    {
        q: "What does it cost to sell?",
        a: `A standard listing costs nothing on sales completed before ${SELLER_FEES_FREE_UNTIL}. For extra reach you can add a featured spot on the homepage for €${FEATURED_FEE_EUR} (£${FEATURED_FEE_GBP}), or a Facebook & Instagram ad from ${META_BOOST_PRICE_RANGE} (${META_BOOST_PRICE_RANGE_GBP}). Both are optional and paid by card when you list.`,
    },
    {
        q: "What if my machine doesn't reach the reserve?",
        a: "Then there's no sale and no charge. The two highest bidders can make you an offer, which you're free to accept or turn down.",
    },
    {
        q: "When and how do I get paid?",
        a: "We collect the money from the buyer, and pay you securely after collection, normally within 0–3 working days.",
    },
    {
        q: "Is there a buyer fee?",
        a: "Yes. Buyers pay 6% on the first €2,000 and 3% on anything above, up to a maximum of €500. It's shown before they bid.",
    },
    {
        q: "How does collection work?",
        a: "Once the buyer has paid, we share collection details and they collect from you within 3 working days. Buyers can also get a transport quote from our partner EVOLVE.",
    },
];

function HomeFAQ() {
    return (
        <section className="bg-white py-9 md:py-16">
            <Container>
                <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-14">
                    <div>
                        <SectionHeading eyebrow="Questions" title="Good to Know" />
                        <p className="-mt-4 text-gray-600">
                            More answers in our{" "}
                            <Link to="/faqs" className="font-semibold text-[#A17B35] underline">FAQs</Link> and{" "}
                            <Link to="/payment-refund-policy" className="font-semibold text-[#A17B35] underline">fees policy</Link>.
                        </p>
                    </div>
                    <div className="divide-y divide-gray-200 border-y border-gray-200">
                        {QA.map(({ q, a }) => (
                            <details key={q} className="group py-4">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[17px] font-semibold text-[#072342] md:text-base">
                                    {q}
                                    <ChevronDown size={18} className="shrink-0 text-[#A17B35] transition-transform group-open:rotate-180" />
                                </summary>
                                <p className="mt-3 text-[17px] leading-relaxed text-gray-600 md:text-base">{a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}

export default HomeFAQ;
