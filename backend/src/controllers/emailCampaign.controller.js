import mongoose from "mongoose";
import sanitizeHtml from "sanitize-html";
import EmailCampaign from "../models/emailCampaign.model.js";
import User from "../models/user.model.js";
import agendaService from "../services/agendaService.js";
import { sendMarketingCampaignEmail } from "../utils/nodemailer.js";
import {
    deleteFromCloudinary,
    uploadImageToCloudinary,
} from "../utils/cloudinary.js";

// ─── Placeholder keys supported in the body ─────────────────
const PLACEHOLDER_KEYS = [
    "firstName",
    "lastName",
    "username",
    "email",
    "companyName",
];

// ─── Group → userType mapping ───────────────────────────────
const GROUP_TO_TYPES = {
    all_sellers: ["seller"],
    all_companies: ["company"],
    sellers_and_companies: ["seller", "company"],
    all_bidders: ["bidder"],
    all_users: ["seller", "company", "bidder"],
};

const EXCLUDED_USER_TYPES = ["admin", "cashier", "staff"];

// ─── Sanitize Quill output ──────────────────────────────────
const sanitizeBody = (body) =>
    sanitizeHtml(body, {
        allowedTags: [
            "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
            "h1", "h2", "h3", "h4", "h5", "h6",
            "ul", "ol", "li", "blockquote", "code", "pre",
            "a", "img",
            "table", "thead", "tbody", "tr", "th", "td",
            "span", "div", "hr",
        ],
        allowedAttributes: {
            a: ["href", "title", "target", "rel"],
            img: ["src", "alt", "title", "width", "height"],
            "*": ["style", "class"],
        },
        allowedSchemes: ["http", "https", "mailto"],
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
        },
    });

// ─── HTML-escape placeholder values ─────────────────────────
const escapeHtml = (str) =>
    String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const substitutePlaceholders = (body, user) => {
    let result = body;
    PLACEHOLDER_KEYS.forEach((key) => {
        const value = escapeHtml(user[key] || "");
        result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    });
    return result;
};

// ─── Build user query from recipient spec ───────────────────
const buildRecipientQuery = (recipients) => {
    const groups = recipients?.groups || [];
    const specificUserIds = recipients?.specificUserIds || [];

    const userTypes = new Set();
    groups.forEach((g) => {
        (GROUP_TO_TYPES[g] || []).forEach((t) => userTypes.add(t));
    });

    const baseFilter = {
        isActive: true,
        "preferences.emailUpdates": { $ne: false },
        "preferences.email.news": { $ne: false },
        userType: { $nin: EXCLUDED_USER_TYPES },
    };

    const orConditions = [];
    if (userTypes.size > 0) {
        orConditions.push({ userType: { $in: Array.from(userTypes) } });
    }
    if (specificUserIds.length > 0) {
        orConditions.push({ _id: { $in: specificUserIds } });
    }

    if (orConditions.length === 0) {
        return { _id: { $in: [] } }; // empty result
    }

    return { ...baseFilter, $or: orConditions };
};

const resolveRecipients = async (campaign) => {
    const query = buildRecipientQuery(campaign.recipients);
    return User.find(query).select(
        "firstName lastName username email companyName preferences"
    );
};

// ─── Validate ObjectIds in specificUserIds ──────────────────
const validateUserIds = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const invalid = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalid.length > 0) return "One or more specific user IDs are invalid";
    return null;
};

