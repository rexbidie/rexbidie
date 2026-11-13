// Admin: edits to live listings waiting for approval (services/listingEditService.js).
import { approveEdit, listPendingEdits, rejectEdit } from "../services/listingEditService.js";

const fail = (res, error, fallback) => {
  if (!error?.status) console.error(fallback, error);
  res.status(error?.status || 500).json({ success: false, message: error?.status ? error.message : fallback });
};

// GET /api/v1/admin/listing-edits
export const pendingEdits = async (req, res) => {
  try {
    res.json({ success: true, data: await listPendingEdits() });
  } catch (error) {
    fail(res, error, "Could not load edits");
  }
};

// POST /api/v1/admin/listing-edits/:id/approve
export const approve = async (req, res) => {
  try {
    const { skipped } = await approveEdit(req.params.id, req.user);
    res.json({
      success: true,
      message: skipped.length
        ? `Changes applied. Bids came in since the edit, so these were left as they were: ${skipped.join(", ")}.`
        : "Changes approved and live. The seller has been emailed.",
    });
  } catch (error) {
    fail(res, error, "Could not approve the edit");
  }
};

// POST /api/v1/admin/listing-edits/:id/reject  { note }
export const reject = async (req, res) => {
  try {
    await rejectEdit(req.params.id, req.body?.note, req.user);
    res.json({ success: true, message: "Sent back to the seller with your note." });
  } catch (error) {
    fail(res, error, "Could not send the edit back");
  }
};
