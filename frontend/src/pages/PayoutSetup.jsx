// The emailed payout setup link: goes straight to Stripe's onboarding for the
// seller, no RexBid sign-in. /payout-setup/done is where Stripe sends them back.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";

export default function PayoutSetup() {
    const { token } = useParams();
    const done = token === "done";
    const [error, setError] = useState("");

    useEffect(() => {
        if (done) return;
        axiosInstance.get(`/api/v1/stripe-connect/setup/${encodeURIComponent(token)}`)
            .then(({ data }) => window.location.replace(data.data.url))
            .catch((e) => setError(e?.response?.data?.message || "Something went wrong. Please try the link again in a minute."));
    }, [token, done]);

    return (
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
            <div className="max-w-md w-full rounded-2xl border bg-white p-8 text-center shadow-sm">
                {done ? (
                    <>
                        <CheckCircle2 className="mx-auto text-green-600" size={44} />
                        <h1 className="mt-4 text-2xl font-bold text-[#072342]">Thanks, you&rsquo;re all set</h1>
                        <p className="mt-2 text-gray-600">
                            Your payout details have gone to Stripe. If Stripe needs anything else it will email you.
                            We&rsquo;ll pay you as soon as the buyer has paid and collected.
                        </p>
                    </>
                ) : error ? (
                    <>
                        <h1 className="text-2xl font-bold text-[#072342]">Payout setup</h1>
                        <p className="mt-3 text-gray-700">{error}</p>
                        <p className="mt-2 text-sm text-gray-500">Contact RexBid at info@rexbid.ie if this keeps happening.</p>
                    </>
                ) : (
                    <>
                        <Loader2 className="mx-auto animate-spin text-[#D19F3E]" size={40} />
                        <h1 className="mt-4 text-xl font-bold text-[#072342]">Taking you to Stripe…</h1>
                        <p className="mt-2 text-gray-600">RexBid pays sellers through Stripe, straight to your bank account.</p>
                    </>
                )}
            </div>
        </div>
    );
}
