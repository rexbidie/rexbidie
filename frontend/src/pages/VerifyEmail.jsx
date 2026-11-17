import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import EmailCodeForm from "../components/auth/EmailCodeForm";
import { useAuth } from "../contexts/AuthContext";
import { trackMetaRegistration } from "../utils/metaPixel.js";

// Step after sign-up (or a login before the email was confirmed):
// /verify-email?email=...&new=1
function VerifyEmail() {
    const [params] = useSearchParams();
    const email = (params.get("email") || "").trim();
    const isNew = params.get("new") === "1";
    const navigate = useNavigate();
    const { setUser } = useAuth();

    const onVerified = (data) => {
        const { user, accessToken, refreshToken } = data.data;
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        localStorage.setItem("user", JSON.stringify(user));
        setUser(user);
        if (isNew) {
            // Count the sign-up once the email is confirmed (was at sign-up before).
            trackMetaRegistration(user.userType, user.currency);
            if (typeof window.gtag === "function") window.gtag("event", "sign_up", { user_type: user.userType, method: "email" });
        }
        toast.success(data.message || "Email confirmed");
        navigate(`/${user.userType}/dashboard`);
    };

    return (
        <section className="min-h-[70vh] flex items-start justify-center px-4 py-10 md:py-16 bg-gray-50">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
                <h1 className="text-2xl md:text-3xl font-bold text-[#072342] mb-4">Confirm your email</h1>
                {email ? (
                    <EmailCodeForm email={email} onVerified={onVerified} />
                ) : (
                    <p className="text-gray-700">
                        Please <Link to="/login" className="underline font-semibold">log in</Link> to get a new code.
                    </p>
                )}
                <p className="mt-6 text-sm text-gray-500">
                    Wrong email address? <Link to="/register" className="underline">Sign up again</Link> with the right one.
                </p>
            </div>
        </section>
    );
}

export default VerifyEmail;
