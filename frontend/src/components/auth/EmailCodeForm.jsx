import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";
import { getGaClientId } from "../../utils/ga.js";
import { isNativeApp } from "../../native/platform";

// Enter the 6-digit code emailed at sign-up (backend
// services/emailVerificationService.js). On success the server signs the
// person in and onVerified gets the same response as a login.
const API = import.meta.env.VITE_DOMAIN_URL;

function EmailCodeForm({ email, onVerified, compact = false }) {
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [wait, setWait] = useState(60); // a code was just sent
    const [error, setError] = useState("");

    useEffect(() => {
        if (wait <= 0) return undefined;
        const t = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(t);
    }, [wait]);

    const submit = async (e) => {
        e?.preventDefault();
        if (!/^\d{6}$/.test(code)) {
            setError("Enter the 6-digit code from the email.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const { data } = await axios.post(
                `${API}/api/v1/users/verify-email`,
                { email, code, gaClientId: getGaClientId(), rememberMe: isNativeApp },
                { withCredentials: true }
            );
            if (data?.success) onVerified(data);
        } catch (err) {
            setError(err?.response?.data?.message || "Something went wrong. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    const resend = async () => {
        try {
            const { data } = await axios.post(`${API}/api/v1/users/resend-verification`, { email });
            if (data.retryAfter) {
                setWait(data.retryAfter);
                toast(data.message);
            } else {
                setWait(60);
                setCode("");
                setError("");
                toast.success("New code sent. Check your inbox.");
            }
        } catch {
            toast.error("Could not send a code. Please try again.");
        }
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <p className={compact ? "text-sm text-gray-700" : "text-gray-700"}>
                We've sent a 6-digit code to <strong className="break-all">{email}</strong>. Enter it below to finish creating your account.
                {" "}It can take a minute to arrive; check your spam folder too.
            </p>
            <label htmlFor="email-code" className="text-sm font-medium text-gray-800">Code</label>
            <input
                id="email-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                className="w-full min-h-[52px] rounded-lg border border-gray-300 px-4 text-center text-2xl tracking-[0.5em] font-semibold focus:ring-2 focus:ring-[#072342] focus:border-transparent"
                placeholder="••••••"
                autoFocus
            />
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="min-h-[48px] rounded-lg bg-[#072342] font-semibold text-white disabled:opacity-50"
            >
                {busy ? "Checking…" : "Confirm email"}
            </button>
            <button
                type="button"
                onClick={resend}
                disabled={wait > 0}
                className="min-h-[44px] text-sm font-medium text-[#A17B35] underline disabled:no-underline disabled:text-gray-400"
            >
                {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
            </button>
        </form>
    );
}

export default EmailCodeForm;
