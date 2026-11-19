// Remembers (per browser) that someone has signed in here before, so the bid
// popup can open on "Log in" for returning people and "Create account" for
// everyone else. Only a "1" flag is stored: no personal data.
const KEY = 'rb_has_account';

export function markHasAccount() {
    try {
        localStorage.setItem(KEY, '1');
    } catch {
        // storage blocked (private mode etc.): fall back to the default tab
    }
}

export function hasAccountOnDevice() {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
}
