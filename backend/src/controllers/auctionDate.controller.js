import AuctionDate from "../models/auctionDate.model.js";
import { ensureCatalogueForSaleDate } from "../services/catalogueSyncService.js";
import Auction from "../models/auction.model.js";

// ── Admin: create ─────────────────────────────────────────
export const createAuctionDate = async (req, res) => {
    try {
        const { startDate, endDate, label, notes } = req.body;

        if (!startDate || !endDate) {
            return res
                .status(400)
                .json({ success: false, message: "startDate and endDate are required" });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end <= start) {
            return res
                .status(400)
                .json({ success: false, message: "End date must be after start date" });
        }

        const slot = await AuctionDate.create({
            startDate: start,
            endDate: end,
            label: label || "",
            notes: notes || "",
            createdBy: req.user._id,
        });

        // Its catalogue on the home page (services/catalogueSyncService.js).
        await ensureCatalogueForSaleDate(slot, { createdBy: req.user._id })
            .catch((e) => console.error("Auto catalogue failed:", e.message));

        res.status(201).json({
            success: true,
            message: "Auction date created successfully",
            data: { auctionDate: slot },
        });
    } catch (error) {
        console.error("Create auction date error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create auction date",
        });
    }
};

// ── Admin: list (with usage counts) ───────────────────────
export const getAuctionDates = async (req, res) => {
    try {
        const { page = 1, limit = 50, status = "all" } = req.query;
        const now = new Date();

        const filter = {};
        if (status === "active") filter.isActive = true;
        if (status === "inactive") filter.isActive = false;
        if (status === "upcoming") {
            filter.isActive = true;
            filter.startDate = { $gt: now };
        }
        if (status === "past") filter.endDate = { $lt: now };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [slots, total] = await Promise.all([
            AuctionDate.find(filter)
                .populate("createdBy", "username companyName firstName lastName")
                .sort({ startDate: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            AuctionDate.countDocuments(filter),
        ]);

        // Attach usage counts
        const slotIds = slots.map((s) => s._id);
        const usage = await Auction.aggregate([
            { $match: { auctionDate: { $in: slotIds } } },
            { $group: { _id: "$auctionDate", count: { $sum: 1 } } },
        ]);
        const usageMap = new Map(usage.map((u) => [u._id.toString(), u.count]));

        const auctionDates = slots.map((s) => ({
            ...s.toObject(),
            usageCount: usageMap.get(s._id.toString()) || 0,
        }));

        res.status(200).json({
            success: true,
            data: {
                auctionDates,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / limit),
                    totalSlots: total,
                },
            },
        });
    } catch (error) {
        console.error("Get auction dates error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to fetch auction dates" });
    }
};

// ── Public: active slots that haven't closed yet ──────────
// A sale date stays open for new listings until its end date, so
// sellers can still join a sale that has already gone live.
export const getActiveAuctionDates = async (req, res) => {
    try {
        const now = new Date();
        const slots = await AuctionDate.find({
            isActive: true,
            endDate: { $gt: now },
        }).sort({ startDate: 1 });

        res.status(200).json({
            success: true,
            data: { auctionDates: slots },
        });
    } catch (error) {
        console.error("Get active auction dates error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to fetch active auction dates" });
    }
};

// ── Admin: update ─────────────────────────────────────────
export const updateAuctionDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate, label, notes, isActive } = req.body;

        const slot = await AuctionDate.findById(id);
        if (!slot)
            return res
                .status(404)
                .json({ success: false, message: "Auction date not found" });

        if (startDate) slot.startDate = new Date(startDate);
        if (endDate) slot.endDate = new Date(endDate);
        if (label !== undefined) slot.label = label;
        if (notes !== undefined) slot.notes = notes;
        if (isActive !== undefined) slot.isActive = isActive;

        await slot.save();
        if (slot.isActive) {
            await ensureCatalogueForSaleDate(slot, { createdBy: req.user._id })
                .catch((e) => console.error("Auto catalogue failed:", e.message));
        }

        res.status(200).json({
            success: true,
            message: "Auction date updated successfully",
            data: { auctionDate: slot },
        });
    } catch (error) {
        console.error("Update auction date error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to update auction date",
        });
    }
};

// ── Admin: soft toggle ────────────────────────────────────
export const toggleAuctionDateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const slot = await AuctionDate.findById(id);
        if (!slot)
            return res
                .status(404)
                .json({ success: false, message: "Auction date not found" });

        slot.isActive = !slot.isActive;
        await slot.save();

        res.status(200).json({
            success: true,
            message: `Auction date ${slot.isActive ? "activated" : "deactivated"}`,
            data: { auctionDate: slot },
        });
    } catch (error) {
        console.error("Toggle auction date error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to toggle auction date" });
    }
};

// ── Admin: hard delete ────────────────────────────────────
// Safe because auctions snapshot startDate/endDate at creation.
// Reference remains as a dangling ObjectId for audit purposes.
export const deleteAuctionDate = async (req, res) => {
    try {
        const { id } = req.params;
        const slot = await AuctionDate.findById(id);
        if (!slot)
            return res
                .status(404)
                .json({ success: false, message: "Auction date not found" });

        const usageCount = await Auction.countDocuments({ auctionDate: id });
        await AuctionDate.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Auction date deleted successfully",
            data: { previouslyUsedBy: usageCount },
        });
    } catch (error) {
        console.error("Delete auction date error:", error);
        res
            .status(500)
            .json({ success: false, message: "Failed to delete auction date" });
    }
};