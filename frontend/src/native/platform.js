import { Capacitor } from '@capacitor/core';

/** True inside the iPhone / Android app, false on the website. */
export const isNativeApp = Capacitor.isNativePlatform();

/** 'ios', 'android' or 'web'. */
export const platform = Capacitor.getPlatform();

/** True when this bundle was built for the app (npm run app:build). */
export const IS_APP_BUILD = import.meta.env.VITE_APP === 'true';

/** Public website address, used for share links. */
export const SITE_URL = 'https://rexbid.ie';

/**
 * Ask the app to open a page (from outside React, e.g. a notification tap).
 * NativeBridge listens for this and uses the router.
 */
export const navigateInApp = (path) => {
    if (!path) return;
    window.dispatchEvent(new CustomEvent('rexbid:navigate', { detail: path }));
};

/** Turn https://rexbid.ie/auction/1?x=y into /auction/1?x=y; other sites return null. */
export const toAppPath = (url) => {
    try {
        const u = new URL(url, SITE_URL);
        if (!/(^|\.)rexbid\.ie$/i.test(u.hostname) && !['localhost', 'capacitor'].includes(u.hostname)) return null;
        return `${u.pathname}${u.search}${u.hash}` || '/';
    } catch {
        return null;
    }
};
