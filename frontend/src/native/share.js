import toast from 'react-hot-toast';
import { isNativeApp, SITE_URL } from './platform';

/**
 * Share a page (opens the phone's share sheet: WhatsApp, Messages, Facebook…).
 * Links always point at rexbid.ie, so they show the listing preview and open
 * in the app for anyone who has it.
 * On the website it uses the browser's share sheet if there is one, otherwise
 * copies the link.
 */
export const shareLink = async ({ title, text, path }) => {
    const url = `${SITE_URL}${path || ''}`;
    try {
        if (isNativeApp) {
            const { Share } = await import('@capacitor/share');
            await Share.share({ title, text, url, dialogTitle: 'Share' });
            return true;
        }
        if (navigator.share) {
            await navigator.share({ title, text, url });
            return true;
        }
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
        return true;
    } catch (err) {
        // Closing the share sheet is not an error.
        if (err?.name === 'AbortError' || /cancel/i.test(err?.message || '')) return false;
        toast.error('Could not share this page');
        return false;
    }
};
