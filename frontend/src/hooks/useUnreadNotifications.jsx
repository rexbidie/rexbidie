import { useEffect, useState } from 'react';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import { onUnreadChanged, setAppBadge } from '../native/push';

/** Number of unread notifications for the signed-in user (0 when signed out). */
function useUnreadNotifications() {
    const { user } = useAuth();
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        if (!user?._id) {
            setUnread(0);
            return undefined;
        }
        let alive = true;
        const load = async () => {
            if (document.hidden) return;
            try {
                const { data } = await axiosInstance.get('/api/v1/notifications/unread-count');
                if (!alive) return;
                const n = data?.data?.unread || 0;
                setUnread(n);
                setAppBadge(n);
            } catch {
                /* keep the last count */
            }
        };
        load();
        const off = onUnreadChanged(load);
        const timer = setInterval(load, 60_000);
        return () => {
            alive = false;
            off();
            clearInterval(timer);
        };
    }, [user?._id]);

    return unread;
}

export default useUnreadNotifications;
