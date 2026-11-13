import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, AlertTriangle, Landmark, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance from "../../utils/axiosInstance";
import { isNativeApp } from "../../native/platform";

/**
 * Seller payouts are paid to a Stripe Express account. This card shows its
 * status and sends the seller to Stripe to set it up or update it.
 * ?stripe=setup (from emails) starts setup straight away; ?stripe=return is
 * where Stripe sends them back.
 */
function StripePayoutCard() {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [params, setParams] = useSearchParams();
    const started = useRef(false);

    const load = useCallback(async () => {
        try {
            const { data } = await axiosInstance.get("/api/v1/stripe-connect/status");
            setStatus(data.data);
            return data.data;
        } catch {
            setStatus({ state: "error" });
            return null;
        }
    }, []);

    const go = useCallback(async (kind) => {
        setBusy(true);
        try {
            const { data } = await axiosInstance.post(`/api/v1/stripe-connect/${kind}`);
            if (isNativeApp) {
                // In the app, Stripe opens in an in-app browser sheet. When the
                // seller closes it, refresh the payout status here.
                const { Browser } = await import("@capacitor/browser");
                const handle = await Browser.addListener("browserFinished", async () => {
                    handle.remove();
                    const s = await load();
                    if (s?.state === "ready") toast.success("Your payout account is ready");
                    setBusy(false);
                });
                await Browser.open({ url: data.data.url, presentationStyle: "fullscreen", toolbarColor: "#072342" });
                return;
            }
            window.location.href = data.data.url;
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not open Stripe. Please try again.");
            setBusy(false);
        }
    }, [load]);

    useEffect(() => {
        const flag = params.get("stripe");
        load().then((s) => {
            if (started.current) return;
            started.current = true;
            if (flag === "setup" && s && s.state !== "ready") go("onboarding-link");
            if (flag === "return") {
                if (s?.state === "ready") toast.success("Your payout account is ready");
                else toast("Stripe still needs a few details. You can finish any time.");
            }
            if (flag) {
                params.delete("stripe");
                setParams(params, { replace: true });
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!status) return null;
    const ready = status.state === "ready";

    return (
        <div className={`rounded-xl border p-5 mb-8 ${ready ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-start gap-3 flex-1">
                    {ready ? <CheckCircle className="text-green-600 shrink-0" /> : <AlertTriangle className="text-amber-600 shrink-0" />}
                    <div>
                        <h3 className="font-semibold text-lg">Stripe payouts</h3>
                        {ready ? (
                            <p className="text-gray-700">
                                Ready to receive payouts
                                {status.bankLast4 ? ` to ${status.bankName || "your bank"} ending ${status.bankLast4}` : ""}.
                            </p>
                        ) : status.state === "incomplete" ? (
                            <p className="text-gray-700">
                                Your payout account needs a few more details before we can pay you
                                {status.requirementsDue ? ` (${status.requirementsDue} item${status.requirementsDue === 1 ? "" : "s"} outstanding)` : ""}.
                            </p>
                        ) : status.state === "error" ? (
                            <p className="text-gray-700">We couldn&rsquo;t check your payout account just now. Please refresh the page.</p>
                        ) : (
                            <p className="text-gray-700">
                                We pay sellers through Stripe, straight to your bank. Set up your payout account so we can pay you as soon as the
                                buyer has paid and collected. It takes about 5 minutes.
                            </p>
                        )}
                    </div>
                </div>
                {status.state !== "error" && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => go(ready ? "dashboard-link" : "onboarding-link")}
                        className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium disabled:opacity-50 ${
                            ready ? "border bg-white text-gray-800" : "bg-primary text-white"
                        }`}
                    >
                        {ready ? <ExternalLink size={16} /> : <Landmark size={16} />}
                        {busy ? "Opening Stripe…" : ready ? "View or update in Stripe" : status.state === "incomplete" ? "Finish setup" : "Set up payouts"}
                    </button>
                )}
            </div>
        </div>
    );
}

export default StripePayoutCard;
