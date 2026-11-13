import { Schema, model } from "mongoose";

/**
 * A phone running the RexBid app, registered for push notifications.
 * One user can have several devices; a token belongs to one user at a time
 * (signing in as someone else on the same phone moves the token).
 */
const deviceSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        token: { type: String, required: true, unique: true },
        platform: { type: String, enum: ["ios", "android", "web"], required: true },
        appVersion: String,
        lastSeenAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

const Device = model("Device", deviceSchema);

export default Device;
