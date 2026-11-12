import { BadgePercent, Hand, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Container from "../Container";
import { FEATURED_FEE_EUR, FEATURED_FEE_GBP, META_BOOST_PRICE_RANGE, META_BOOST_PRICE_RANGE_GBP } from "../../utils/fees";

import SectionHeading from "./SectionHeading";

const TILES = [
    {
        icon: <BadgePercent size={22} className="text-[#E8B86B]" />,
        title: "No Seller Fees Until 2027",
        text: `A standard listing is free. For extra reach, add a featured spot (€${FEATURED_FEE_EUR} / £${FEATURED_FEE_GBP}) or a Facebook & Instagram ad (${META_BOOST_PRICE_RANGE} / ${META_BOOST_PRICE_RANGE_GBP}).`,
    },
    {
        icon: <SlidersHorizontal size={22} className="text-[#E8B86B]" />,
        title: "You Stay in Control",
        text: "Set a reserve. If bidding doesn't reach it, you don't have to sell.",
    },
    {
        icon: <ShieldCheck size={22} className="text-[#E8B86B]" />,
        title: "Paid Safely",
        text: "We collect the money from the buyer, and pay you securely after collection.",
    },
    {
        icon: <Hand size={22} className="text-[#E8B86B]" />,
        title: "Less Time Wasters",
        text: "No haggling. Less phone calls. The machine doesn't leave your yard until it's sold.",
    },
];

function WhySell() {
    return (
        <section className="bg-white py-9 md:py-16">
            <Container>
                <SectionHeading eyebrow="For sellers" title="Why Sell on RexBid" />
                <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                    {TILES.map(({ icon, title, text }) => (
                        <div key={title} className="w-[82%] shrink-0 snap-start rounded-2xl border border-gray-200 bg-white p-5 sm:w-auto md:p-6">
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#072342]">
                                {icon}
                            </div>
                            <h3 className="text-lg font-bold text-[#072342]">{title}</h3>
                            <p className="mt-1.5 text-[17px] leading-relaxed text-gray-600 md:mt-2 md:text-base">{text}</p>
                        </div>
                    ))}
                </div>
            </Container>
        </section>
    );
}

export default WhySell;
