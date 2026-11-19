// Sale night: when the lot you're watching closes, move on to the lot that
// closes next that night, after a 5-second countdown you can stop.
//
// Sits outside the auction page (so the page reloading when the lot closes
// can't reset it) and asks the server itself: every 30 s normally, every 2 s
// near the end. The server says whether the lot has really closed (a late
// bid may have pushed it back). Only for lots that were live while you
// watched, not ones opened after closing.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../utils/axiosInstance";
import { getServerNow } from "../../utils/serverClock";

const COUNTDOWN = 5;

const NextLotAdvance = ({ auctionId }) => {
    const navigate = useNavigate();
    const sawLive = useRef(false);
    const [next, setNext] = useState(null);
    const [lastLot, setLastLot] = useState(false);
    const [left, setLeft] = useState(COUNTDOWN);
    const [stayed, setStayed] = useState(false);

    // Watch the lot until it closes.
    useEffect(() => {
        if (!auctionId) return undefined;
        let cancelled = false;
        let timer;
        let afterClose = 0;
        const ask = async () => {
            if (cancelled) return;
            let wait = 30000;
            try {
                const { data } = await axiosInstance.get(`/api/v1/auctions/${auctionId}/next-lot`);
                const d = data?.data;
                if (cancelled || !d) return;
                if (!d.closed) {
                    sawLive.current = true;
                    const toEnd = new Date(d.endDate).getTime() - getServerNow();
                    wait = toEnd > 40000 ? Math.min(30000, toEnd - 30000) : 2000;
                } else if (sawLive.current) {
                    if (d.next) setNext(d.next);
                    else setLastLot(true);
                    return; // done
                } else {
                    return; // opened after it closed: stay put
                }
            } catch {
                wait = 5000;
                if (sawLive.current && ++afterClose > 60) return;
            }
            timer = setTimeout(ask, Math.max(2000, wait));
        };
        ask();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [auctionId]);

    // 5, 4, 3, 2, 1 → next lot.
    useEffect(() => {
        if (!next || stayed) return undefined;
        if (left <= 0) {
            navigate(`/auction/${next._id}`);
            return undefined;
        }
        const t = setTimeout(() => setLeft((n) => n - 1), 1000);
        return () => clearTimeout(t);
    }, [next, left, stayed, navigate]);

    if (stayed || (!next && !lastLot)) return null;

    return (
        <div className="fixed left-1/2 top-20 z-[60] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl" role="status" aria-live="polite">
            {next ? (
                <div className="flex items-center gap-3">
                    {next.photo && <img src={next.photo} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />}
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lot closed · next lot in {Math.max(left, 0)}s</p>
                        <p className="truncate font-semibold text-[#072342]">{next.title}</p>
                        <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => navigate(`/auction/${next._id}`)} className="rounded-lg bg-[#072342] px-3 py-1.5 text-sm font-semibold text-white">
                                Go now
                            </button>
                            <button type="button" onClick={() => setStayed(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-[#072342]">
                                Stay on this lot
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#072342]">That was the last lot tonight. Thanks for bidding!</p>
                    <button type="button" onClick={() => setStayed(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold">OK</button>
                </div>
            )}
        </div>
    );
};

export default NextLotAdvance;
