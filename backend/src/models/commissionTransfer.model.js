import mongoose, { Schema } from "mongoose";

/**
 * RexBid's share of Stripe payments moved to the bank (BOI), payment by
 * payment, so each payment's commission is only sent once. "marked" records
 * share that was already sent by hand before this was tracked, or a payment
 * an admin set aside.
 */
const commissionTransferSchema = new Schema(
    {
        kind: { type: String, enum: ["payout", "marked"], required: true },
        payoutId: String,
        amount: { type: Number, required: true }, // euro
        note: String,
        items: [
            {
                _id: false,
                chargeId: { type: String, required: true },
                amount: { type: Number, required: true }, // euro, may be 0 for set-aside payments
            },
        ],
        by: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

commissionTransferSchema.index({ "items.chargeId": 1 });

export default mongoose.models.CommissionTransfer || mongoose.model("CommissionTransfer", commissionTransferSchema);
