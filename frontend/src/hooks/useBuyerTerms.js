import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "../utils/axiosInstance";

// Has the signed-in bidder agreed to the Buyer Terms tonight? (backend utils/buyerTerms.js)
// Until we know, we assume not, so the tick box is shown rather than skipped.
const useBuyerTerms = (user) => {
    const [current, setCurrent] = useState(false);

    const check = useCallback(async () => {
        if (!user?._id) {
            setCurrent(false);
            return false;
        }
        try {
            const { data } = await axiosInstance.get("/api/v1/users/me/buyer-terms");
            const ok = !!data?.data?.current;
            setCurrent(ok);
            return ok;
        } catch {
            return false;
        }
    }, [user?._id]);

    useEffect(() => {
        check();
    }, [check]);

    // Re-check when the bidder comes back to the tab (e.g. a page left open overnight).
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") check();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [check]);

    const accept = useCallback(async (auctionId) => {
        try {
            await axiosInstance.post("/api/v1/users/me/buyer-terms", { auctionId });
            setCurrent(true);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || "Couldn't save your agreement. Please try again.");
            return false;
        }
    }, []);

    return { current, accept, check };
};

export default useBuyerTerms;
