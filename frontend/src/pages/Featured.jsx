import FeaturedListings from "../components/FeaturedListings";

// All featured listings (from the home page's "See all featured").
function Featured() {
    return (
        <div className="min-h-[60vh] pt-4 md:pt-8">
            <FeaturedListings page />
        </div>
    );
}

export default Featured;
