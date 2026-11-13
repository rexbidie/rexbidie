import { isNativeApp } from './platform';

/**
 * Face ID / Touch ID / fingerprint sign-in for the app.
 *
 * After a normal sign-in the user can choose to turn it on. Their email and
 * password are then kept in the phone's secure Keychain (iPhone) or Keystore
 * (Android), locked to the fingerprints / face enrolled right now. Nothing
 * is sent to RexBid's servers. Adding a new fingerprint or face removes them;
 * signing out keeps them, so signing back in is one tap.
 */

const SERVER = 'rexbid.ie';
const ENABLED_KEY = 'biometricLoginEmail';
const DECLINED_KEY = 'biometricLoginDeclined';

const plugin = async () => (await import('@capgo/capacitor-native-biometric'));

/** { available, label } where label is 'Face ID', 'Touch ID' or 'fingerprint'. */
export const biometricInfo = async () => {
    if (!isNativeApp) return { available: false, label: '' };
    try {
        const { NativeBiometric, BiometryType } = await plugin();
        const res = await NativeBiometric.isAvailable({ useFallback: false });
        if (!res?.isAvailable) return { available: false, label: '' };
        const label = {
            [BiometryType.FACE_ID]: 'Face ID',
            [BiometryType.TOUCH_ID]: 'Touch ID',
            [BiometryType.FACE_AUTHENTICATION]: 'face unlock',
        }[res.biometryType] || 'fingerprint';
        return { available: true, label };
    } catch {
        return { available: false, label: '' };
    }
};

/** Email of the account saved for quick sign-in on this phone, if any. */
export const savedBiometricEmail = () => (isNativeApp ? localStorage.getItem(ENABLED_KEY) : null);

/** Should we offer to turn it on after this sign-in? */
export const shouldOfferBiometric = (email) =>
    isNativeApp && !savedBiometricEmail() && localStorage.getItem(DECLINED_KEY) !== String(email || '').toLowerCase();

export const declineBiometric = (email) => localStorage.setItem(DECLINED_KEY, String(email || '').toLowerCase());

export const enableBiometric = async (email, password) => {
    const { NativeBiometric, AccessControl } = await plugin();
    await NativeBiometric.setCredentials({
        username: String(email).toLowerCase(),
        password,
        server: SERVER,
        accessControl: AccessControl.BIOMETRY_CURRENT_SET,
    });
    localStorage.setItem(ENABLED_KEY, String(email).toLowerCase());
    localStorage.removeItem(DECLINED_KEY);
};

/** Shows the Face ID / fingerprint prompt and returns { email, password }. */
export const getBiometricCredentials = async () => {
    const { NativeBiometric } = await plugin();
    try {
        const c = await NativeBiometric.getSecureCredentials({
            server: SERVER,
            reason: 'Sign in to RexBid',
            title: 'Sign in to RexBid',
        });
        return { email: c.username, password: c.password };
    } catch (err) {
        // Code 21: the saved sign-in was wiped (e.g. a new fingerprint was added).
        if (String(err?.code) === '21') await disableBiometric();
        throw err;
    }
};

export const disableBiometric = async () => {
    localStorage.removeItem(ENABLED_KEY);
    if (!isNativeApp) return;
    try {
        const { NativeBiometric } = await plugin();
        await NativeBiometric.deleteCredentials({ server: SERVER });
    } catch {
        /* nothing saved */
    }
};
