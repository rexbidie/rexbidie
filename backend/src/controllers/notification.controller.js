import mongoose from "mongoose";
import Device from "../models/device.model.js";
import Notification from "../models/notification.model.js";

const PLATFORMS = new Set(["ios", "android", "web"]);

// POST /api/v1/notifications/devices  { token, platform, appVersion }
export const registerDevice = async (req, res) => {
    try {
        const token = String(req.body?.token || "").trim();
        const platform = String(req.body?.platform || "").toLowerCase();
        if (!token || token.length > 4096 || !PLATFORMS.has(platform)) {
            return res.status(400).json({ success: false, message: "A device token and platform are required" });
        }
        await Device.findOneAndUpdate(
            { token },
            {
                user: req.user._id,
                token,
                platform,
                appVersion: String(req.body?.appVersion || "").slice(0, 40) || undefined,
                lastSeenAt: new Date(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("registerDevice:", error);
        res.status(500).json({ success: false, message: "Could not register device" });
    }
};

// DELETE /api/v1/notifications/devices  { token }   (called on sign-out)
export const unregisterDevice = async (req, res) => {
    try {
        const token = String(req.body?.token || "").trim();
        if (token) await Device.deleteOne({ token, user: req.user._id });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("unregisterDevice:", error);
        res.status(500).json({ success: false, message: "Could not remove device" });
    }
};

// GET /api/v1/notifications?page=1&limit=20
export const listNotifications = async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const filter = { user: req.user._id };
        const [items, total, unread] = await Promise.all([
            Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select("type title body url readAt createdAt")
                .lean(),
            Notification.countDocuments(filter),
            Notification.countDocuments({ ...filter, readAt: null }),
        ]);
        res.status(200).json({ success: true, data: { items, total, unread, page, pages: Math.ceil(total / limit) } });
    } catch (error) {
        console.error("listNotifications:", error);
        res.status(500).json({ success: false, message: "Could not load notifications" });
    }
};

// GET /api/v1/notifications/unread-count
export const unreadCount = async (req, res) => {
    try {
        const unread = await Notification.countDocuments({ user: req.user._id, readAt: null });
        res.status(200).json({ success: true, data: { unread } });
    } catch (error) {
        console.error("unreadCount:", error);
        res.status(500).json({ success: false, message: "Could not load notifications" });
    }
};

// POST /api/v1/notifications/read  { ids?: [...] }  (no ids = mark all read)
export const markRead = async (req, res) => {
    try {
        const filter = { user: req.user._id, readAt: null };
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => mongoose.isValidObjectId(id)) : null;
        if (ids) {
            if (!ids.length) return res.status(200).json({ success: true, data: { updated: 0 } });
            filter._id = { $in: ids.slice(0, 100) };
        }
        const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
        res.status(200).json({ success: true, data: { updated: result.modifiedCount } });
    } catch (error) {
        console.error("markRead:", error);
        res.status(500).json({ success: false, message: "Could not update notifications" });
    }
};
