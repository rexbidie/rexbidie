import PDFDocument from "pdfkit";

/**
 * RexBid document PDFs (A4), laid out to match the payment request the team
 * already sends. Each renderer takes the snapshot stored on the Sale document
 * and returns a Buffer, so nothing has to be stored as a public file.
 */

// Company details printed on every document. Phone comes from the
// environment so it does not live in this public repository.
export const companyDetails = () => ({
    name: "RexBid",
    addressLines: (process.env.COMPANY_ADDRESS || "Corfeehone|Poles, Cavan").split("|"),
    email: process.env.EMAIL_USER || "admin@rexbid.ie",
    phone: process.env.COMPANY_PHONE || "",
    website: "rexbid.ie",
});

const NAVY = "#1f2937";
const MUTED = "#4b5563";
const RULE = "#d1d5db";
const LEFT = 56;
const RIGHT = 539; // A4 width 595 - 56
const WIDTH = RIGHT - LEFT;

export const money = (amount, currency = "EUR") => {
    const symbol = currency === "GBP" ? "£" : "€";
    const n = Number(amount) || 0;
    return `${symbol}${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const longDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Dublin" }) : "";

const toBuffer = (draw) =>
    new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: LEFT, info: { Producer: "RexBid", Creator: "RexBid" } });
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        try {
            draw(doc);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });

const rule = (doc, y) => doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.7).strokeColor(RULE).stroke();

const header = (doc, { heading, reference, dates }) => {
    const c = companyDetails();
    doc.font("Helvetica-Bold").fontSize(26).fillColor(NAVY).text(c.name, LEFT, 56);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    let y = 96;
    for (const line of [...c.addressLines, c.email, c.phone].filter(Boolean)) {
        doc.text(line, LEFT, y);
        y += 15;
    }
    doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text(heading, LEFT, 62, { width: WIDTH, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    let ry = 96;
    for (const line of [`Reference: ${reference}`, ...dates]) {
        doc.text(line, LEFT, ry, { width: WIDTH, align: "right" });
        ry += 15;
    }
    const bottom = Math.max(y, ry) + 14;
    rule(doc, bottom);
    return bottom + 20;
};

const partyBlock = (doc, y, leftTitle, leftLines, rightTitle, rightLines) => {
    const colW = WIDTH / 2 - 10;
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY);
    doc.text(leftTitle, LEFT, y, { width: colW });
    doc.text(rightTitle, LEFT + WIDTH / 2, y, { width: colW });
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    let ly = y + 20;
    for (const l of leftLines.filter(Boolean)) {
        doc.text(l, LEFT, ly, { width: colW });
        ly = doc.y + 3;
    }
    let ry = y + 20;
    for (const l of rightLines.filter(Boolean)) {
        doc.text(l, LEFT + WIDTH / 2, ry, { width: colW });
        ry = doc.y + 3;
    }
    const bottom = Math.max(ly, ry) + 12;
    rule(doc, bottom);
    return bottom + 20;
};

const row = (doc, y, label, value, { bold = false, size = 11, color = NAVY } = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
    doc.text(label, LEFT, y, { width: WIDTH * 0.7 });
    doc.text(value, LEFT, y, { width: WIDTH, align: "right" });
    return Math.max(doc.y, y + size + 4) + 8;
};

const sectionTitle = (doc, y, text) => {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text(text.toUpperCase(), LEFT, y);
    return y + 22;
};

const vatLine = (s) => {
    if (s.vat.treatment === "zero_rated") return ["VAT (zero-rated)", money(0, s.currency)];
    if (s.vat.treatment === "standard") return [`VAT (${s.vat.rate}%)`, money(s.vat.amount, s.currency)];
    return ["VAT:", money(0, s.currency)];
};

const footer = (doc) => {
    const y = 770;
    rule(doc, y);
    // The footer sits inside the bottom margin; stop pdfkit adding a page for it.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(`RexBid | ${companyDetails().website}`, LEFT, y + 10, { lineBreak: false });
};

/**
 * Combined payment request: item (collected on behalf of the seller) plus the
 * RexBid buyer fee, payable to the buyer's own Stripe bank-transfer account.
 */
export const renderPaymentRequestPdf = (s) =>
    toBuffer((doc) => {
        let y = header(doc, {
            heading: "COMBINED PAYMENT REQUEST",
            reference: s.reference,
            dates: [`Issue date: ${longDate(s.issueDate)}`, `Sale date: ${longDate(s.saleDate)}`],
        });

        y = partyBlock(
            doc,
            y,
            "BUYER",
            [s.buyer.name, s.buyer.companyName !== s.buyer.name ? s.buyer.companyName : null, ...(s.buyer.addressLines || []), s.buyer.email, s.buyer.phone, s.buyer.vatNumber ? `VAT no. ${s.buyer.vatNumber}` : null],
            "SELLER / ITEM SUPPLIER",
            [s.seller.displayName, s.seller.vatNumber ? `VAT no. ${s.seller.vatNumber}` : null],
        );

        y = sectionTitle(doc, y, `Collected on behalf of ${s.seller.displayName}`);
        y = row(doc, y, s.title, money(s.itemPrice, s.currency));
        const [vatLabel, vatValue] = vatLine(s);
        y = row(doc, y, vatLabel, vatValue, { size: 10, color: MUTED });
        if (s.vat.treatment === "zero_rated" && s.vat.note) {
            doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(s.vat.note, LEFT, y - 4, { width: WIDTH * 0.7 });
            y = doc.y + 8;
        }
        y += 10;

        y = sectionTitle(doc, y, "RexBid charges");
        y = row(doc, y, s.buyerFeeDescription || "Buyer commission", money(s.buyerFee, s.currency));
        y += 4;
        rule(doc, y);
        y += 18;
        y = row(doc, y, "TOTAL PAYABLE", money(s.total, s.currency), { bold: true, size: 14 });
        y += 30;

        y = sectionTitle(doc, y, "Payment details");
        const b = s.bank || {};
        const pairs = [
            ["Account holder", b.accountHolderName || "RexBid"],
            b.iban ? ["IBAN", b.iban] : null,
            b.bic ? ["BIC", b.bic] : null,
            b.sortCode ? ["Sort code", b.sortCode] : null,
            b.accountNumber ? ["Account number", b.accountNumber] : null,
            ["Currency", b.payCurrency || s.currency],
            b.payAmount ? ["Amount to transfer", money(b.payAmount, b.payCurrency)] : null,
            ["Payment reference", b.reference || s.reference],
            ["Payment due", longDate(s.dueDate)],
        ].filter(Boolean);
        for (const [k, v] of pairs) {
            doc.font("Helvetica").fontSize(10).fillColor(NAVY).text(k, LEFT + 14, y, { width: 150 });
            doc.font(k === "IBAN" || k === "Account number" ? "Helvetica-Bold" : "Helvetica").text(v, LEFT + 180, y, { width: WIDTH - 180 });
            y += 19;
        }
        if (b.payAmount && b.rate) {
            doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
                `Bank transfers are made in euro. ${money(s.total, s.currency)} converted at 1 ${s.currency} = ${Number(b.rate).toFixed(4)} ${b.payCurrency}.` +
                    (s.cardPayUrl ? ` Card payments are charged in ${s.currency}.` : ""),
                LEFT + 14, y + 4, { width: WIDTH - 28 },
            );
            y = doc.y;
        }
        y += 22;

        if (s.cardPayUrl) {
            doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("Or pay by card online:", LEFT + 14, y, { continued: true });
            doc.font("Helvetica").fillColor("#1d4ed8").text(` ${s.cardPayUrl}`, { link: s.cardPayUrl });
            y = doc.y + 18;
        }

        doc.font("Helvetica").fontSize(9).fillColor(MUTED);
        doc.text(
            (b.payAmount ? "Payments are handled by Stripe. The account above is unique to you. Transfer the amount shown above in euro and quote the payment reference." : "Payments are handled by Stripe. The account above is unique to you. Use it to do a bank transfer for the total payable amount and quote the payment reference.") +
                (s.cardPayUrl ? " Please pay once only, either by bank transfer or by card." : ""),
            LEFT, y, { width: WIDTH * 0.75 },
        );
        y = doc.y + 10;
        doc.fillColor(NAVY).text(
            `RexBid collects the item payment on behalf of ${s.seller.displayName} together with the RexBid buyer commission in one transaction. This payment request does not replace any sale invoice required from the seller. The seller is responsible for the VAT treatment of the item sale.`,
            LEFT, y, { width: WIDTH },
        );

        footer(doc);
    });

const pairsTable = (doc, y, pairs, { boldKeys = [] } = {}) => {
    for (const [k, v] of pairs) {
        doc.font("Helvetica").fontSize(10).fillColor(NAVY).text(k, LEFT + 14, y, { width: 150 });
        doc.font(boldKeys.includes(k) ? "Helvetica-Bold" : "Helvetica").text(String(v ?? ""), LEFT + 180, y, { width: WIDTH - 180 });
        y = Math.max(doc.y, y + 12) + 7;
    }
    return y;
};

const METHOD_LABELS = { credit_card: "Card", bank_transfer: "Bank transfer", paypal: "PayPal", other: "Other" };

/** Buyer receipt: confirms payment and sets out collection. */
export const renderBuyerReceiptPdf = (s) =>
    toBuffer((doc) => {
        let y = header(doc, {
            heading: "PAYMENT RECEIPT",
            reference: s.reference,
            dates: [`Receipt date: ${longDate(s.issueDate)}`, `Payment date: ${longDate(s.paidDate)}`, `Sale date: ${longDate(s.saleDate)}`],
        });

        y = partyBlock(
            doc,
            y,
            "RECEIVED FROM",
            [s.buyer.name, s.buyer.companyName !== s.buyer.name ? s.buyer.companyName : null, ...(s.buyer.addressLines || []), s.buyer.email],
            "SELLER / ITEM SUPPLIER",
            [s.seller.displayName, s.seller.phone ? `Phone: ${s.seller.phone}` : null],
        );

        y = sectionTitle(doc, y, `Collected on behalf of ${s.seller.displayName}`);
        y = row(doc, y, s.title, money(s.itemPrice, s.currency));
        const [vatLabel, vatValue] = vatLine(s);
        y = row(doc, y, vatLabel, vatValue, { size: 10, color: MUTED });
        y += 10;
        y = sectionTitle(doc, y, "RexBid charges");
        y = row(doc, y, s.buyerFeeDescription || "Buyer commission", money(s.buyerFee, s.currency));
        y += 4;
        rule(doc, y);
        y += 18;
        y = row(doc, y, "TOTAL PAID", money(s.amountPaid ?? s.total, s.currency), { bold: true, size: 14 });
        y += 22;

        y = sectionTitle(doc, y, "Payment");
        y = pairsTable(doc, y, [
            ["Method", METHOD_LABELS[s.method] || s.method || "—"],
            ["Date received", longDate(s.paidDate)],
            s.transactionId ? ["Transaction", s.transactionId] : null,
        ].filter(Boolean));
        y += 16;

        y = sectionTitle(doc, y, "Collection");
        y = pairsTable(
            doc,
            y,
            [
                ["Collect by", longDate(s.collectBy)],
                s.itemLocation ? ["Item location", s.itemLocation] : null,
                ["Seller", s.seller.displayName],
                ["Seller phone", s.seller.phone || "Contact RexBid"],
            ].filter(Boolean),
            { boldKeys: ["Collect by", "Seller phone"] },
        );
        y += 10;
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#b45309").text(
            `Please collect within ${s.collectionDays} working days of payment. Items not collected by then are subject to storage fines.`,
            LEFT, y, { width: WIDTH },
        );
        y = doc.y + 14;

        doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
            `This receipt confirms that RexBid has received your payment, which includes the item price collected on behalf of ${s.seller.displayName}. It does not replace any sale invoice required from the seller.`,
            LEFT, y, { width: WIDTH },
        );
        footer(doc);
    });

/** Seller statement: what was collected for the seller and what they are owed. */
export const renderSellerStatementPdf = (s) =>
    toBuffer((doc) => {
        let y = header(doc, {
            heading: "SELLER STATEMENT",
            reference: s.reference,
            dates: [`Statement date: ${longDate(s.issueDate)}`, `Sale date: ${longDate(s.saleDate)}`],
        });

        y = partyBlock(
            doc,
            y,
            "SELLER",
            [s.seller.name, s.seller.companyName && s.seller.companyName !== s.seller.name ? s.seller.companyName : null, ...(s.seller.addressLines || []), s.seller.email, s.seller.vatNumber ? `VAT no. ${s.seller.vatNumber}` : null],
            "BUYER",
            [s.buyer.name, s.buyer.companyName && s.buyer.companyName !== s.buyer.name ? s.buyer.companyName : null, ...(s.buyer.addressLines || []), s.buyer.phone ? `Phone: ${s.buyer.phone}` : null, s.buyer.vatNumber ? `VAT no. ${s.buyer.vatNumber}` : null],
        );

        y = sectionTitle(doc, y, "Sale");
        y = row(doc, y, s.title, money(s.itemPrice, s.currency));
        if (s.vat.treatment === "standard") {
            y = row(doc, y, `VAT collected on your behalf (${s.vat.rate}%)`, money(s.vat.amount, s.currency), { size: 10, color: MUTED });
        } else if (s.vat.treatment === "zero_rated") {
            y = row(doc, y, "VAT (zero-rated cross-border supply)", money(0, s.currency), { size: 10, color: MUTED });
        }
        y = row(doc, y, "Total collected for you", money(s.grossForSeller, s.currency), { bold: true });
        y += 10;

        y = sectionTitle(doc, y, "RexBid charges");
        y = row(doc, y, s.sellerFeeDescription || "Seller commission", `-${money(s.sellerFee, s.currency)}`);
        y += 4;
        rule(doc, y);
        y += 18;
        y = row(doc, y, "AMOUNT DUE TO YOU", money(s.netPayout, s.currency), { bold: true, size: 14 });
        y += 22;

        y = sectionTitle(doc, y, "Payout");
        y = pairsTable(doc, y, [
            ["Buyer payment", s.buyerPaidDate ? `Received ${longDate(s.buyerPaidDate)}` : "Awaiting payment"],
            ["Payout to", s.payoutAccount || (s.historical || s.payoutPaidDate ? "Not recorded on RexBid" : "No payout bank account on file. Please add one under Payout Methods.")],
            s.collectBy && !s.payoutPaidDate ? ["Buyer to collect by", longDate(s.collectBy)] : null,
            ["Payout", s.payoutPaidDate ? `Paid ${longDate(s.payoutPaidDate)}` : s.historical ? "Not recorded on RexBid. Contact us if you have not been paid." : "Released once collection is confirmed"],
            s.payoutReference ? ["Payout reference", s.payoutReference] : null,
        ].filter(Boolean));
        y += 14;

        doc.font("Helvetica").fontSize(9).fillColor(MUTED);
        if (s.vat.treatment === "standard") {
            doc.text(
                "VAT shown above was collected from the buyer on your behalf and is included in your payout. You remain responsible for issuing your VAT invoice to the buyer and accounting for this VAT.",
                LEFT, y, { width: WIDTH },
            );
            y = doc.y + 8;
        }
        doc.text(
            "The buyer's commission is a separate RexBid charge to the buyer and does not affect the amount due to you.",
            LEFT, y, { width: WIDTH },
        );
        footer(doc);
    });

export const renderDocumentPdf = (type, snapshot) => {
    if (type === "payment_request") return renderPaymentRequestPdf(snapshot);
    if (type === "buyer_receipt") return renderBuyerReceiptPdf(snapshot);
    if (type === "seller_statement") return renderSellerStatementPdf(snapshot);
    throw new Error(`No PDF template for document type ${type}`);
};
