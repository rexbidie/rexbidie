import { Schema, model } from "mongoose";

/**
 * In-app notification (the bell in the app and dashboards).
 * Every push notification is also stored here, so users who have push
 * turned off still see it next time they open the app.
 */
const notificationSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, required: true },
        title: { type: String, required: true },
        body: { type: String, default: "" },
        // Path inside the site/app to open when tapped, e.g. /auction/123.
        url: { type: String, default: "/" },
        readAt: { type: Date, default: null },
        // Stops the same event being notified twice (e.g. a retried job).
        dedupeKey: { type: String },
    },
    { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });
// Keep 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification = model("Notification", notificationSchema);

export default Notification;
