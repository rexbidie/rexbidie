// Edits to listings that are live (or approved and waiting to start).
//
// The listing stays up with its current details while RexBid checks the edit.
// The edit is kept on the listing as `pendingEdit` until an admin approves it
// (applied then) or sends it back with a note. Admins are emailed when an
// edit comes in; the seller is emailed with the decision. Files the edit
// removes are only deleted once it's approved; files it added are deleted if
// it's sent back or discarded.
//
// Once a lot has bids, the details bidders relied on are locked: title,
// categories, auction type, start price, sale dates and the reserve (use
// Lower reserve). The bid increment is changed separately (Change increment).

import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { deleteFromCloudinary } from "../utils/cloudinary.js";
import { listingEditDecisionEmail, listingEditedAdminEmail } from "../utils/nodemailer.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Statuses where an edit waits for approval instead of taking the listing down. */
export const HOLD_EDIT_STATUSES = ["active", "approved"];

const LABELS = {
  title: "Title",
  subTitle: "Subtitle",
  description: "Description",
  features: "Features",
  categories: "Categories",
  specifications: "Specifications",
  location: "Location",
  videoLink: "Video link",
  startPrice: "Start price",
  reservePrice: "Reserve",
  buyNowPrice: "Buy Now price",
  bidIncrement: "Bid increment",
  auctionType: "Auction type",
  allowOffers: "Allow offers",
  paymentCollectionPreference: "Payment collection",
  vatIncluded: "VAT",
  startDate: "Start date",
  endDate: "End date",
  auctionDate: "Sale date",
  photos: "Photos",
  documents: "Documents",
  serviceRecords: "Service records",
  "liveBuyNow.price": "Buy It Now price",
};

/** Fields bidders relied on: locked once there are bids. */
const LOCKED_WITH_BIDS = ["title", "categories", "auctionType", "startPrice", "reservePrice", "bidIncrement", "startDate", "endDate", "auctionDate"];

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

/** A comparable, readable form of a field's value. */
const normalise = (field, value) => {
  if (value == null || value === "") return "";
  if (value instanceof Map) value = Object.fromEntries(value);
  if (field === "photos" || field === "documents" || field === "serviceRecords") {
    return (value || []).map((f) => `${f.url || ""}|${f.caption || ""}`).join("\n");
  }
  if (field === "categories") return [...value].map(String).join(", ");
  if (value instanceof Date) return value.toISOString();
  if (field === "startDate" || field === "endDate") return new Date(value).toISOString();
  if (typeof value === "object" && value._bsontype === "ObjectId") return String(value);
  if (typeof value === "object") {
    const plain = typeof value.toObject === "function" ? value.toObject() : value;
    return JSON.stringify(Object.keys(plain).sort().reduce((o, k) => ({ ...o, [k]: plain[k] }), {}));
  }
  if (typeof value === "number") return String(value);
  return String(value);
};

/** Names of the fields an update would change on this listing. */
export const changedFields = (auction, update) =>
  Object.keys(LABELS).filter((field) => {
    if (!(field in update)) return false;
    const before = field === "specifications" ? auction.specifications : getPath(auction, field);
    return normalise(field, before) !== normalise(field, update[field]);
  });

/** Error if the edit changes a field that's locked because the lot has bids. */
export const lockedFieldError = (auction, changed) => {
  if (!(Number(auction.bidCount) > 0)) return null;
  const locked = changed.filter((f) => LOCKED_WITH_BIDS.includes(f));
  if (!locked.length) return null;
  const names = locked.map((f) => LABELS[f].toLowerCase()).join(", ");
  const hints = [];
  if (locked.includes("reservePrice")) hints.push("use Lower reserve to lower the reserve");
  if (locked.includes("bidIncrement")) hints.push("use Change increment for the bid increment");
  return `This lot has bids, so the ${names} can't be changed${hints.length ? ` (${hints.join("; ")})` : ""}.`;
};

