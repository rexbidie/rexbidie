import { CompanyContainer, CompanyHeader, CompanySidebar } from "../../components";
import MyListingsDashboard from "../../components/dashboard/seller/MyListingsDashboard";

// Dashboard home: the seller's listings first (see MyListingsDashboard).
function Dashboard() {
    return (
        <section className="flex min-h-[70vh]">
            <CompanySidebar />

            <div className="w-full min-w-0 relative">
                <CompanyHeader />

                <CompanyContainer>
                    <div className="pt-16 md:pt-6">
                        <MyListingsDashboard basePath="/company" />
                    </div>
                </CompanyContainer>
            </div>
        </section>
    );
}

export default Dashboard;
