// Stand-in for the Firebase web SDK. The app gets push notifications through
// the iOS/Android Firebase SDKs, and the website does not use web push, so
// the web SDK is never needed. See vite.config.js.
const unsupported = () => {
    throw new Error('Web push is not used on RexBid');
};
export const getApp = unsupported;
export const getApps = () => [];
export const initializeApp = unsupported;
export const getMessaging = unsupported;
export const getToken = unsupported;
export const deleteToken = unsupported;
export const onMessage = unsupported;
export const isSupported = async () => false;
