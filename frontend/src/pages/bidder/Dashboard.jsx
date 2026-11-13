import { LoadingSpinner, BidderContainer, BidderHeader, BidderSidebar, AccountInactiveBanner } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import useBidderDashboard from "../../components/dashboard/bidder/useBidderDashboard";
import AttentionCards from "../../components/dashboard/bidder/AttentionCards";
import attentionItems from "../../components/dashboard/bidder/attentionItems";
import LotTabs from "../../components/dashboard/bidder/LotTabs";

/** Bidder home: what needs doing first, then the lots they're bidding on. */
function Dashboard() {
    const { user } = useAuth();
    const data = useBidderDashboard(user);
    const firstName = user?.firstName || user?.username || "";

    return (
        <section className="flex min-h-[70vh]">
            <BidderSidebar />

            <div className="w-full relative">
                <BidderHeader />

                <BidderContainer>
                    <AccountInactiveBanner />
                    <div className="max-w-full pt-16 pb-5 md:pt-0">
                        {firstName && <p className="text-gray-500 mt-5">Welcome back, {firstName}</p>}
                        <h1 className="text-3xl md:text-4xl font-bold text-[#072342] mt-1 mb-2">My Bids</h1>
                    </div>

                    {data.loading ? (
                        <div className="flex justify-center items-center py-12">
                            <LoadingSpinner />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6 pb-12">
                            <AttentionCards items={attentionItems(data)} onChanged={data.reload} />
                            <LotTabs bids={data.bids} watchlist={data.watchlist} offers={data.offers} />
                        </div>
                    )}
                </BidderContainer>
            </div>
        </section>
    );
}

export default Dashboard;
