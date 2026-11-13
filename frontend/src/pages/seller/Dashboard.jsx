import { SellerContainer, SellerHeader, SellerSidebar } from "../../components";
import MyListingsDashboard from "../../components/dashboard/seller/MyListingsDashboard";

// Dashboard home: the seller's listings first (see MyListingsDashboard).
function Dashboard() {
    return (
        <section className="flex min-h-[70vh]">
            <SellerSidebar />

            <div className="w-full min-w-0 relative">
                <SellerHeader />

                <SellerContainer>
                    <div className="pt-16 md:pt-6">
                        <MyListingsDashboard basePath="/seller" />
                    </div>
                </SellerContainer>
            </div>
        </section>
    );
}

export default Dashboard;
