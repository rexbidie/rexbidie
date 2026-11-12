import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Container from "../Container";

import SectionHeading from "./SectionHeading";

const STEPS = {
    selling: [
        { title: "Create Your Listing", text: "Photos, details and your reserve. It takes about 5 minutes." },
        { title: "Pick a Sale Date", text: "Choose from the dates available." },
        { title: "Buyers Compete", text: "Buyers bid against each other online, the highest bidder wins if the reserve is met." },
        { title: "Get Paid", text: "We collect the money from the buyer, and pay you securely after collection." },
    ],
    buying: [
        { title: "Register Free", text: "Create an account and browse machines from sellers across Ireland." },
        { title: "Bid Online", text: "The buyer fee is shown before you bid." },
        { title: "Pay RexBid", text: "Within 48 hours. Card under €1,000, bank transfer above." },
        { title: "Collect", text: "Within 3 working days of payment, or get a transport quote from EVOLVE." },
    ],
};

const CTA = {
    selling: { to: "/sell", label: "Sell your machine" },
    buying: { to: "/auctions", label: "Browse machinery" },
};

function HowItWorksTabs() {
    const [tab, setTab] = useState("selling");

    return (
        <section className="bg-[#072342] py-9 text-white md:py-16">
            <Container>
                <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E8B86B]">How it works</p>
                        <h2 className="text-[1.6rem] font-bold leading-tight md:text-[2rem]">Simple From Start to Finish</h2>
                    </div>
                    <div role="tablist" className="inline-flex self-start rounded-full bg-white/10 p-1">
                        {["selling", "buying"].map((t) => (
                            <button
                                key={t}
                                role="tab"
                                aria-selected={tab === t}
                                onClick={() => setTab(t)}
                                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                                    tab === t ? "bg-[#D19F3E] text-[#072342]" : "text-white/80 hover:text-white"
                                }`}
                            >
                                {t === "selling" ? "Selling" : "Buying"}
                            </button>
                        ))}
                    </div>
                </div>

                <ol className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                    {STEPS[tab].map((s, i) => (
                        <li key={s.title} className="w-[82%] shrink-0 snap-start rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:w-auto md:p-6">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D19F3E] font-bold text-[#072342]">
                                {i + 1}
                            </span>
                            <h3 className="mt-3 text-lg font-bold md:mt-4">{s.title}</h3>
                            <p className="mt-1.5 text-[17px] leading-relaxed text-gray-300 md:mt-2 md:text-base">{s.text}</p>
                        </li>
                    ))}
                </ol>

                <Link
                    to={CTA[tab].to}
                    className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] px-7 py-3.5 font-bold text-[#072342]"
                >
                    {CTA[tab].label} <ArrowRight size={18} />
                </Link>
            </Container>
        </section>
    );
}

export default HowItWorksTabs;
