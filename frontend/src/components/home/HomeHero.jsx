import { Link } from "react-router-dom";
import { ArrowRight, Check, Search } from "lucide-react";
import Container from "../Container";

const POINTS = [
    "No seller fees until 2027",
    "You set the reserve",
    "Paid securely after collection",
    "The machine stays in your yard until it's sold",
];

function HomeHero({ belowBanner }) {
    return (
        <section
            className={`relative overflow-hidden bg-gradient-to-b from-white to-[#F6F7F9] ${belowBanner ? "pt-6 md:pt-14" : "pt-[92px] md:pt-[140px]"} pb-8 md:pb-20`}
        >
            {/* soft gold glow, top right */}
            <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#D19F3E]/10 blur-3xl" />

            <Container>
                <div className="relative mx-auto max-w-3xl lg:text-center">
                    <div>
                        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#072342]/5 px-3 py-1 text-[11px] md:mb-4 md:text-xs font-semibold uppercase tracking-[0.12em] text-[#072342]">
                            Ireland's machinery marketplace
                        </p>
                        <h1 className="text-[2rem] font-bold leading-[1.12] sm:text-[2.3rem] tracking-tight text-[#072342] md:text-5xl xl:text-[3.4rem]">
                            Sell Your Machinery to Buyers{" "}
                            <span className="whitespace-nowrap text-[#C08A2C]">All Over Ireland</span>
                        </h1>
                        <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-gray-600 md:mt-5 md:text-lg lg:mx-auto">
                            List your tractor, digger or plant machine in 5 minutes. You set the reserve, buyers
                            compete online, and we collect the money for you.
                        </p>

                        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:gap-3 md:mt-7 lg:justify-center">
                            <Link
                                to="/sell"
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] px-3 py-3.5 text-base font-bold text-[#072342] shadow-md sm:px-7 sm:py-3.5 sm:text-base transition hover:shadow-lg"
                            >
                                Sell your machine
                                <ArrowRight size={16} className="hidden sm:block" />
                            </Link>
                            <Link
                                to="/auctions"
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#072342]/20 bg-white px-3 py-3.5 text-base font-semibold text-[#072342] sm:px-7 sm:py-3.5 sm:text-base transition hover:border-[#072342]/50"
                            >
                                Browse machinery
                                <Search size={16} className="hidden sm:block" />
                            </Link>
                        </div>

                        <ul className="mt-5 grid gap-2 sm:grid-cols-2 md:mt-7 md:gap-2.5 lg:mx-auto lg:max-w-2xl lg:text-left">
                            {POINTS.map((p) => (
                                <li key={p} className="flex items-start gap-2 text-base text-gray-700 md:text-[15px]">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D19F3E]/15">
                                        <Check size={13} className="text-[#A17B35]" strokeWidth={3} />
                                    </span>
                                    {p}
                                </li>
                            ))}
                        </ul>
                    </div>

                </div>
            </Container>
        </section>
    );
}

export default HomeHero;
