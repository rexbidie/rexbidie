import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isNativeApp } from '../../native/platform';

/**
 * Connects the app's native events to the website code. Rendered only inside
 * the app, inside the router.
 *  - opens pages asked for by notification taps and rexbid.ie links
 *  - registers the phone for push notifications whenever someone is signed in
 */
function NativeBridge() {
    const navigate = useNavigate();
    const { user } = useAuth();

    useEffect(() => {
        const onNavigate = (e) => {
            const path = e.detail;
            if (typeof path === 'string' && path.startsWith('/')) navigate(path);
        };
        window.addEventListener('rexbid:navigate', onNavigate);
        return () => window.removeEventListener('rexbid:navigate', onNavigate);
    }, [navigate]);

    useEffect(() => {
        if (!isNativeApp || !user?._id) return;
        // Small delay so the permission question appears after the dashboard loads.
        const t = setTimeout(() => {
            import('../../native/push').then((m) => m.registerPushForUser());
        }, 1500);
        return () => clearTimeout(t);
    }, [user?._id]);

    return null;
}

export default NativeBridge;
