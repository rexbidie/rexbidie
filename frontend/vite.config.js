import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The website build is unchanged. `vite build --mode app` builds the iPhone /
// Android app (see docs/MOBILE-APP.md), which:
//  - leaves out the admin dashboard (admins use the website),
//  - leaves out the cookie banner, Google Analytics and Meta Pixel, which are
//    website-only (the app collects no advertising data),
//  - draws under the notch / home bar so safe-area spacing can be applied.
const START = '<!-- Consent (GDPR / ePrivacy)';
const END = '<!-- End Meta Pixel Code -->';

const appHtml = () => ({
    name: 'rexbid-app-html',
    transformIndexHtml(html) {
        const a = html.indexOf(START);
        const b = html.indexOf(END);
        if (a !== -1 && b !== -1) {
            html = html.slice(0, a)
                + '<script>window.dataLayer=[];window.gtag=function(){};window.fbq=function(){};</script>\n'
                + html.slice(b + END.length);
        }
        return html.replace(
            'content="width=device-width, initial-scale=1.0"',
            'content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
        );
    },
});

// In the app build, admin pages are swapped for an empty module so none of
// their code ships inside the app (the /admin routes are not registered there).
const ADMIN_STUB = '\0rexbid-admin-stub';
const dropAdminPages = () => ({
    name: 'rexbid-drop-admin-pages',
    enforce: 'pre',
    async resolveId(source, importer, options) {
        if (!importer || !/pages\/admin\//.test(source)) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (resolved && /[\\/]src[\\/]pages[\\/]admin[\\/]/.test(resolved.id)) return ADMIN_STUB;
        return null;
    },
    load(id) {
        return id === ADMIN_STUB ? 'export default function AdminPageNotInApp() { return null; }' : null;
    },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [
        react(),
        ...(mode === 'app' ? [appHtml(), dropAdminPages()] : []),
    ],
    resolve: {
        alias: {
            // Push notifications use the phones' own Firebase SDKs; the web
            // version of the plugin (and the Firebase web SDK) is never used.
            'firebase/messaging': fileURLToPath(new URL('./src/native/firebaseWebStub.js', import.meta.url)),
            'firebase/app': fileURLToPath(new URL('./src/native/firebaseWebStub.js', import.meta.url)),
        },
    },
}));