// ─── Extract R2 object keys (public IDs) from HTML ─────────
const getR2BaseUrl = () => {
    if (process.env.R2_PUBLIC_URL) {
        return process.env.R2_PUBLIC_URL.replace(/\/$/, "");
    }
    const bucket = process.env.R2_BUCKET_NAME || process.env.BUCKET_NAME;
    const accountId = process.env.R2_ACCOUNT_ID;
    if (bucket && accountId) {
        return `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;
    }
    return null;
};

const extractR2PublicIds = (html) => {
    if (!html) return [];
    const baseUrl = getR2BaseUrl();
    if (!baseUrl) {
        console.warn(
            "⚠️ R2_PUBLIC_URL not configured — cannot extract image keys for cleanup"
        );
        return [];
    }

    const keys = new Set();
    const srcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;

    while ((match = srcRegex.exec(html)) !== null) {
        const rawUrl = match[1].split("?")[0].split("#")[0];
        if (!rawUrl.startsWith(baseUrl + "/")) continue;

        const encodedKey = rawUrl.slice(baseUrl.length + 1);
        const decodedKey = encodedKey.split("/").map(decodeURIComponent).join("/");
        if (decodedKey) keys.add(decodedKey);
    }

    return Array.from(keys);
};

// ═══════════════════════════════════════════════════════════
// Background processor
// ═══════════════════════════════════════════════════════════
export const processCampaign = async (campaignId) => {
    try {
        const campaign = await EmailCampaign.findOneAndUpdate(
            { _id: campaignId, status: { $nin: ["sending", "sent"] } },
            { $set: { status: "sending" } },
            { new: true }
        );

        if (!campaign) {
            const existing = await EmailCampaign.findById(campaignId);
            if (!existing) console.error(`❌ Campaign ${campaignId} not found`);
            else
                console.log(
                    `ℹ️ Campaign ${campaignId} is already ${existing.status}, skipping`
                );
            return;
        }

        const users = await resolveRecipients(campaign);
        campaign.stats.total = users.length;
        await campaign.save();

        let sentCount = 0;
        let failedCount = 0;
        let completed = 0;
        const PERSIST_EVERY = 50;

        const persistProgress = async () => {
            completed++;
            if (
                completed % PERSIST_EVERY === 0 ||
                completed === users.length
            ) {
                campaign.stats.sent = sentCount;
                campaign.stats.failed = failedCount;
                await campaign
                    .save()
                    .catch((err) =>
                        console.error(
                            "Failed to persist campaign progress:",
                            err.message
                        )
                    );
            }
        };

        // Fire all sends at once — Nodemailer's pool queues them
        // internally against `maxConnections`, so no manual throttling needed.
        await Promise.allSettled(
            users.map(async (user) => {
                try {
                    const token = user.generateUnsubscribeToken();
                    await user.save({ validateBeforeSave: false });

                    const personalizedBody = substitutePlaceholders(campaign.body, user);

                    await sendMarketingCampaignEmail(
                        user,
                        campaign,
                        token,
                        personalizedBody
                    );
                    sentCount++;
                } catch (err) {
                    failedCount++;
                    console.error(
                        `❌ Email send failed for ${user.email}:`,
                        err.message
                    );
                } finally {
                    await persistProgress();
                }
            })
        );

        campaign.stats.sent = sentCount;
        campaign.stats.failed = failedCount;
        campaign.status =
            users.length > 0 && failedCount === users.length ? "failed" : "sent";
        campaign.sentAt = new Date();
        await campaign.save();

        console.log(
            `📧 Campaign ${campaignId} completed — sent: ${sentCount}, failed: ${failedCount}, total: ${users.length}`
        );
    } catch (error) {
        console.error(`❌ Error processing campaign ${campaignId}:`, error);
        await EmailCampaign.findByIdAndUpdate(campaignId, { status: "failed" });
    }
};

// ═══════════════════════════════════════════════════════════
// CRUD Controllers
// ═══════════════════════════════════════════════════════════

export const createCampaign = async (req, res) => {
    try {
        const { title, body, recipients, scheduleDate } = req.body;
        const admin = req.user;

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                message: "Title and body are required",
            });
        }

        if (!recipients) {
            return res.status(400).json({
                success: false,
                message: "Recipients are required",
            });
        }

        const groups = recipients.groups || [];
        const specificUserIds = recipients.specificUserIds || [];

        if (groups.length === 0 && specificUserIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Select at least one recipient group or user",
            });
        }

        const userIdErr = validateUserIds(specificUserIds);
        if (userIdErr) {
            return res.status(400).json({ success: false, message: userIdErr });
        }

        let parsedSchedule = null;
        if (scheduleDate) {
            const date = new Date(scheduleDate);
            if (isNaN(date.getTime())) {
                return res
                    .status(400)
                    .json({ success: false, message: "Invalid schedule date" });
            }
            if (date <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Schedule date must be in the future",
                });
            }
            parsedSchedule = date;
        }

        const campaign = await EmailCampaign.create({
            title: title.trim(),
            body: sanitizeBody(body),
            recipients: { groups, specificUserIds },
            scheduleDate: parsedSchedule,
            status: parsedSchedule ? "scheduled" : "draft",
            createdBy: admin._id,
        });

        if (parsedSchedule) {
            await agendaService.agenda.schedule(
                parsedSchedule,
                "send email campaign",
                { campaignId: campaign._id }
            );
        }

        res.status(201).json({
            success: true,
            message: parsedSchedule
                ? "Campaign scheduled"
                : "Campaign created as draft",
            data: { campaign },
        });
    } catch (error) {
        console.error("Create email campaign error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create campaign",
        });
    }
};

export const getCampaigns = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [{ title: { $regex: search, $options: "i" } }];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [campaigns, total] = await Promise.all([
            EmailCampaign.find(filter)
                .populate("createdBy", "username email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            EmailCampaign.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: {
                campaigns,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalItems: total,
                },
            },
        });
    } catch (error) {
        console.error("Get email campaigns error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to fetch campaigns" });
    }
};

export const getCampaignById = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await EmailCampaign.findById(id).populate(
            "createdBy",
            "username email"
        );

        if (!campaign) {
            return res
                .status(404)
                .json({ success: false, message: "Campaign not found" });
        }

        const users = await resolveRecipients(campaign);
        const sampleUsers = users.slice(0, 5).map((u) => ({
            firstName: u.firstName,
            lastName: u.lastName,
            username: u.username,
            email: u.email,
            companyName: u.companyName,
        }));

        res.status(200).json({
            success: true,
            data: {
                campaign,
                stats: {
                    totalRecipients: users.length,
                    sample: sampleUsers,
                },
            },
        });
    } catch (error) {
        console.error("Get email campaign error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to fetch campaign" });
    }
};

export const updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, body, recipients, scheduleDate } = req.body;

        const campaign = await EmailCampaign.findById(id);
        if (!campaign) {
            return res
                .status(404)
                .json({ success: false, message: "Campaign not found" });
        }

        if (!["draft", "scheduled"].includes(campaign.status)) {
            return res.status(400).json({
                success: false,
                message: "Only draft or scheduled campaigns can be updated",
            });
        }

        if (title) campaign.title = title.trim();
        if (body) campaign.body = sanitizeBody(body);

        if (recipients) {
            const groups = recipients.groups || [];
            const specificUserIds = recipients.specificUserIds || [];

            if (groups.length === 0 && specificUserIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Select at least one recipient group or user",
                });
            }

            const userIdErr = validateUserIds(specificUserIds);
            if (userIdErr) {
                return res.status(400).json({ success: false, message: userIdErr });
            }

            campaign.recipients = { groups, specificUserIds };
        }

        // Handle schedule change
        if (scheduleDate !== undefined) {
            const newDate = scheduleDate ? new Date(scheduleDate) : null;
            if (newDate && isNaN(newDate.getTime())) {
                return res
                    .status(400)
                    .json({ success: false, message: "Invalid schedule date" });
            }
            if (newDate && newDate <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Schedule date must be in the future",
                });
            }

            if (campaign.scheduleDate && campaign.status === "scheduled") {
                await agendaService.agenda.cancel({ "data.campaignId": campaign._id });
            }

            campaign.scheduleDate = newDate;
            if (newDate) {
                campaign.status = "scheduled";
                await agendaService.agenda.schedule(newDate, "send email campaign", {
                    campaignId: campaign._id,
                });
            } else {
                campaign.status = "draft";
            }
        }

        await campaign.save();

        res.status(200).json({
            success: true,
            message: "Campaign updated",
            data: { campaign },
        });
    } catch (error) {
        console.error("Update email campaign error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to update campaign" });
    }
};

export const deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await EmailCampaign.findById(id);
        if (!campaign) {
            return res
                .status(404)
                .json({ success: false, message: "Campaign not found" });
        }

        if (campaign.status === "sending") {
            return res.status(400).json({
                success: false,
                message: "Cannot delete a campaign while it is sending",
            });
        }

        if (campaign.status === "scheduled") {
            await agendaService.agenda.cancel({ "data.campaignId": campaign._id });
        }

        // Clean up R2 images referenced in the body (main + thumb variants)
        const mainKeys = extractR2PublicIds(campaign.body);
        const allKeys = [];
        for (const key of mainKeys) {
            allKeys.push(key);
            // uploadImageToR2 also uploads a "-thumb.webp" alongside each image
            if (key.endsWith(".webp")) {
                allKeys.push(key.replace(/\.webp$/, "-thumb.webp"));
            }
        }

        await Promise.allSettled(
            allKeys.map((key) =>
                deleteFromCloudinary(key).catch((err) =>
                    console.error(`Failed to delete R2 object ${key}:`, err.message)
                )
            )
        );

        await campaign.deleteOne();
        res.status(200).json({ success: true, message: "Campaign deleted" });
    } catch (error) {
        console.error("Delete email campaign error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to delete campaign" });
    }
};

export const sendCampaignNow = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await EmailCampaign.findById(id);
        if (!campaign) {
            return res
                .status(404)
                .json({ success: false, message: "Campaign not found" });
        }

        if (["sending", "sent"].includes(campaign.status)) {
            return res.status(400).json({
                success: false,
                message: `Campaign is already ${campaign.status}`,
            });
        }

        if (campaign.status === "scheduled") {
            await agendaService.agenda.cancel({ "data.campaignId": campaign._id });
        }

        // Fire and forget — processCampaign atomically claims the campaign
        processCampaign(campaign._id).catch((err) =>
            console.error("Campaign processing error:", err)
        );

        res.status(200).json({
            success: true,
            message: "Campaign sending started in background",
        });
    } catch (error) {
        console.error("Send email campaign now error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to start campaign" });
    }
};

export const cancelScheduledCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await EmailCampaign.findById(id);
        if (!campaign) {
            return res
                .status(404)
                .json({ success: false, message: "Campaign not found" });
        }

        if (campaign.status !== "scheduled") {
            return res.status(400).json({
                success: false,
                message: "Only scheduled campaigns can be cancelled",
            });
        }

        await agendaService.agenda.cancel({ "data.campaignId": campaign._id });

        campaign.status = "cancelled";
        await campaign.save();

        res
            .status(200)
            .json({ success: true, message: "Scheduled campaign cancelled" });
    } catch (error) {
        console.error("Cancel email campaign error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to cancel campaign" });
    }
};

export const previewRecipients = async (req, res) => {
    try {
        const { recipients } = req.body;

        if (
            !recipients ||
            ((recipients.groups || []).length === 0 &&
                (recipients.specificUserIds || []).length === 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "At least one group or specific user is required",
            });
        }

        const userIdErr = validateUserIds(recipients.specificUserIds || []);
        if (userIdErr) {
            return res.status(400).json({ success: false, message: userIdErr });
        }

        const query = buildRecipientQuery(recipients);
        const [total, sample] = await Promise.all([
            User.countDocuments(query),
            User.find(query)
                .select("firstName lastName username email companyName")
                .limit(10),
        ]);

        res.status(200).json({
            success: true,
            data: {
                total,
                sample: sample.map((u) => ({
                    firstName: u.firstName,
                    lastName: u.lastName,
                    username: u.username,
                    email: u.email,
                    companyName: u.companyName,
                })),
            },
        });
    } catch (error) {
        console.error("Preview email recipients error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to preview recipients" });
    }
};

// ─── Upload an image for use inside the campaign body ───────
export const uploadCampaignImage = async (req, res) => {
    try {
        if (!req.file) {
            return res
                .status(400)
                .json({ success: false, message: "No image file provided" });
        }

        if (!req.file.mimetype.startsWith("image/")) {
            return res
                .status(400)
                .json({ success: false, message: "Only image files are allowed" });
        }

        const result = await uploadImageToCloudinary(
            req.file.buffer,
            "email-campaigns"
        );

        return res.status(200).json({
            success: true,
            data: {
                url: result.secure_url || result.url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
            },
        });
    } catch (error) {
        console.error("Email campaign image upload error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Failed to upload image" });
    }
};