/** Plain data safe to store in the database and apply later. */
const storable = (update) => {
  const out = {};
  for (const [k, v] of Object.entries(update)) {
    if (v === undefined) continue;
    out[k] = v instanceof Map ? Object.fromEntries(v) : v;
  }
  return out;
};

const fileIds = (files = []) => files.flatMap((f) => [f?.publicId, f?.thumbPublicId]).filter(Boolean);

const deleteFiles = async (ids = []) => {
  for (const id of ids) {
    try {
      await deleteFromCloudinary(id);
    } catch (err) {
      console.error("Could not delete file", id, err?.message);
    }
  }
};

/** Files in a stored edit that the live listing doesn't use (to clean up). */
const unusedNewFiles = (auction, edit) => {
  const live = new Set(fileIds([...(auction.photos || []), ...(auction.documents || []), ...(auction.serviceRecords || [])]));
  return (edit?.newFiles || []).filter((id) => !live.has(id));
};

const notifyAdmins = async (auction, changed, { live }) => {
  try {
    const seller = await User.findById(auction.seller).select("username companyName firstName lastName email phone");
    const admins = await User.find({ userType: "admin" }).select("email");
    for (const admin of admins) {
      await listingEditedAdminEmail(admin.email, auction, seller, changed.map((f) => LABELS[f] || f), { live })
        .catch((e) => console.error("Listing edited email failed:", e?.message));
    }
  } catch (err) {
    console.error("Could not notify admins of edit:", err?.message);
  }
};

/** Emails admins about an edit to a listing that went back to approval (not live). */
export const notifyAdminsOfResubmission = (auction, changed) => notifyAdmins(auction, changed, { live: false });

/**
 * Keeps an edit to a live listing for approval. `update` is the full set of
 * fields the edit form produced; `filesToDelete` the files it removed;
 * `newFiles` the file ids it uploaded.
 */
export const holdEditForApproval = async (auction, update, { filesToDelete = [], newFiles = [] } = {}) => {
  const changed = changedFields(auction, update);
  if (!changed.length) {
    await deleteFiles(newFiles);
    return { changed };
  }
  const lockErr = lockedFieldError(auction, changed);
  if (lockErr) {
    await deleteFiles(newFiles);
    throw httpError(400, lockErr);
  }

  // A newer edit replaces an older one still waiting.
  const previous = auction.pendingEdit?.status === "pending" ? auction.pendingEdit : null;
  const data = storable(Object.fromEntries(changed.map((f) => [f, update[f]])));
  auction.pendingEdit = {
    data,
    changedFields: changed,
    filesToDelete,
    newFiles,
    status: "pending",
    note: null,
    submittedAt: new Date(),
  };
  auction.markModified("pendingEdit");
  await auction.save();
  if (previous) {
    const keep = new Set([...newFiles, ...fileIds([...(update.photos || []), ...(update.documents || []), ...(update.serviceRecords || [])])]);
    await deleteFiles(unusedNewFiles(auction, previous).filter((id) => !keep.has(id)));
  }

  await notifyAdmins(auction, changed, { live: true });
  return { changed };
};

/** Admin list of edits waiting for approval, with before and after per field. */
export const listPendingEdits = async () => {
  const lots = await Auction.find({ "pendingEdit.status": "pending" })
    .select("title status bidCount currentPrice baseCurrency seller sellerUsername photos documents serviceRecords pendingEdit endDate " + Object.keys(LABELS).filter((f) => !f.includes(".")).join(" ") + " liveBuyNow")
    .populate("seller", "username companyName firstName lastName email")
    .sort({ "pendingEdit.submittedAt": 1 })
    .lean();
  return lots.map((a) => ({
    _id: a._id,
    title: a.title,
    status: a.status,
    bidCount: a.bidCount,
    currentPrice: a.currentPrice,
    currency: a.baseCurrency || "EUR",
    endDate: a.endDate,
    seller: a.seller,
    submittedAt: a.pendingEdit.submittedAt,
    changes: (a.pendingEdit.changedFields || []).map((field) => ({
      field,
      label: LABELS[field] || field,
      before: describe(field, getPath(a, field)),
      after: describe(field, a.pendingEdit.data?.[field]),
      ...(field === "photos" ? { beforePhotos: (a.photos || []).map((p) => p.thumbUrl || p.url), afterPhotos: (a.pendingEdit.data.photos || []).map((p) => p.thumbUrl || p.url) } : {}),
    })),
  }));
};

