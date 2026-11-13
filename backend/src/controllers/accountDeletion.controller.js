import User from "../models/user.model.js";
import { deleteAccount, findDeletionBlockers } from "../services/accountDeletionService.js";

// GET /api/v1/users/me/deletion-check
// What (if anything) must be finished before the account can be deleted.
export const deletionCheck = async (req, res) => {
    try {
        const blockers = await findDeletionBlockers(req.user._id);
        res.status(200).json({ success: true, data: { canDelete: blockers.length === 0, blockers } });
    } catch (error) {
        console.error("deletionCheck:", error);
        res.status(500).json({ success: false, message: "Could not check your account" });
    }
};

// POST /api/v1/users/me/delete  { password, confirm: "DELETE", reason? }
export const deleteMyAccount = async (req, res) => {
    try {
        const { password, confirm, reason } = req.body || {};
        if (confirm !== "DELETE") {
            return res.status(400).json({ success: false, message: 'Type DELETE to confirm' });
        }
        if (req.user.userType === "admin") {
            return res.status(403).json({ success: false, message: "Admin accounts can't be deleted here" });
        }
        const user = await User.findById(req.user._id).select("+sessions");
        if (!user || user.deletedAt) {
            return res.status(404).json({ success: false, message: "Account not found" });
        }
        if (!password || !(await user.isPasswordCorrect(String(password)))) {
            return res.status(401).json({ success: false, message: "That password isn't right" });
        }

        try {
            await deleteAccount(user, { reason });
        } catch (err) {
            if (err.blockers) {
                return res.status(409).json({ success: false, message: "Please finish these first", data: { blockers: err.blockers } });
            }
            throw err;
        }
        res.status(200).json({ success: true, message: "Your account has been deleted" });
    } catch (error) {
        console.error("deleteMyAccount:", error);
        res.status(500).json({ success: false, message: "Could not delete your account. Please contact us." });
    }
};
