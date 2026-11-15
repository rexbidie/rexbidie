import { useEffect, useState } from "react";
import { Gavel, Loader, Minus, Plus, CheckCircle2 } from "lucide-react";

// One-tap bidding: a big "Bid €X" button set to the next minimum bid, with
// − / + to change the amount by the bid increment. No keyboard needed.
// "Enter my own amount" is still there for bidders who want it.
//
// amount / setAmount hold the chosen amount (in the bidder's currency) as a string.
// When someone else bids and the minimum goes above the chosen amount, it moves
// up to the new minimum automatically.
const QuickBid = ({
    minBid,            // next minimum bid, already rounded up to a whole unit
    step,              // bid increment, whole units
    symbol = "€",
    amount,
    setAmount,
    onBid,             // (amount: number) => void
    bidding = false,
    isLeading = false, // the viewer is already the highest bidder
    compact = false,   // slimmer version for the fixed bar at the bottom of the phone screen
}) => {
    const [ownAmountOpen, setOwnAmountOpen] = useState(false);
    const [ownAmount, setOwnAmount] = useState("");

    const min = Math.max(0, Math.ceil(Number(minBid) || 0));
    const inc = Math.max(1, Math.ceil(Number(step) || 1));
    const chosen = Math.max(min, Math.round(Number(amount) || 0));

    // Keep the chosen amount at or above the live minimum.
    useEffect(() => {
        if (!min) return;
        const current = Number(amount) || 0;
        if (current < min) setAmount(String(min));
    }, [min, amount, setAmount]);

    const fmt = (n) => `${symbol}${Number(n || 0).toLocaleString("en-IE", { maximumFractionDigits: 0 })}`;

    const stepBy = (dir) => {
        const next = dir > 0 ? chosen + inc : Math.max(min, chosen - inc);
        setAmount(String(next));
    };

    const submitOwn = () => {
        const v = Math.round(Number(ownAmount));
        if (!Number.isFinite(v) || v < min) return onBid(v); // parent shows the "minimum bid" message
        setAmount(String(v));
        onBid(v);
        setOwnAmount("");
        setOwnAmountOpen(false);
    };

    const pad = compact ? "py-2.5" : "py-3";

    return (
        <div className="flex flex-col gap-2 w-full">
            {isLeading && !compact && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                    <CheckCircle2 size={16} /> You're the highest bidder
                </p>
            )}

            <div className="flex items-stretch gap-2">
                <button
                    type="button"
                    aria-label={`Lower bid by ${fmt(inc)}`}
                    onClick={() => stepBy(-1)}
                    disabled={bidding || chosen <= min}
                    className={`flex items-center justify-center w-12 ${pad} rounded-lg border-2 border-gray-300 bg-white text-gray-800 disabled:opacity-30`}
                >
                    <Minus size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => onBid(chosen)}
                    disabled={bidding || !min}
                    className={`flex-1 flex items-center justify-center gap-2 ${pad} px-3 rounded-lg font-semibold transition-colors disabled:opacity-60 ${isLeading
                        ? "bg-white border-2 border-[#D19F3E] text-[#8a6416]"
                        : "bg-[#D19F3E] hover:bg-[#b88a32] text-black"
                        }`}
                >
                    {bidding ? (
                        <Loader size={18} className="animate-spin" />
                    ) : (
                        <>
                            <Gavel size={18} />
                            <span className="whitespace-nowrap">
                                {isLeading ? `Raise my bid to ${fmt(chosen)}` : `Bid ${fmt(chosen)}`}
                            </span>
                        </>
                    )}
                </button>

                <button
                    type="button"
                    aria-label={`Raise bid by ${fmt(inc)}`}
                    onClick={() => stepBy(1)}
                    disabled={bidding}
                    className={`flex items-center justify-center w-12 ${pad} rounded-lg border-2 border-gray-300 bg-white text-gray-800 disabled:opacity-30`}
                >
                    <Plus size={18} />
                </button>
            </div>

            {!compact && (
                ownAmountOpen ? (
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">{symbol}</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                value={ownAmount}
                                onChange={(e) => setOwnAmount(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitOwn(); } }}
                                placeholder={`${min} or more`}
                                className="w-full pl-7 pr-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm focus:outline-2 focus:outline-primary"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={submitOwn}
                            disabled={bidding || !ownAmount}
                            className="px-4 py-2.5 rounded-lg bg-black text-white text-sm font-medium disabled:opacity-40"
                        >
                            Bid
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setOwnAmountOpen(true)}
                        className="text-sm text-gray-600 underline self-center"
                    >
                        Enter my own amount
                    </button>
                )
            )}
        </div>
    );
};

export default QuickBid;
