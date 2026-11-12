import express from "express";
import "dotenv/config";
import dbConnect from "./db/index.js";
import cors from "cors";
import { configureCloudinary } from "./utils/cloudinary.js";
import compression from "compression";
import userRouter from "./routes/user.route.js";
import auctionRouter from "./routes/auction.route.js";
import agendaService from './services/agendaService.js';
import watchlistRouter from "./routes/watchlist.route.js";
import commentRouter from "./routes/comment.route.js";
import { questionRouter, smsRouter } from "./routes/question.route.js";
import bidRouter from "./routes/bid.route.js";
import AdminRouter from "./routes/admin.route.js";
import commissionRouter from "./routes/commission.routes.js";
import bidPaymentRouter from "./routes/bidPayment.route.js";
import contactQueryRouter from "./routes/contactQuery.route.js";
import offerRouter from "./routes/offer.route.js";
import buyNowRouter from "./routes/buyNow.route.js";
import postAuctionBinRouter from "./routes/postAuctionBin.route.js";
import categoryRouter from "./routes/category.route.js";
import checkoutRouter from "./routes/checkout.route.js";
import paymentRouter from "./routes/payment.route.js";
import payoutRouter from "./routes/payout.route.js";
import reviewRouter from "./routes/review.route.js";
import currencyRouter from "./routes/currency.route.js";
import pilotPhaseRouter from "./routes/pilotPhase.route.js";
import auctionDateRouter from "./routes/auctionDate.route.js";
import reminderRouter from "./routes/reminder.route.js";
import deliveryQuoteRouter from "./routes/deliveryQuote.route.js";

import http from "http";
import { Server } from "socket.io";
import { setIO } from "./utils/socket.js";
import emailRouter from "./routes/email.route.js";
import catalogueRouter from "./routes/catalogue.route.js";
import websiteReviewRouter from "./routes/websiteReview.route.js";
import metaEventRouter from "./routes/metaEvent.route.js";
import sitemapRouter from './routes/sitemap.route.js';
import shareRouter from './routes/share.route.js';
import { jpegHandler } from './utils/jpegMedia.js';
import { adminSaleRouter, saleRouter } from "./routes/sale.route.js";
import connectRouter from "./routes/connect.route.js";
import { handleStripeWebhook } from "./controllers/payment.controller.js";

const app = express();
const PORT = process.env.PORT || 3000;

// 1. FIRST connect to database
await dbConnect();

// 2. THEN configure Cloudinary and Agenda
configureCloudinary();

// 3. Initialize Agenda
let agendaStarted = false;
try {
    await agendaService.start();
    agendaStarted = true;
    console.log('✅ Agenda service started successfully');
} catch (error) {
    console.error('❌ Failed to start Agenda:', error);
}

app.use(compression());

// Stripe webhook: needs the raw body for signature checks and no login,
// so it is registered before the JSON parser and the auth-protected routes.
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handleStripeWebhook);

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ limit: '16kb' }));

// app.use(cors({
//     origin: ['https://www.rexbid.ie', 'https://rexbid.ie', 'https://rexbid-frontend.onrender.com', 'https://rexbid-backend.onrender.com', 'http://localhost:5173', 'http://localhost:3000'],
//     credentials: true,
// }));

// 1. Define allowed origins
const allowedOrigins = [
    'https://www.rexbid.ie',
    'https://rexbid.ie',
    'https://rexbid-frontend.onrender.com',
    'https://rexbid-backend.onrender.com',
    'http://localhost:5173',
    'http://localhost:3000'
];

// 2. Custom middleware to handle CORS for ALL requests (including OPTIONS)
app.use((req, res, next) => {
    const origin = req.headers.origin;

    // If the origin is in our list, set the headers
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    }

    // Handle the preflight (OPTIONS) request immediately and stop further processing
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

// 3. (Optional but recommended) Explicitly tell Express to trust Render's proxy
app.set('trust proxy', 1);

// Health check
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        agenda: agendaStarted ? 'running' : 'failed'
    });
});

// Public XML sitemap for search engines (referenced from rexbid.ie/robots.txt)
app.use(sitemapRouter);
// Listing/catalogue HTML with link-preview tags (rexbid.ie rewrites /auction/* and /catalogue/* here)
app.use(shareRouter);
// JPEG copies of listing photos for Instagram and link previews (utils/jpegMedia.js)
app.get(/^\/media\/jpeg\/(.+)$/, jpegHandler);

// Your API routes
app.use('/api/v1/users', userRouter);
app.use('/api/v1/auctions', auctionRouter);
app.use('/api/v1/watchlist', watchlistRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/questions', questionRouter);
app.use('/api/v1/sms', smsRouter);
app.use('/api/v1/bids', bidRouter);
app.use('/api/v1/admin/sales', adminSaleRouter);
app.use('/api/v1/admin', AdminRouter);
app.use('/api/v1/sales', saleRouter);
app.use('/api/v1/stripe-connect', connectRouter);
app.use('/api/v1/commissions', commissionRouter);
app.use('/api/v1/bid-payments', bidPaymentRouter);
app.use('/api/v1/contact', contactQueryRouter);
app.use('/api/v1/offers', offerRouter);
app.use('/api/v1/buy-now', buyNowRouter);
app.use('/api/v1/buy-it-now', postAuctionBinRouter);
// app.use('/api/v1/admin/categories', categoryRouter);
app.use('/api/v1/categories', categoryRouter);
app.use("/api/v1/checkout", checkoutRouter);
app.use('/api/v1/payments', paymentRouter);
app.use("/api/v1/payouts", payoutRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/currency", currencyRouter);
app.use("/api/v1/meta-events", metaEventRouter);
app.use("/api/v1", pilotPhaseRouter);
app.use("/api/v1/auction-dates", auctionDateRouter);
app.use('/api/v1/reminders', reminderRouter);
app.use("/api/v1/delivery-quote", deliveryQuoteRouter);
app.use("/api/v1/admin/email", emailRouter);
app.use("/api/v1/catalogues", catalogueRouter);
app.use("/api/v1/website-review", websiteReviewRouter);

app.get('/api/v1/time', (req, res) => {
    res.set('Cache-Control', 'no-store'); // never cache
    res.status(200).json({ serverTime: Date.now() });
});

// 404 handler - SIMPLIFIED VERSION
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// ============ SOCKET.IO SETUP ============
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            'https://www.rexbid.ie',
            'https://rexbid.ie',
            'https://rexbid-frontend.onrender.com',
            'https://rexbid-backend.onrender.com',
            'http://localhost:5173',
            'http://localhost:3000',
        ],
        credentials: true,
    },
    transports: ["websocket", "polling"],

    // Give mobile clients more room before we drop them.
    // Default is pingInterval 25000 / pingTimeout 20000.
    pingInterval: 20000,
    pingTimeout: 25000,

    // Fail fast on stale connections so server resources free up.
    connectTimeout: 20000,
});

setIO(io);

io.on("connection", (socket) => {
    // Every connected client auto-joins the global feed
    socket.join("global");

    socket.on("joinAuction", (id) => {
        if (id) socket.join(`auction:${id}`);
    });
    socket.on("leaveAuction", (id) => {
        if (id) socket.leave(`auction:${id}`);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    if (agendaStarted) await agendaService.stop();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);