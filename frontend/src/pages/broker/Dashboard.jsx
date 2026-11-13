import { BrokerContainer, BrokerHeader, BrokerSidebar } from "../../components";
import MyListingsDashboard from "../../components/dashboard/seller/MyListingsDashboard";

// Dashboard home: the seller's listings first (see MyListingsDashboard).
function Dashboard() {
    return (
        <section className="flex min-h-[70vh]">
            <BrokerSidebar />

            <div className="w-full min-w-0 relative">
                <BrokerHeader />

                <BrokerContainer>
                    <div className="pt-16 md:pt-6">
                        <MyListingsDashboard basePath="/broker" />
                    </div>
                </BrokerContainer>
            </div>
        </section>
    );
}

export default Dashboard;
