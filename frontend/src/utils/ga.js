export function getGaClientId() {
    const match = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)/);
    return match ? match[1] : null;
}

// Safe GA4 event helper: no-ops when gtag is missing (blocked, SSR, tests).
export function trackEvent(name, params = {}) {
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', name, params);
        }
    } catch {
        // never let analytics break the UI
    }
}
