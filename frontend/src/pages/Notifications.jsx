import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, Bell, CheckCheck, Clock, CreditCard, Gavel, HelpCircle, Landmark, ShoppingCart, TrendingDown } from 'lucide-react';
import axiosInstance from '../utils/axiosInstance';
import { useAuth } from '../contexts/AuthContext';
import { announceUnreadChanged } from '../native/push';
import { LoadingSpinner } from '../components';

const ICONS = {
    outbid: { icon: TrendingDown, tone: 'text-red-600 bg-red-50' },
    endingSoon: { icon: Clock, tone: 'text-amber-600 bg-amber-50' },
    won: { icon: Award, tone: 'text-green-600 bg-green-50' },
    sold: { icon: Gavel, tone: 'text-green-600 bg-green-50' },
    paymentRequest: { icon: CreditCard, tone: 'text-secondary bg-blue-50' },
    saleReminder: { icon: Clock, tone: 'text-amber-600 bg-amber-50' },
    buyItNow: { icon: ShoppingCart, tone: 'text-primary bg-amber-50' },
    newQuestion: { icon: HelpCircle, tone: 'text-secondary bg-blue-50' },
    questionAnswered: { icon: HelpCircle, tone: 'text-green-600 bg-green-50' },
    buyerPaid: { icon: CreditCard, tone: 'text-green-600 bg-green-50' },
    paidOut: { icon: Landmark, tone: 'text-green-600 bg-green-50' },
};

const timeAgo = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
    return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
};

/** Inbox of app notifications (outbid, won, payments, questions…). */
function Notifications() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (p = 1) => {
        setLoading(true);
        try {
            const { data } = await axiosInstance.get('/api/v1/notifications', { params: { page: p, limit: 20 } });
            setItems((prev) => (p === 1 ? data.data.items : [...prev, ...data.data.items]));
            setPage(p);
            setPages(data.data.pages || 1);
        } catch {
            /* toast is shown by the interceptor for auth problems */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && !user) navigate('/login');
        if (user) load(1);
    }, [user, authLoading, load, navigate]);

    const markAllRead = async () => {
        await axiosInstance.post('/api/v1/notifications/read', {}).catch(() => {});
        setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
        announceUnreadChanged();
    };

    const open = async (n) => {
        if (!n.readAt) {
            axiosInstance.post('/api/v1/notifications/read', { ids: [n._id] }).then(announceUnreadChanged).catch(() => {});
        }
        navigate(n.url || '/');
    };

    const hasUnread = items.some((n) => !n.readAt);

    return (
        <section className="max-w-2xl mx-auto px-4 pt-28 pb-32 min-h-screen">
            <div className="flex items-center justify-between mb-5">
                <h1 className="text-2xl font-bold text-secondary">Notifications</h1>
                {hasUnread && (
                    <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        <CheckCheck size={18} /> Mark all read
                    </button>
                )}
            </div>

            {loading && items.length === 0 ? (
                <LoadingSpinner height="300px" />
            ) : items.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border">
                    <Bell className="mx-auto text-gray-300 mb-3" size={40} />
                    <p className="font-medium text-gray-700">No notifications yet</p>
                    <p className="text-sm text-gray-500 mt-1 px-6">
                        We&rsquo;ll let you know here when you&rsquo;re outbid, win, or have a payment or question to deal with.
                    </p>
                    <Link to="/auctions" className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-primary text-white font-medium">
                        Browse listings
                    </Link>
                </div>
            ) : (
                <ul className="bg-white rounded-xl border divide-y overflow-hidden">
                    {items.map((n) => {
                        const { icon: Icon, tone } = ICONS[n.type] || { icon: Bell, tone: 'text-secondary bg-gray-100' };
                        return (
                            <li key={n._id}>
                                <button
                                    type="button"
                                    onClick={() => open(n)}
                                    className={`w-full flex gap-3 p-4 text-left active:bg-gray-50 ${n.readAt ? '' : 'bg-amber-50/40'}`}
                                >
                                    <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${tone}`}>
                                        <Icon size={20} />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-start justify-between gap-2">
                                            <span className={`text-secondary ${n.readAt ? 'font-medium' : 'font-semibold'}`}>{n.title}</span>
                                            <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{timeAgo(n.createdAt)}</span>
                                        </span>
                                        {n.body && <span className="block text-sm text-gray-600 mt-0.5 line-clamp-2">{n.body}</span>}
                                    </span>
                                    {!n.readAt && <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-primary mt-2" aria-label="Unread" />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {page < pages && (
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => load(page + 1)}
                    className="w-full mt-4 py-3 rounded-lg border bg-white font-medium text-secondary disabled:opacity-50"
                >
                    {loading ? 'Loading…' : 'Show older'}
                </button>
            )}
        </section>
    );
}

export default Notifications;
