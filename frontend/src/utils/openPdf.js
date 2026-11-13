import axiosInstance from "./axiosInstance";
import toast from "react-hot-toast";
import { isNativeApp } from "../native/platform";
import { openPdfBlobInApp } from "../native/files";

/**
 * Opens a PDF from the API in a new tab. Documents need the login token,
 * so they are fetched with axios rather than linked directly.
 */
export const openPdf = async (path, filename = "document.pdf") => {
    if (isNativeApp) {
        // The app can't open tabs: save the PDF and show the phone's viewer / share sheet.
        try {
            const res = await axiosInstance.get(path, { responseType: "blob" });
            await openPdfBlobInApp(new Blob([res.data], { type: "application/pdf" }), filename);
        } catch (err) {
            if (!/cancel/i.test(err?.message || "")) toast.error("Could not open the document");
        }
        return;
    }
    // Open the tab straight away so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
        const res = await axiosInstance.get(path, { responseType: "blob" });
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        if (tab) {
            tab.location.href = url;
        } else {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
        if (tab) tab.close();
        toast.error("Could not open the document");
    }
};

export const DOCUMENT_LABELS = {
    payment_request: "Payment request",
    buyer_receipt: "Buyer receipt",
    seller_statement: "Seller statement",
};

export const formatMoney = (amount, currency = "EUR") =>
    `${currency === "GBP" ? "£" : "€"}${Number(amount || 0).toLocaleString("en-IE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
