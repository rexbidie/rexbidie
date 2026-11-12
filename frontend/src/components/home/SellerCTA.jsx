import { Link } from "react-router-dom";
import { ArrowRight, Phone } from "lucide-react";
import Container from "../Container";

function SellerCTA() {
    return (
        <section className="bg-white pb-14 md:pb-20">
            <Container>
                <div className="flex flex-col items-start gap-6 rounded-3xl bg-[#072342] px-5 py-7 md:py-10 md:flex-row md:items-center md:justify-between md:px-12">
                    <div>
                        <h2 className="text-[1.6rem] font-bold text-white md:text-3xl">Got a Machine to Sell?</h2>
                        <p className="mt-2 text-gray-300 md:text-lg">List it in 5 minutes, free until 2027.</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                        <Link
                            to="/sell"
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] px-7 py-3.5 font-bold text-[#072342]"
                        >
                            Sell your machine <ArrowRight size={18} />
                        </Link>
                        <a href="tel:+353872039257" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white">
                            <Phone size={14} /> Questions? Call 087 203 9257
                        </a>
                    </div>
                </div>
            </Container>
        </section>
    );
}

export default SellerCTA;
