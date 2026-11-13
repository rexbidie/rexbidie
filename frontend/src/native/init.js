import { isNativeApp, navigateInApp, platform, toAppPath } from './platform';
import { announceUnreadChanged, initPush } from './push';

/**
 * Start-up for the iPhone / Android app. Runs once, only inside the app.
 */
export const initNativeApp = async () => {
    if (!isNativeApp) return;
    const root = document.documentElement;
    root.classList.add('is-app', `is-${platform}`);

    const [{ App }, { StatusBar, Style }, { Browser }, { SplashScreen }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/status-bar'),
        import('@capacitor/browser'),
        import('@capacitor/splash-screen'),
    ]);

    // Dark status-bar text on the white header.
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});

    // rexbid.ie links opened from emails, texts or other apps (once universal
    // links / app links are switched on; see docs/MOBILE-APP.md).
    App.addListener('appUrlOpen', ({ url }) => {
        const path = toAppPath(url);
        if (path) navigateInApp(path);
    });

    // Android back button: go back, or leave the app from the first page.
    App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && window.history.length > 1) window.history.back();
        else App.minimizeApp();
    });

    // Coming back to the app: refresh the notification count.
    App.addListener('resume', () => announceUnreadChanged());

    // Links to other websites open in the in-app browser, not inside the app.
    const openOutside = (url) => Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#072342' });
    const isOutside = (href) => {
        try {
            const u = new URL(href, window.location.href);
            if (!/^https?:$/.test(u.protocol)) return false; // mailto:, tel:, etc. are handled by the phone
            return u.host !== window.location.host;
        } catch {
            return false;
        }
    };
    document.addEventListener(
        'click',
        (e) => {
            const a = e.target?.closest?.('a[href]');
            if (!a || e.defaultPrevented) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#') || !isOutside(href)) return;
            e.preventDefault();
            const inside = toAppPath(href);
            // Absolute links to our own site (e.g. https://rexbid.ie/faqs) stay in the app,
            // except the PDF policy, which the browser shows better.
            if (inside && !/\.pdf($|\?)/i.test(inside)) navigateInApp(inside);
            else openOutside(new URL(href, window.location.href).toString());
        },
        true,
    );
    const nativeOpen = window.open.bind(window);
    window.open = (url, target, features) => {
        if (url && isOutside(url)) {
            const inside = toAppPath(url);
            if (inside && !/\.pdf($|\?)/i.test(inside)) navigateInApp(inside);
            else openOutside(new URL(url, window.location.href).toString());
            return null;
        }
        return nativeOpen(url, target, features);
    };

    await initPush();
    SplashScreen.hide().catch(() => {});
};
