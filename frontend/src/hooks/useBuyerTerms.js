import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";
import { getServerNow } from "../utils/serverClock";

// Has the signed-in bidder agreed to the Buyer Terms recently enough to bid
// with one tap? (backend utils/buyerTerms.js)
//   - agreed within the last 30 minutes, or
//   - agreed before and this lot closes within 10 minutes (never ask then).
// Re-checked every 15 seconds as time passes. Until we know, we assume not,
// so the tick box is shown rather than skipped.
const useBuyerTerms = (user, lotEndsAt = null) => {
    const [info, setInfo] = useState(null); // { acceptedAt, everyMinutes, quietMinutes }
    const [tick, setTick] = useState(0);

    const check = useCallback(async () => {
        if (!user?._id) {
            setInfo(null);
            return false;
        }
        try {
            const { data } = await axiosInstance.get("/api/v1/users/me/buyer-terms");
            const d = data?.data || {};
            setInfo({ acceptedAt: d.acceptedAt || null, everyMinutes: d.everyMinutes ?? 30, quietMinutes: d.quietMinutes ?? 10, legacyCurrent: !!d.current });
            return !!d.current;
        } catch {
            return false;
        }
    }, [user?._id]);

    useEffect(() => {
        check();
    }, [check]);

    // Re-check when the bidder comes back to the tab (e.g. a page left open).
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") check();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [check]);

    // Time passes: the 30 minutes run out, or the lot reaches its last 10 minutes.
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 15000);
        return () => clearInterval(t);
    }, []);

    const isCurrent = () => {
        if (!info?.acceptedAt) return false;
        const now = getServerNow();
        const at = new Date(info.acceptedAt).getTime();
        if (Number.isNaN(at)) return false;
        if (info.everyMinutes == null) return info.legacyCurrent;
        if (now - at < info.everyMinutes * 60000) return true;
        const ends = lotEndsAt ? new Date(lotEndsAt).getTime() : NaN;
        return Number.isFinite(ends) && ends - now > 0 && ends - now <= info.quietMinutes * 60000;
    };
    void tick; // re-render every 15 s so `current` stays right
    const current = isCurrent();

    const accept = useCallback(async (auctionId) => {
        try {
            await axiosInstance.post("/api/v1/users/me/buyer-terms", { auctionId });
            setInfo((prev) => ({ everyMinutes: 30, quietMinutes: 10, ...(prev || {}), acceptedAt: new Date(getServerNow()).toISOString(), legacyCurrent: true }));
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || "Couldn't save your agreement. Please try again.");
            return false;
        }
    }, []);

    return { current, accept, check };
};

export default useBuyerTerms;
