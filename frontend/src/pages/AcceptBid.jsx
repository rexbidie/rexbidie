import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { CheckCircle, XCircle, Loader, Gavel } from "lucide-react";
import { Container } from "../components";
import { formatMoney } from "../utils/openPdf";

// Seller accepts the highest bid after the reserve wasn't met.
// Opened from the button in the "Your listing has ended" email.
const API = `${import.meta.env.VITE_DOMAIN_URL}/api/v1/accept-top-bid`;

const formatWhen = (d) =>
    d
        ? new Date(d).toLocaleString("en-IE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "numeric",
            minute: "2-digit",
        })
        : "";

function AcceptBid() {
    const { token } = useParams();
    const [status, setStatus] = useState("loading"); // loading | ready | sending | done | error
    const [lot, setLot] = useState(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await axios.get(`${API}/${encodeURIComponent(token)}`);
                setLot(data.data);
                if (data.data.alreadyAccepted) {
                    setStatus("done");
                    setMessage("You've already accepted this bid. The sale is going ahead.");
                } else {
                    setStatus("ready");
                }
            } catch (error) {
                setStatus("error");
                setMessage(error.response?.data?.message || "Something went wrong. Please try again or contact RexBid.");
            }
        };
        load();
    }, [token]);

    const accept = async () => {
        setStatus("sending");
        try {
            const { data } = await axios.post(`${API}/${encodeURIComponent(token)}`);
            setStatus("done");
            setMessage(data.message);
        } catch (error) {
            setStatus("error");
            setMessage(error.response?.data?.message || "Something went wrong. Please try again or contact RexBid.");
        }
    };

    const price = lot ? formatMoney(lot.amount, lot.currency) : "";

    return (
        <Container className="min-h-[80vh] flex items-center justify-center py-10">
            <div className="bg-white dark:bg-bg-primary-light rounded-xl shadow-lg p-6 sm:p-8 max-w-md w-full">
                {status === "loading" && (
                    <div className="text-center">
                        <Loader size={48} className="animate-spin text-primary mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-gray-300">Loading your listing...</p>
                    </div>
                )}

                {(status === "ready" || status === "sending") && lot && (
                    <>
                        <div className="flex items-center gap-2 text-primary mb-3">
                            <Gavel size={22} />
                            <span className="font-semibold">Accept the highest bid</span>
                        </div>
                        {lot.photo && (
                            <img src={lot.photo} alt="" className="w-full h-48 object-cover rounded-lg mb-4" />
                        )}
                        <h1 className="text-xl font-bold text-gray-800 dark:text-white mb-1">{lot.title}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                            Ended {formatWhen(lot.endedAt)} below your reserve · {lot.bidCount} bid{lot.bidCount === 1 ? "" : "s"}
                        </p>

                        <div className="rounded-lg bg-gray-50 dark:bg-bg-primary p-4 mb-5 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-300">Highest bid</span>
                                <span className="font-bold text-gray-900 dark:text-white">{price}</span>
                            </div>
                            {lot.sellerFee > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-300">Seller fee</span>
                                    <span className="text-gray-900 dark:text-white">−{formatMoney(lot.sellerFee, lot.currency)}</span>
                                </div>
                            )}
                            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2">
                                <span className="text-gray-600 dark:text-gray-300">You receive</span>
                                <span className="font-bold text-gray-900 dark:text-white">{formatMoney(lot.sellerReceives, lot.currency)}</span>
                            </div>
                        </div>

                        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 mb-5 list-disc pl-5">
                            <li>This is a binding sale to the top bidder.</li>
                            <li>We'll email the buyer their payment details straight away, then follow the normal payment and collection steps.</li>
                            {lot.binLive && <li>Your Last Chance listing will be closed.</li>}
                            {lot.deadline && <li>You can accept until {formatWhen(lot.deadline)}.</li>}
                        </ul>

                        <button
                            type="button"
                            onClick={accept}
                            disabled={status === "sending"}
                            className="w-full bg-primary text-white font-semibold px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                            {status === "sending" ? "Accepting..." : `Accept ${price} and sell`}
                        </button>
                        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-3">
                            Not ready to sell at this price? Just close this page. You can still use Last Chance or relist from your dashboard.
                        </p>
                    </>
                )}

                {status === "done" && (
                    <div className="text-center">
                        <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Sold</h2>
                        <p className="text-gray-600 dark:text-gray-300">{message}</p>
                        <Link
                            to="/seller/auctions/sold"
                            className="mt-6 inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            Go to my sold items
                        </Link>
                    </div>
                )}

                {status === "error" && (
                    <div className="text-center">
                        <XCircle size={48} className="text-red-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Couldn't accept this bid</h2>
                        <p className="text-gray-600 dark:text-gray-300">{message}</p>
                        <Link
                            to="/contact"
                            className="mt-6 inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            Contact RexBid
                        </Link>
                    </div>
                )}
            </div>
        </Container>
    );
}

export default AcceptBid;
