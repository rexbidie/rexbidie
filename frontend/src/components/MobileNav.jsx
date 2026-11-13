import { Bell, Gavel, Home, Tractor, UserCircle } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isNativeApp } from "../native/platform";
import { tap } from "../native/haptics";
import useUnreadNotifications from "../hooks/useUnreadNotifications";

function AlertsIcon() {
    const unread = useUnreadNotifications();
    return (
        <span className="relative">
            <Bell />
            {unread > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] leading-[18px] text-center font-semibold">
                    {unread > 99 ? '99+' : unread}
                </span>
            )}
        </span>
    );
}

function MobileNav() {
    const { user } = useAuth();
    const navLinks = [
        { name: 'Home', href: '/', icon: <Home /> },
        { name: 'Listings', href: '/auctions', icon: <Gavel /> },
        { name: 'Sell', href: `${user ? user?.userType !== "bidder" ? `/${user?.userType}/auctions/create` : '/seller/auctions/create' : '/sell'}`, icon: <Tractor /> },
        // The app has a notifications inbox; the website keeps its four tabs.
        ...(isNativeApp && user ? [{ name: 'Alerts', href: '/notifications', icon: <AlertsIcon /> }] : []),
        { name: `${user ? 'Account' : 'Login'}`, href: `/login`, icon: <UserCircle /> },
    ];
    return (
        < nav className="app-bottom-nav lg:hidden fixed bottom-0 w-full bg-white px-5 py-2.5 text-sm [box-shadow:-5px_-5px_10px_rgba(0,0,0,0.2)] z-50" >
            <ul className="flex items-center justify-between md:justify-around">
                {
                    navLinks.map(link => (
                        <li key={link.name}>
                            <NavLink onClick={() => { tap(); link?.onClick?.(); }} to={link?.href} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${(isActive && link.name !== 'Categories') && 'text-secondary'}`}>
                                {link.icon}
                                <span>{link.name}</span>
                            </NavLink>
                        </li>
                    ))
                }
            </ul>
        </nav >
    );
}

export default MobileNav;
