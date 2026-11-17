import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/** "Log out" for profile pages and the app's admin screen (signs out this device only). */
function LogoutButton({ className = '' }) {
    const { logout } = useAuth();
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => {
                logout();
                navigate('/login');
            }}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-secondary font-medium hover:bg-gray-50 ${className}`}
        >
            <LogOut size={18} /> Log out
        </button>
    );
}

export default LogoutButton;
