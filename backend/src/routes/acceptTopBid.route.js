import { Router } from "express";
import { acceptTopBid, previewAcceptTopBid } from "../services/acceptTopBidService.js";

// Seller accepts the highest bid after the reserve wasn't met – mounted at
// /api/v1/accept-top-bid. The signed link in the seller's email authorises it,
// so no login is needed. GET only reads (email scanners open links); the sale
// happens on POST from the confirm page.
const acceptTopBidRouter = Router();

const fail = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) console.error(fallback, error);
  res.status(status).json({ success: false, message: status >= 500 ? fallback : error.message });
};

acceptTopBidRouter.get("/:token", async (req, res) => {
  try {
    res.json({ success: true, data: await previewAcceptTopBid(req.params.token) });
  } catch (error) {
    fail(res, error, "Something went wrong loading this offer. Please try again or contact RexBid.");
  }
});

acceptTopBidRouter.post("/:token", async (req, res) => {
  try {
    const { auction, alreadyAccepted } = await acceptTopBid(req.params.token);
    res.json({
      success: true,
      message: alreadyAccepted
        ? "You've already accepted this bid. The sale is going ahead."
        : "Sold! We've told the buyer and sent them the payment details.",
      data: { auctionId: auction._id, alreadyAccepted },
    });
  } catch (error) {
    fail(res, error, "Something went wrong accepting this bid. Please try again or contact RexBid.");
  }
});

export default acceptTopBidRouter;
