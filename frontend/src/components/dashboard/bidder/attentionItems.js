// Builds the bidder dashboard's "Needs your attention" cards from its data.

/** Builds the "Needs your attention" cards from the dashboard data. */
const attentionItems = ({ bids, offers, documents, collections }) => {
    const items = [];
    const now = Date.now();

    // Won and waiting for payment: the current payment request for each sale.
    const seen = new Set();
    for (const d of documents) {
        if (d.role !== "buyer" || d.type !== "payment_request" || !d.current) continue;
        if (!["sold", "request_sent"].includes(d.saleStatus) || seen.has(String(d.saleId))) continue;
        seen.add(String(d.saleId));
        items.push({ key: `pay-${d.saleId}`, kind: "pay", tone: "green", doc: d });
    }
    // Paid, now to be collected.
    for (const c of collections) {
        if (c.role === "buyer" && !c.youConfirmed && c.status === "paid") {
            items.push({ key: `collect-${c.saleId}`, kind: "collect", tone: "plain", collection: c });
        }
    }
    // Outbid on lots still running.
    for (const b of bids) {
        if (b.status === "outbid" && new Date(b.endTime).getTime() > now) {
            items.push({ key: `outbid-${b.id}`, kind: "outbid", tone: "red", bid: b });
        }
    }
    // A seller countered an offer.
    for (const o of offers) {
        if (o.status === "countered") items.push({ key: `counter-${o.id}`, kind: "counter", tone: "amber", offer: o });
    }
    return items;
};

export default attentionItems;
