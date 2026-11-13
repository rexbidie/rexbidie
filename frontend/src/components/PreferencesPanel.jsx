import { useState, useEffect } from "react";
import { Mail, Smartphone, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { isNativeApp } from "../native/platform";

/**
 * Notification settings. Mirrors backend/src/utils/emailPreferences.js.
 * Payment, auction won, offer accepted, item sold and account emails are
 * always sent and are listed (locked) so people know.
 */
const NOTIFICATION_CATEGORIES = [
    { key: "bidding", label: "Bidding", description: "Bid confirmations, outbid alerts and reserve not met", push: true },
    { key: "reminders", label: "Ending soon", description: "Reminders before lots you bid on or follow close", push: true },
    { key: "watchlist", label: "Watchlist", description: "New bids on lots in your watchlist" },
    { key: "offers", label: "Offers", description: "Offers made, countered, declined or withdrawn" },
    { key: "buyItNow", label: "Last Chance", description: "Lots you bid on or follow going on Last Chance (fixed price for 48 hours after the auction)", push: true },
    { key: "questions", label: "Questions", description: "Questions and answers on listings", push: true },
    { key: "myListings", label: "My listings (sellers)", description: "New bids, approvals, reserve tips and Last Chance for your own listings" },
    { key: "newListings", label: "New listings", description: "Alerts about newly listed machinery" },
    { key: "news", label: "News and offers from RexBid", description: "Occasional updates, sale dates and promotions" },
];

const ALWAYS_SENT = [
    "Payment requests, reminders and receipts",
    "Auction won",
    "Offer accepted",
    "Your item sold, buyer paid and payouts",
    "Account and security (password reset, approval)",
];

function Switch({ on, onClick, disabled, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${on ? "bg-orange-500" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
        >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
        </button>
    );
}

const read = (prefs) => ({
    emailUpdates: prefs?.emailUpdates ?? true,
    email: Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.key, prefs?.email?.[c.key] ?? true])),
    push: Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.key, prefs?.push?.[c.key] ?? true])),
});

const PreferencesPanel = ({ initialPreferences, onSave, saving: externalSaving }) => {
    const [prefs, setPrefs] = useState(() => read(initialPreferences));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setPrefs(read(initialPreferences));
    }, [initialPreferences]);

    const save = async (next, update, message) => {
        const prev = prefs;
        setPrefs(next); // optimistic
        setSaving(true);
        try {
            const ok = await onSave(update);
            if (!ok) throw new Error("save failed");
            toast.success(message);
        } catch {
            setPrefs(prev);
            toast.error("Failed to update preference");
        } finally {
            setSaving(false);
        }
    };

    const toggleAll = () => {
        const on = !prefs.emailUpdates;
        save({ ...prefs, emailUpdates: on }, { emailUpdates: on }, on ? "Optional emails turned on" : "Optional emails turned off");
    };

    const toggle = (channel, key, label) => {
        const on = !prefs[channel][key];
        save(
            { ...prefs, [channel]: { ...prefs[channel], [key]: on } },
            { [channel]: { [key]: on } },
            `${label} ${channel === "push" ? "app notifications" : "emails"} ${on ? "on" : "off"}`,
        );
    };

    const busy = saving || externalSaving;
    const showPush = isNativeApp;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="pr-4">
                    <p className="font-medium">Optional emails</p>
                    <p className="text-sm text-gray-500">Turn off to stop every email below in one go</p>
                </div>
                <Switch on={prefs.emailUpdates} onClick={toggleAll} disabled={busy} label="All optional emails" />
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-end gap-6 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <span className="flex items-center gap-1 w-12 justify-center"><Mail size={14} /> Email</span>
                    {showPush && <span className="flex items-center gap-1 w-12 justify-center"><Smartphone size={14} /> App</span>}
                </div>
                <ul className="divide-y divide-gray-200">
                    {NOTIFICATION_CATEGORIES.map((c) => (
                        <li key={c.key} className="flex items-center gap-4 px-4 py-3">
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-secondary">{c.label}</p>
                                <p className="text-sm text-gray-500">{c.description}</p>
                            </div>
                            <Switch
                                on={prefs.emailUpdates && prefs.email[c.key]}
                                onClick={() => toggle("email", c.key, c.label)}
                                disabled={busy || !prefs.emailUpdates}
                                label={`${c.label} emails`}
                            />
                            {showPush && (
                                c.push ? (
                                    <Switch on={prefs.push[c.key]} onClick={() => toggle("push", c.key, c.label)} disabled={busy} label={`${c.label} app notifications`} />
                                ) : (
                                    <span className="w-12 text-center text-gray-300" title="No app notifications for this">–</span>
                                )
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="rounded-lg p-4 bg-gray-50 border border-gray-200">
                <p className="flex items-center gap-2 font-medium text-secondary">
                    <Lock size={16} /> Always sent
                </p>
                <p className="text-sm text-gray-600 mt-1">These are part of buying and selling, so they can&rsquo;t be turned off:</p>
                <ul className="mt-2 text-sm text-gray-600 list-disc pl-5 space-y-0.5">
                    {ALWAYS_SENT.map((t) => <li key={t}>{t}</li>)}
                </ul>
                {showPush && (
                    <p className="text-sm text-gray-500 mt-2">
                        To stop all app notifications, turn them off for RexBid in your phone&rsquo;s Settings.
                    </p>
                )}
            </div>
        </div>
    );
};

export default PreferencesPanel;
