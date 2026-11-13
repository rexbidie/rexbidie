import Agenda from "agenda";
import { syncSales } from "./saleService.js";
import { runReminders } from "./reminderService.js";
import Auction from "../models/auction.model.js";
import backendAxios from "../utils/backendAxios.js";
import {
  cancelAllBidderAuthorizations,
  cancelLosingBidderAuthorizations,
  chargeWinningBidder,
  chargeWinningBidderDirect,
} from "../controllers/bidPayment.controller.js";
import {
  auctionEndedAdminEmail,
  auctionEndingSoonEmail,
  auctionEndingSoonSellerEmail,
  auctionListedEmail,
  auctionReserveNotMetEmail,
  auctionWonAdminEmail,
  paymentSuccessEmail,
  sendAuctionEndedSellerEmail,
  sendAuctionWonEmail,
  sendBulkAuctionNotifications,
  auctionReserveNudgeEmail,
} from "../utils/nodemailer.js";
import User from "../models/user.model.js";
import Watchlist from "../models/watchlist.model.js";
import Reminder from "../models/reminder.model.js";
import { broadcastAuctionChange } from "./realtimeService.js";

/**
 * Returns up to `limit` unique bidders ordered by their highest bid (descending).
 * Each entry: { bidder, amount }
 */
const getTopUniqueBidders = (bids = [], limit = 2) => {
  const highestByBidder = new Map();

  for (const bid of bids) {
    const id = bid?.bidder?.toString?.() || bid?.bidder;
    if (!id) continue;
    const prev = highestByBidder.get(id);
    if (!prev || bid.amount > prev.amount) {
      highestByBidder.set(id, {
        bidder: bid.bidder,
        amount: bid.amount,
      });
    }
  }

  return Array.from(highestByBidder.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

class AgendaService {
  constructor() {
    this.agenda = new Agenda({
      db: { address: process.env.MONGODB_URI, collection: "agendaJobs" },
      processEvery: "30 seconds", // Check for due jobs every 30 seconds
    });

    this.defineJobs();
  }

  defineJobs() {
    // Job to activate an auction at its start time
    this.agenda.define("activate auction", async (job) => {
      const { auctionId } = job.attrs.data;

      try {
        const auction = await Auction.findById(auctionId);
        if (auction && auction.status === "approved") {
          auction.status = "active";
          await auction.save();
          await auction.populate("seller", "email username companyName firstName");

          broadcastAuctionChange(auction._id);

          // Send email to seller
          await auctionListedEmail(auction, auction.seller);

          // Send bulk notifications to all users (except admin and auction seller)
          const allUsers = await User.find({
            _id: { $ne: auction.seller._id }, // Exclude auction owner
            userType: { $ne: "admin" }, // Exclude admin users
            isActive: true, // Only active users
          }).select("email username companyName firstName preferences userType");

          // Send bulk notifications
          // await sendBulkAuctionNotifications(allUsers, auction, auction.seller);

          // console.log(`✅ Agenda: Activated auction ${auctionId}`);
        }
      } catch (error) {
        console.error("Agenda job error (activate auction):", error);
        // Job will retry based on Agenda's retry logic
      }
    });

    this.agenda.define("end auction", async (job) => {
      const { auctionId } = job.attrs.data;

      try {
        let auction = await Auction.findById(auctionId).populate(
          "seller",
          "email phone username companyName firstName currency",
        );
        // Don't populate winner initially since it might be null

        if (!auction) {
          console.log(`❌ Agenda: Auction ${auctionId} not found`);
          return;
        }

        // NEW: Skip ending for giveaways - they should only end when claimed
        // Skip ending for always-available auctions (buy_now and giveaway)
        if (
          auction.auctionType === "buy_now" ||
          auction.auctionType === "giveaway"
        ) {
          console.log(
            `🛒 Auction ${auctionId} is ${auction.auctionType} - skipping auto-end (waiting for purchase)`,
          );
          return;
        }

        // Only process if auction is still active and end date has passed
        if (auction.status === "active" && new Date() >= auction.endDate) {
          // CRITICAL CHECK: Skip if auction already has a winner (means offer was accepted or buy now used)
          if (auction.winner) {
            console.log(
              `ℹ️ Agenda: Auction ${auctionId} already has a winner, skipping automated ending`,
            );
            return;
          }

          // CRITICAL CHECK: Skip if auction status is already sold
          const soldStatuses = ["sold", "sold_buy_now"];
          if (soldStatuses.includes(auction.status)) {
            console.log(
              `ℹ️ Agenda: Auction ${auctionId} is already in sold status (${auction.status}), skipping`,
            );
            return;
          }

          // Check if any offer is accepted
          const hasAcceptedOffer =
            auction.offers &&
            auction.offers.some(
              (offer) =>
                offer.status === "accepted" || offer.status === "completed",
            );

          if (hasAcceptedOffer) {
            console.log(
              `ℹ️ Agenda: Auction ${auctionId} has accepted offer, skipping automated ending`,
            );
            return;
          }
          // ⬇️ ADD — let any last-moment proxies fire before we finalize
          const { processProxyBids } = await import("./proxyBidService.js");
          await processProxyBids(auctionId);

          // Re-fetch — proxy auto-bids may have extended endDate or changed winner
          auction = await Auction.findById(auctionId).populate(
            "seller", "email phone username companyName firstName currency"
          );

          if (new Date() < auction.endDate) {
            await this.scheduleAuctionEnd(auctionId, auction.endDate);
            broadcastAuctionChange(auctionId);
            console.log(`🔄 Agenda: Extended by proxy — rescheduled ${auctionId} to ${auction.endDate}`);
            return;
          }
          if (auction.winner) return;

          const result = await auction.endAuction();

          broadcastAuctionChange(auctionId);

          // Re-fetch the auction with populated winner if it was sold
          if (result.wasSold) {
            auction = await Auction.findById(auctionId)
              .populate("seller", "email phone username companyName firstName currency")
              .populate("winner", "email phone username companyName firstName address currency");
          }

          // Send appropriate emails based on the result
          if (result.wasSold) {
            console.log(
              `✅ Agenda: Auction ${auctionId} was SOLD to ${auction.winner ? auction.winner.username ? auction.winner.username : auction.winner.companyName : "unknown"
              }`,
            );

            // Send auction won email to buyer
            await sendAuctionWonEmail(auction);
            await sendAuctionEndedSellerEmail(auction);

            // Send admin email for sold auction
            const adminUsers = await User.find({ userType: "admin" });
            for (const admin of adminUsers) {
              await auctionWonAdminEmail(admin.email, admin?.currency, auction, auction.winner);
            }

            console.log(`✅ Agenda: Sent SOLD emails for auction ${auctionId}`);
          } else {
            console.log(
              `✅ Agenda: Auction ${auctionId} ended without sale (status: ${result.newStatus})`,
            );

            // Send seller email (auction ended without sale)
            await sendAuctionEndedSellerEmail(auction);

            // ── Buy It Now after the auction: start it if the seller set a price
            //    in advance, otherwise invite the seller to set one. ──
            let binStarted = false;
            if (result.newStatus === "reserve_not_met") {
              try {
                const { handleReserveNotMet } = await import("./postAuctionBinService.js");
                binStarted = await handleReserveNotMet(auctionId);
              } catch (err) {
                console.error(`Buy It Now start failed for ${auctionId}:`, err.message);
              }
            }

            // ── Reserve not met → notify top 2 bidders with the reserve price ──
            // (skipped when the lot went straight onto Buy It Now: bidders get
            //  the Buy It Now email instead)
            if (
              !binStarted &&
              result.newStatus === "reserve_not_met" &&
              Array.isArray(auction.bids) &&
              auction.bids.length > 0
            ) {
              try {
                // Ensure we have bidder details populated
                await auction.populate(
                  "bids.bidder",
                  "email username companyName firstName lastName",
                );

                const topBidders = getTopUniqueBidders(auction.bids, 2);

                for (let i = 0; i < topBidders.length; i++) {
                  const { bidder, amount } = topBidders[i];
                  if (!bidder?.email) continue;

                  try {
                    await auctionReserveNotMetEmail(
                      bidder.email,
                      bidder.username ||
                      bidder.companyName ||
                      bidder.firstName ||
                      "",
                      auction,
                      i + 1,      // rank: 1 or 2
                      amount,
                    );
                  } catch (err) {
                    console.error(
                      `Failed reserve-not-met email to ${bidder.email}:`,
                      err.message,
                    );
                  }
                }

                console.log(
                  `📧 Sent reserve-not-met emails to ${topBidders.length} top bidder(s) for auction ${auctionId}`,
                );
              } catch (err) {
                console.error(
                  `Error sending reserve-not-met notifications for ${auctionId}:`,
                  err.message,
                );
              }
            }

            // Send admin email for ended auction
            const adminUsers = await User.find({ userType: "admin" });
            for (const admin of adminUsers) {
              await auctionEndedAdminEmail(admin.email, admin?.currency, auction);
            }

            console.log(
              `✅ Agenda: Sent ENDED emails for auction ${auctionId}`,
            );
          }
        } else if (
          auction.status === "active" &&
          new Date() < auction.endDate
        ) {
          // Auction was extended, reschedule the job
          await this.scheduleAuctionEnd(auctionId, auction.endDate);
          broadcastAuctionChange(auctionId);
          console.log(
            `🔄 Agenda: Rescheduled auction ${auctionId} to ${auction.endDate}`,
          );
        } else {
          console.log(
            `ℹ️ Agenda: Auction ${auctionId} status is ${auction.status}, skipping`,
          );
        }
      } catch (error) {
        console.error("Agenda job error (end auction):", error);
      }
    });

    // Job to send an email campaign at its scheduled time
    this.agenda.define("send email campaign", async (job) => {
      const { campaignId } = job.attrs.data;
      try {
        // Lazy import to avoid circular dependency with the controller
        const { processCampaign } = await import(
          "../controllers/emailCampaign.controller.js"
        );
        await processCampaign(campaignId);
      } catch (error) {
        console.error("Agenda job error (send email campaign):", error);
      }
    });

    // Job to send notifications for auctions ending soon
    // this.agenda.define("send ending soon notifications", async (job) => {
    //   try {
    //     const now = new Date();

    //     // Define multiple time thresholds
    //     const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    //     const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    //     const twentyFourHoursFromNow = new Date(
    //       now.getTime() + 24 * 60 * 60 * 1000,
    //     );

    //     // Find auctions ending within our thresholds that haven't had notifications sent yet
    //     const endingSoonAuctions = await Auction.find({
    //       status: "active",
    //       $or: [
    //         {
    //           // Ending in exactly 30 minutes (±15 minutes window)
    //           endDate: {
    //             $lte: thirtyMinutesFromNow,
    //             $gte: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes from now
    //           },
    //           "notifications.ending30min": { $ne: true }, // Not sent yet
    //         },
    //         {
    //           // Ending in exactly 2 hours (±15 minutes window)
    //           endDate: {
    //             $lte: twoHoursFromNow,
    //             $gte: new Date(now.getTime() + 105 * 60 * 1000), // 1 hour 45 minutes from now
    //           },
    //           "notifications.ending2hour": { $ne: true }, // Not sent yet
    //         },
    //         {
    //           // Ending in exactly 24 hours (±15 minutes window)
    //           endDate: {
    //             $lte: twentyFourHoursFromNow,
    //             $gte: new Date(now.getTime() + 1425 * 60 * 1000), // 23 hours 45 minutes from now
    //           },
    //           "notifications.ending24hour": { $ne: true }, // Not sent yet
    //         },
    //       ],
    //     }).populate("seller", "email username companyName preferences userType currency"); // Populate seller to exclude them

    //     for (const auction of endingSoonAuctions) {
    //       // Calculate exact time remaining for this auction
    //       const timeRemaining = auction.endDate - now;
    //       const minutesRemaining = Math.ceil(timeRemaining / (60 * 1000));

    //       // Determine which notification threshold this auction falls into
    //       let notificationType, timeLabel;

    //       if (minutesRemaining <= 45 && minutesRemaining >= 15) {
    //         // 30-minute notification window (30 minutes ±15 minutes)
    //         notificationType = "ending30min";
    //         timeLabel = "30 minutes";
    //       } else if (minutesRemaining <= 135 && minutesRemaining >= 105) {
    //         // 2-hour notification window (2 hours ±15 minutes)
    //         notificationType = "ending2hour";
    //         timeLabel = "2 hours";
    //       } else if (minutesRemaining <= 1455 && minutesRemaining >= 1425) {
    //         // 24-hour notification window (24 hours ±15 minutes)
    //         notificationType = "ending24hour";
    //         timeLabel = "24 hours";
    //       } else {
    //         // Skip if not in any precise notification window
    //         continue;
    //       }

    //       // Find ALL users who should receive notifications (excluding auction seller, admins, and opted-out users)
    //       const allUsers = await User.find({
    //         _id: { $ne: auction.seller._id }, // Exclude auction owner
    //         userType: { $nin: ["admin", "seller", "broker"] }, // Exclude admin, seller, and broker users
    //         "preferences.bidAlerts": { $ne: false }, // Exclude users who opted out
    //         isActive: true, // Only active users
    //       }).select("email username companyName preferences userType");

    //       // Send to each user
    //       for (const user of allUsers) {
    //         try {
    //           await auctionEndingSoonEmail(
    //             user.email,
    //             user.username || user.companyName || '',
    //             auction,
    //             timeLabel,
    //           );
    //           console.log(
    //             `✅ Sent ${timeLabel} notification to ${user.email} (${user.userType}) for auction ${auction.title}`,
    //           );
    //         } catch (error) {
    //           console.error(
    //             `Failed to send ending soon email to ${user.email}:`,
    //             error,
    //           );
    //         }
    //       }

    //       // Mark this notification as sent in the auction document
    //       await Auction.findByIdAndUpdate(auction._id, {
    //         $set: {
    //           [`notifications.${notificationType}`]: true,
    //           [`notifications.${notificationType}SentAt`]: new Date(),
    //         },
    //       });

    //       console.log(
    //         `📧 Sent ${timeLabel} notifications for auction "${auction.title}" to ${allUsers.length} users`,
    //       );
    //     }

    //     console.log(
    //       `📧 Completed ending soon notifications for ${endingSoonAuctions.length} auctions`,
    //     );
    //   } catch (error) {
    //     console.error("Agenda job error (ending soon notifications):", error);
    //   }
    // });

    // Buy It Now after the auction: end windows that have run out.
    // Scheduled for each lot's end time, plus a 15-minute sweep as a safety net.
    this.agenda.define("end post-auction buy it now", async () => {
      try {
        const { expireBins } = await import("./postAuctionBinService.js");
        const expired = await expireBins();
        if (expired) console.log(`Buy It Now: ${expired} ended without a sale`);
      } catch (error) {
        console.error("Agenda job error (end post-auction buy it now):", error);
      }
    });

    // Creates a Sale record for every newly sold lot and keeps paid status in step.
    this.agenda.define("sync sales", async () => {
      try {
        const { moveUnpaidExtrasDrafts } = await import("./listingExtrasService.js");
        await moveUnpaidExtrasDrafts().catch((e) => console.error("Unpaid extras check failed:", e?.message));
        const { created, markedPaid, ibansAdded } = await syncSales({ ibanLimit: 50 });
        if (created || markedPaid || ibansAdded) {
          console.log(`Sales sync: ${created} created, ${markedPaid} marked paid, ${ibansAdded} IBANs added`);
        }
      } catch (error) {
        console.error("Agenda job error (sync sales):", error);
      }
    });

    // Payment and collection reminders for sales (each sent once, 08:00-20:00).
    this.agenda.define("send sale reminders", async () => {
      try {
        const { sent } = await runReminders();
        if (sent) console.log(`Sale reminders: ${sent} sent`);
      } catch (error) {
        console.error("Agenda job error (sale reminders):", error);
      }
    });

    // Job to notify users 2 hours before an auction ends
    this.agenda.define("send ending soon notifications", async (job) => {
      try {
        const now = new Date();

        // Target window: auctions ending between 1h45m and 2h from now.
        // Since this job runs every 15 minutes, we safely catch every auction
        // once (and only once) as it crosses the 2-hour mark.
        const lowerBound = new Date(now.getTime() + 105 * 60 * 1000); // 1h 45m
        const upperBound = new Date(now.getTime() + 120 * 60 * 1000); // 2h 00m

        const endingSoonAuctions = await Auction.find({
          status: "active",
          endDate: { $gte: lowerBound, $lte: upperBound },
          "notifications.ending2hour": { $ne: true }, // not sent yet
          // Only timed auctions have an "ending" event
          auctionType: { $in: ["standard", "reserve"] },
        }).populate("seller", "email username companyName firstName");

        if (endingSoonAuctions.length === 0) return;

        for (const auction of endingSoonAuctions) {
          // ── 1. Seller notification ──────────────────────────────────
          try {
            if (auction.seller?.email) {
              await auctionEndingSoonSellerEmail(
                auction.seller.email,
                auction.seller.username ||
                auction.seller.companyName ||
                auction.seller.firstName ||
                "",
                auction,
              );
            }
          } catch (err) {
            console.error(
              `Failed seller ending-soon email for auction ${auction._id}:`,
              err.message,
            );
          }

          // ── 2. Notify bidders AND watchlist users for this auction ──
          const bidderIds = (auction.bids || [])
            .map((b) => b.bidder?.toString())
            .filter(Boolean);

          // Users who added this auction to their watchlist
          const watcherIds = (await Watchlist.distinct("user", {
            auction: auction._id,
          })).map((id) => id.toString());

          // Merge + dedupe + exclude the seller
          const sellerId = auction.seller?._id?.toString();
          const recipientIds = [
            ...new Set([...bidderIds, ...watcherIds]),
          ].filter((id) => id && id !== sellerId);

          const recipients = recipientIds.length
            ? await User.find({
              _id: { $in: recipientIds },
              isActive: true,
            }).select("email username companyName firstName")
            : [];

          for (const user of recipients) {
            try {
              await auctionEndingSoonEmail(
                user.email,
                user.username || user.companyName || user.firstName || "",
                auction,
              );
            } catch (err) {
              console.error(
                `Failed ending-soon email to ${user.email}:`,
                err.message,
              );
            }
          }

          // ── 2b. Notify anonymous reminder users (unregistered visitors) ──
          const reminderDocs = await Reminder.find({
            auction: auction._id,
            unsubscribed: false,
            sent: false,
          }).select("_id name email");

          for (const reminder of reminderDocs) {
            try {
              await auctionEndingSoonEmail(
                reminder.email,
                reminder.name || "there",
                auction,
              );

              // Mark this reminder as sent (per-reminder idempotency)
              // await Reminder.findByIdAndUpdate(reminder._id, {
              //   $set: { sent: true, sentAt: new Date() },
              // });
            } catch (err) {
              console.error(
                `Failed ending-soon email to reminder ${reminder.email}:`,
                err.message,
              );
            }
          }

          console.log(
            `📧 Sent 2-hour reminder to ${reminderDocs.length} anonymous subscriber(s) for auction ${auction._id}`,
          );

          // ── 3. Mark as sent (idempotency) ───────────────────────────
          await Auction.findByIdAndUpdate(auction._id, {
            $set: {
              "notifications.ending2hour": true,
              "notifications.ending2hourSentAt": new Date(),
            },
          });

          console.log(
            `📧 Sent 2-hour ending notifications for "${auction.title}" — seller + ${recipients.length} recipient(s) (bidders: ${bidderIds.length}, watchers: ${watcherIds.length}, after dedupe: ${recipients.length})`,
          );
        }
      } catch (error) {
        console.error("Agenda job error (ending soon notifications):", error);
      }
    });

    // Job to nudge sellers when their reserve is within reach in the last hour
    this.agenda.define("send reserve nudge notifications", async (job) => {
      try {
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

        // Only reserve auctions that:
        //   - are still active and end within the next 60 minutes
        //   - have at least one bid
        //   - have NOT yet met the reserve
        //   - current bid is >= 75% of reserve (i.e. within 25% of reserve)
        //   - haven't already received the nudge
        const candidates = await Auction.find({
          status: "active",
          auctionType: "reserve",
          endDate: { $gt: now, $lte: oneHourFromNow },
          bidCount: { $gt: 0 },
          "notifications.reserveNudge": { $ne: true },
          $expr: {
            $and: [
              { $lt: ["$currentPrice", "$reservePrice"] },
              {
                $gte: [
                  "$currentPrice",
                  { $multiply: ["$reservePrice", 0.75] },
                ],
              },
            ],
          },
        }).populate(
          "seller",
          "email username companyName firstName lastName currency preferences"
        );

        if (candidates.length === 0) return;

        for (const auction of candidates) {
          if (!auction.seller?.email) continue;

          try {
            await auctionReserveNudgeEmail(auction.seller, auction);

            // Mark as sent so it never fires twice for the same auction
            await Auction.findByIdAndUpdate(auction._id, {
              $set: {
                "notifications.reserveNudge": true,
                "notifications.reserveNudgeSentAt": new Date(),
              },
            });

            console.log(
              `📧 Reserve-nudge email sent to seller ${auction.seller.email} for auction ${auction._id} ` +
              `(bid ${auction.currentPrice} / reserve ${auction.reservePrice} ${auction.baseCurrency})`
            );
          } catch (err) {
            console.error(
              `Failed reserve-nudge email for auction ${auction._id}:`,
              err.message
            );
          }
        }
      } catch (error) {
        console.error("Agenda job error (reserve nudge):", error);
      }
    });
  }

  // Schedule auction activation job
  async scheduleAuctionActivation(auctionId, startDate) {
    await this.agenda.schedule(startDate, "activate auction", { auctionId });
    // console.log(`📅 Scheduled activation for auction ${auctionId} at ${startDate}`);
  }

  // Schedule auction ending job
  async scheduleAuctionEnd(auctionId, endDate) {
    await this.agenda.schedule(endDate, "end auction", { auctionId });
    // console.log(`📅 Scheduled ending for auction ${auctionId} at ${endDate}`);
  }

  // Buy It Now after the auction: end the window at endsAt
  async scheduleBinEnd(auctionId, endsAt) {
    await this.agenda.schedule(endsAt, "end post-auction buy it now", { auctionId, kind: "bin" });
  }

  async cancelBinJobs(auctionId) {
    await this.agenda.cancel({ name: "end post-auction buy it now", "data.auctionId": auctionId });
  }

  // Cancel jobs if auction is deleted or modified
  async cancelAuctionJobs(auctionId) {
    await this.agenda.cancel({
      "data.auctionId": auctionId,
    });
    console.log(`🗑️ Cancelled jobs for auction ${auctionId}`);
  }

  // Start Agenda
  async start() {
    await this.agenda.start();
    console.log("🕒 Agenda service started");
    await this.agenda.every("15 minutes", "send ending soon notifications");
    await this.agenda.every("15 minutes", "send reserve nudge notifications");
    await this.agenda.every("15 minutes", "sync sales");
    await this.agenda.every("15 minutes", "end post-auction buy it now");
    await this.agenda.every("30 minutes", "send sale reminders");
  }

  // Graceful shutdown
  async stop() {
    await this.agenda.stop();
    console.log("🛑 Agenda service stopped");
  }
}

export default new AgendaService();
