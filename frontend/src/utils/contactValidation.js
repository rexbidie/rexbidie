// Phone and post code checks for sign-up (bid popup and /register).
// Keep in sync with backend/src/utils/contactValidation.js.

// Eircode: routing key (letter + 2 digits, or D6W) + 4-character unique identifier,
// which only uses 0-9 and A C D E F H K N P R T V W X Y.
export const EIRCODE = /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}$/i;
// UK postcode (includes Northern Ireland's BT postcodes).
export const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

/** "D02X285" → "D02 X285"; "bt15gs" → "BT1 5GS". Returns null if it isn't a valid Eircode or UK postcode. */
export const normalisePostcode = (raw) => {
    const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    if (EIRCODE.test(s)) return `${s.slice(0, 3)} ${s.slice(3)}`;
    if (UK_POSTCODE.test(s)) return `${s.slice(0, -3)} ${s.slice(-3)}`;
    return null;
};

/** Region implied by a valid post code: ROI (Eircode), NI (BT…) or GB. */
export const regionFromPostcode = (postcode) => {
    const p = normalisePostcode(postcode);
    if (!p) return null;
    if (EIRCODE.test(p)) return "ROI";
    return p.startsWith("BT") ? "NI" : "GB";
};

/**
 * Irish or UK phone number, mobile or landline, local or international format.
 * Returns it in international form (+353…, +44…) or null if it doesn't look real.
 */
export const normalisePhone = (raw) => {
    let s = String(raw || "").replace(/[\s().-]/g, "");
    if (s.startsWith("00")) s = `+${s.slice(2)}`;
    s = s.replace(/^\+3530/, "+353").replace(/^\+440/, "+44"); // "+353 087…" → "+353 87…"
    if (/^\+353\d{7,9}$/.test(s)) return s;
    if (/^\+44\d{9,10}$/.test(s)) return s;
    if (/^0[1-9]\d{6,9}$/.test(s)) return s; // local IE/UK number: country unknown, keep as typed
    if (/^\+[1-9]\d{7,14}$/.test(s)) return s; // other countries (E.164)
    return null;
};
