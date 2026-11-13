// Small display helpers for the bidder dashboard.

export const money = (amount, currency = "EUR") =>
    amount || amount === 0
        ? `${currency === "GBP" ? "£" : "€"}${Number(amount).toLocaleString("en-IE", { maximumFractionDigits: 0 })}`
        : "–";

/** "Ends in 2d 4h", "Ends in 3h 12m", "Ended" */
export const endsLabel = (endTime, now = Date.now()) => {
    const ms = new Date(endTime).getTime() - now;
    if (!Number.isFinite(ms)) return "";
    if (ms <= 0) return "Ended";
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    if (h >= 24) return `Ends in ${Math.floor(h / 24)}d ${h % 24}h`;
    if (h >= 1) return `Ends in ${h}h ${m}m`;
    return `Ends in ${Math.max(1, m)}m`;
};
