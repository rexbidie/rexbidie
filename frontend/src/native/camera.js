import { isNativeApp } from './platform';

const toFile = async (webPath, format = 'jpeg', index = 0) => {
    const blob = await (await fetch(webPath)).blob();
    const ext = format === 'png' ? 'png' : format === 'heic' ? 'heic' : 'jpg';
    const type = blob.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
    return new File([blob], `photo-${Date.now()}-${index}.${ext}`, { type, lastModified: Date.now() });
};

/**
 * Take a photo with the phone camera. Returns a File (like a file picker
 * would), already resized to a sensible size for listings, or null if the
 * user cancelled.
 */
export const takePhoto = async () => {
    if (!isNativeApp) return null;
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    try {
        const photo = await Camera.getPhoto({
            source: CameraSource.Camera,
            resultType: CameraResultType.Uri,
            quality: 85,
            width: 2400,
            correctOrientation: true,
            saveToGallery: true,
        });
        return photo?.webPath ? toFile(photo.webPath, photo.format) : null;
    } catch (err) {
        if (/cancel/i.test(err?.message || '')) return null;
        throw err;
    }
};

/** Pick several photos from the phone's library. Returns File[] ([] if cancelled). */
export const pickPhotos = async (limit = 20) => {
    if (!isNativeApp) return [];
    const { Camera } = await import('@capacitor/camera');
    try {
        const { photos } = await Camera.pickImages({ quality: 85, width: 2400, limit, correctOrientation: true });
        return Promise.all((photos || []).map((p, i) => toFile(p.webPath, p.format, i)));
    } catch (err) {
        if (/cancel/i.test(err?.message || '')) return [];
        throw err;
    }
};
