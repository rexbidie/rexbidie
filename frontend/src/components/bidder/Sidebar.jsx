import {
    LayoutDashboard,
    LogOut,
    Gavel,
    Award,
    TrendingUp,
    User,
    Bell,
    X,
    Menu,
    Bookmark,
    CreditCard,
    Hand,
    FileText,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { logo } from "../../assets";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

const navigation = [
    { name: 'My Bids', path: '/bidder/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Watchlist', path: '/bidder/watchlist', icon: <Bookmark size={20} /> },
    { name: 'My Offers', path: '/bidder/offers', icon: <Hand size={20} /> },
    { name: 'Won Auctions', path: '/bidder/auctions/won', icon: <Award size={20} /> },
    { name: 'Documents', path: '/bidder/documents', icon: <FileText size={20} /> },
    { name: 'Browse Auctions', path: '/bidder/auctions/active', icon: <Gavel size={20} /> },
    { name: 'Bid History', path: '/bidder/bids', icon: <TrendingUp size={20} /> },
    { name: 'Billing', path: '/bidder/billing', icon: <CreditCard size={20} /> },
    // { name: 'Notifications', path: '/bidder/notifications', icon: <Bell size={20} /> },
    { name: 'Profile', path: '/bidder/profile', icon: <User size={20} /> },
];

function Sidebar() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const { logout } = useAuth();

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) {
                setIsOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Prevent body scrolling when sidebar is open on mobile
    useEffect(() => {
        if (isOpen && isMobile) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, isMobile]);

    const toggleSidebar = () => {
        setIsOpen(!isOpen);
    }

    return (
        <>
            {/* Mobile menu button */}
            <button
                onClick={toggleSidebar}
                className={`md:hidden ${isOpen && isMobile ? 'hidden' : 'fixed'} top-4 left-4 z-30 sm:z-40 p-2 rounded-md bg-[#1e2d3b] text-white`}
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Overlay for mobile */}
            {isOpen && isMobile && (
                <div
                    className="fixed inset-0 bg-[#1e2d3b] bg-opacity-50 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed md:relative w-64 bg-gradient-to-b from-[#072342] to-[#0a2a4a] text-white h-[100dvh] md:h-auto md:min-h-screen overflow-hidden z-50 p-4 flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Logo/Brand */}
                <div className="px-4 mb-8 flex items-center justify-between pb-2 border-b border-gray-700 shrink-0">
                    <Link to={'/'}>
                        <img src={logo} className="h-10 md:h-12" alt="logo" />
                    </Link>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="md:hidden text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto min-h-0">
                    <ul className="space-y-2">
                        {navigation.map((link, i) => (
                            <li key={i}>
                                <NavLink
                                    to={link.path}
                                    onClick={() => isMobile && setIsOpen(false)}
                                    className={({ isActive }) =>
                                        `flex items-center p-3 rounded-lg transition-all duration-200 ${isActive
                                            ? 'bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] text-white shadow-lg'
                                            : 'text-white hover:bg-gradient-to-r hover:from-[#D19F3E]/90 hover:to-[#E8B86B]/90 hover:text-white'
                                        }`
                                    }
                                >
                                    <span className="mr-3">{link.icon}</span>
                                    <span>{link.name}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
                {/* Pinned footer */}
                <div className="shrink-0 pt-3 mt-3 border-t border-gray-700">
                    <button
                        onClick={logout}
                        className="flex items-center w-full p-3 rounded-lg text-white hover:bg-red-600 transition-all duration-200"
                    >
                        <LogOut size={20} className="mr-3" />
                        <span>Log Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;