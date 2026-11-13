import { isNativeApp } from './platform';

// Small vibrations for key moments. Do nothing on the website.
const run = async (fn) => {
    if (!isNativeApp) return;
    try {
        const mod = await import('@capacitor/haptics');
        await fn(mod);
    } catch {
        /* haptics are a nicety; never fail because of them */
    }
};

/** Light tap, e.g. when a button is pressed. */
export const tap = () => run(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));

/** Your bid was placed. */
export const bidPlaced = () => run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }));

/** Someone outbid you. */
export const outbid = () => run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }));

/** You won. */
export const won = async () => {
    await run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }));
    setTimeout(() => run(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Heavy })), 180);
};

/** Something went wrong. */
export const error = () => run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Error }));