const describe = (field, value) => {
  if (value == null || value === "") return "(empty)";
  if (field === "photos" || field === "documents" || field === "serviceRecords") {
    const n = (value || []).length;
    return `${n} ${field === "photos" ? "photo" : field === "documents" ? "document" : "service record"}${n === 1 ? "" : "s"}`;
  }
  if (field === "categories") return [...value].join(", ");
  if (field === "specifications") {
    const obj = value instanceof Map ? Object.fromEntries(value) : value;
    return Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join("\n") || "(empty)";
  }
  if (field === "startDate" || field === "endDate") return new Date(value).toLocaleString("en-IE", { timeZone: "Europe/Dublin" });
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const sellerOf = (auction) => User.findById(auction.seller).select("email firstName companyName username");

/** Admin approves: the edit is applied to the live listing. */
export const approveEdit = async (auctionId, admin) => {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw httpError(404, "Listing not found");
  const edit = auction.pendingEdit;
  if (edit?.status !== "pending") throw httpError(400, "There's no edit waiting on this listing.");

  // Bids may have come in since it was submitted: leave locked fields as they are.
  let fields = edit.changedFields || [];
  const skipped = Number(auction.bidCount) > 0 ? fields.filter((f) => LOCKED_WITH_BIDS.includes(f)) : [];
  fields = fields.filter((f) => !skipped.includes(f));
  const set = Object.fromEntries(fields.map((f) => [f, edit.data[f]]));

  await Auction.updateOne(
    { _id: auction._id },
    {
      $set: { ...set, pendingEdit: null, lastEditApprovedAt: new Date(), lastEditApprovedBy: admin?._id || null },
    },
    { runValidators: true }
  );
  await deleteFiles(edit.filesToDelete || []);
  broadcastAuctionChange(auction._id);

  const seller = await sellerOf(auction);
  if (seller) {
    await listingEditDecisionEmail(seller.email, seller.firstName || seller.companyName || seller.username, auction, { approved: true })
      .catch((e) => console.error("Edit approved email failed:", e?.message));
  }
  return { applied: fields, skipped: skipped.map((f) => LABELS[f] || f) };
};

/** Admin sends the edit back with a note; the listing stays as it is. */
export const rejectEdit = async (auctionId, note, admin) => {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw httpError(404, "Listing not found");
  const edit = auction.pendingEdit;
  if (edit?.status !== "pending") throw httpError(400, "There's no edit waiting on this listing.");
  const cleanNote = String(note || "").trim().slice(0, 1000);
  if (!cleanNote) throw httpError(400, "Please add a note for the seller.");

  await deleteFiles(unusedNewFiles(auction, edit));
  auction.pendingEdit = { status: "rejected", note: cleanNote, changedFields: edit.changedFields, reviewedAt: new Date(), reviewedBy: admin?._id || null };
  auction.markModified("pendingEdit");
  await auction.save();

  const seller = await sellerOf(auction);
  if (seller) {
    await listingEditDecisionEmail(seller.email, seller.firstName || seller.companyName || seller.username, auction, { approved: false, note: cleanNote })
      .catch((e) => console.error("Edit sent back email failed:", e?.message));
  }
};

/** Seller withdraws an edit that's waiting, or clears a sent-back note. */
export const discardEdit = async (auction) => {
  const edit = auction.pendingEdit;
  if (!edit?.status) throw httpError(400, "There's no edit to discard.");
  if (edit.status === "pending") await deleteFiles(unusedNewFiles(auction, edit));
  auction.pendingEdit = null;
  auction.markModified("pendingEdit");
  await auction.save();
};

export { fileIds, deleteFiles, LABELS as EDIT_LABELS };
