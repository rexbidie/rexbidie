import { lazy, Suspense, useEffect, useState } from "react";
import { Container, PromoBanner } from "../components";
import { evolve } from "../assets";
import HomeHero from "../components/home/HomeHero";
import LiveNowBanner from "../components/home/LiveNowBanner";
import HomeBuyItNow from "../components/home/HomeBuyItNow";
import axiosInstance from "../utils/axiosInstance";
import { irishDayKey, useClosingNext } from "../components/home/shared";

const FeaturedListings = lazy(() => import("../components/FeaturedListings"));
const SaleDates = lazy(() => import("../components/home/SaleDates"));
const RecentlySold = lazy(() => import("../components/home/RecentlySold"));
const WhySell = lazy(() => import("../components/home/WhySell"));
const HowItWorksTabs = lazy(() => import("../components/home/HowItWorksTabs"));
const HomeFAQ = lazy(() => import("../components/home/HomeFAQ"));
const SellerCTA = lazy(() => import("../components/home/SellerCTA"));
const ClientReviews = lazy(() => import("../components/home/ClientReviews"));

function Home() {
    // Listings closing next: feeds the "closing now" banner.
    const { items, currency } = useClosingNext(12);

    // The listing the banner is showing (next to close today, Irish time).
    const now = Date.now();
    const today = irishDayKey(now);
    const liveNow = items.find(
        (a) => new Date(a.endDate).getTime() > now && irishDayKey(a.endDate) === today
    );

    // Lots on Buy It Now (after the auction): shown at the very top while any are live.
    const [binLots, setBinLots] = useState([]);
    useEffect(() => {
        let cancelled = false;
        axiosInstance
            .get(`/api/v1/buy-it-now?currency=${currency || "EUR"}`)
            .then(({ data }) => !cancelled && setBinLots(data?.data?.lots || []))
            .catch(() => {});
        return () => { cancelled = true; };
    }, [currency]);
    const binLive = binLots.some((l) => new Date(l.endsAt).getTime() > now);

    return (
        <>
            <HomeBuyItNow lots={binLots} />
            <LiveNowBanner items={items} currency={currency} belowBin={binLive} />
            <HomeHero belowBanner={!!liveNow || binLive} />

            {/* Order: Buy It Now, hero, Featured, Sale Dates, Reviews, Recently Sold,
                EVOLVE delivery, Why Sell, How It Works, Good to Know. */}
            <Suspense fallback={null}>
                <div className="bg-white pt-4">
                    <FeaturedListings />
                </div>
                <SaleDates />
                <ClientReviews />
                <RecentlySold />
                <Container>
                    <PromoBanner
                        logoUrl={evolve}
                        title="Nationwide Delivery With Our Transport Partner EVOLVE"
                        description="Get a quote for any machine on RexBid."
                        buttonText="Get a Quote"
                        buttonLink="/delivery-partner-quote"
                    />
                </Container>
                <WhySell />
                <HowItWorksTabs />
                <HomeFAQ />
                <SellerCTA />
            </Suspense>
        </>
    );
}

export default Home;
