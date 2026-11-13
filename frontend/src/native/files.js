import { isNativeApp } from './platform';

const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

/**
 * In the app, PDFs (payment requests, receipts, statements) can't open in a
 * new browser tab. Save the file and open the phone's share sheet, which
 * previews it and offers Save to Files, Print, Mail, WhatsApp, etc.
 */
export const openPdfBlobInApp = async (blob, filename = 'document.pdf') => {
    if (!isNativeApp) return false;
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
    ]);
    const safeName = String(filename).replace(/[^\w.-]+/g, '_') || 'document.pdf';
    const { uri } = await Filesystem.writeFile({
        path: safeName,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
    });
    await Share.share({ title: safeName, files: [uri], dialogTitle: 'Open document' });
    return true;
};

/** Open an external website in the in-app browser (Safari / Chrome sheet). */
export const openExternal = async (url) => {
    if (!isNativeApp) {
        window.open(url, '_blank', 'noopener');
        return;
    }
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#072342' });
};
