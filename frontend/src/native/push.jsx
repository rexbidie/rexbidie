import toast from 'react-hot-toast';
import axiosInstance from '../utils/axiosInstance';
import { isNativeApp, navigateInApp, platform } from './platform';
import * as haptics from './haptics';

/**
 * Push notifications in the app (Firebase Cloud Messaging on iOS and Android).
 *
 * - Listeners are set up once at start-up (initPush).
 * - Permission is asked after the user signs in, not on first launch, so the
 *   question makes sense ("get notified when you're outbid").
 * - The device token is sent to the backend, which pushes alongside the
 *   existing emails (backend/src/utils/push.js).
 */

const TOKEN_KEY = 'pushToken';
const UNREAD_EVENT = 'rexbid:unread-changed';

// Note: a Capacitor plugin object must never be the *result* of an async
// function (await would try to call plugin.then), so it is wrapped.
let messaging;
const getMessaging = async () => {
    if (!messaging) messaging = (await import('@capacitor-firebase/messaging')).FirebaseMessaging;
    return { FirebaseMessaging: messaging };
};

/** Tell the bell/badge to refresh. */
export const announceUnreadChanged = () => window.dispatchEvent(new Event(UNREAD_EVENT));
export const onUnreadChanged = (fn) => {
    window.addEventListener(UNREAD_EVENT, fn);
    return () => window.removeEventListener(UNREAD_EVENT, fn);
};

/** Set the number on the app icon (iPhone and supported Android launchers). */
export const setAppBadge = async (count) => {
    if (!isNativeApp) return;
    try {
        const { Badge } = await import('@capawesome/capacitor-badge');
        if (count > 0) await Badge.set({ count });
        else await Badge.clear();
    } catch {
        /* not supported on this phone */
    }
};

const urlFrom = (notification) => {
    const data = notification?.data || {};
    return typeof data.url === 'string' && data.url.startsWith('/') ? data.url : null;
};

let initialised = false;
export const initPush = async () => {
    if (!isNativeApp || initialised) return;
    initialised = true;
    try {
        const { FirebaseMessaging } = await getMessaging();

        if (platform === 'android') {
            await FirebaseMessaging.createChannel({
                id: 'rexbid_default',
                name: 'Auctions and payments',
                description: 'Outbid alerts, auction results, payments and questions',
                importance: 4, // high: shows a banner
                vibration: true,
            }).catch(() => {});
        }

        // Tapped a notification (app in background or closed).
        await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
            const url = urlFrom(notification);
            announceUnreadChanged();
            if (url) navigateInApp(url);
        });

        // Arrived while the app is open: show it as a toast instead.
        await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
            const url = urlFrom(notification);
            const type = notification?.data?.type;
            if (type === 'outbid') haptics.outbid();
            else if (type === 'won') haptics.won();
            else haptics.tap();
            announceUnreadChanged();
            toast(
                (t) => (
                    <button
                        type="button"
                        className="text-left"
                        onClick={() => {
                            toast.dismiss(t.id);
                            if (url) navigateInApp(url);
                        }}
                    >
                        <strong className="block">{notification?.title}</strong>
                        {notification?.body && <span className="text-sm text-gray-600">{notification.body}</span>}
                    </button>
                ),
                { duration: 6000, icon: '🔔' },
            );
        });

        // Firebase replaced the token: tell the backend.
        await FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
            if (token && localStorage.getItem('accessToken')) sendToken(token);
        });
    } catch (err) {
        console.warn('[push] init failed', err);
    }
};

const sendToken = async (token) => {
    try {
        await axiosInstance.post('/api/v1/notifications/devices', {
            token,
            platform,
            appVersion: import.meta.env.VITE_APP_VERSION || undefined,
        });
        localStorage.setItem(TOKEN_KEY, token);
    } catch (err) {
        console.warn('[push] could not register device', err?.message);
    }
};

/**
 * Call when a user is signed in. Asks permission the first time, then
 * registers this phone. Safe to call often.
 */
export const registerPushForUser = async () => {
    if (!isNativeApp || !localStorage.getItem('accessToken')) return;
    try {
        const { FirebaseMessaging } = await getMessaging();
        let { receive } = await FirebaseMessaging.checkPermissions();
        if (receive === 'prompt' || receive === 'prompt-with-rationale') {
            ({ receive } = await FirebaseMessaging.requestPermissions());
        }
        if (receive !== 'granted') return;
        const { token } = await FirebaseMessaging.getToken();
        if (token) await sendToken(token);
    } catch (err) {
        // Most likely Firebase isn't configured in this build yet.
        console.warn('[push] registration skipped:', err?.message);
    }
};

/**
 * Call on sign-out, BEFORE the login token is removed, so this phone stops
 * receiving the previous user's notifications.
 */
export const unregisterPush = (accessToken) => {
    if (!isNativeApp) return;
    const token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setAppBadge(0);
    if (!token || !accessToken) return;
    axiosInstance
        .delete('/api/v1/notifications/devices', {
            data: { token },
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        .catch(() => {});
    getMessaging()
        .then(({ FirebaseMessaging }) => FirebaseMessaging.deleteToken())
        .catch(() => {});
};
