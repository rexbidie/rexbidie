import nodemailer from "nodemailer";
import Commission from "../models/commission.model.js";
import { getCachedRates } from "../routes/currency.route.js";
import User from "../models/user.model.js";
import Watchlist from "../models/watchlist.model.js";
import { canEmailUser, canSendEmail } from "./emailPreferences.js";
import { isManualPaymentRequired } from "../utils/manualPayment.js";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Add connection verification
transporter.verify(function (error, success) {
    if (error) {
        console.log("SMTP Connection failed:", error);
    } else {
        console.log("SMTP Server is ready");
    }
});

// ============================================
// REXBID BRANDING CONFIGURATION
// ============================================

// Brand colors - RexBid (Gold & Navy)
const BRAND_COLORS = {
    primary: '#D19F3E',      // Gold - main brand color
    primaryLight: '#E0B05E',  // Lighter gold
    primaryDark: '#B88A2E',   // Darker gold
    secondary: '#072342',     // Navy blue - secondary brand color
    secondaryLight: '#1A3A5C', // Lighter navy
    secondaryDark: '#051A32',  // Darker navy
    grayBg: '#f8f9fa',
    grayBorder: '#e9ecef',
    text: '#1f2937',
    textLight: '#6b7280',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444'
};

// Brand text variables
const BRAND_NAME = 'RexBid';
const BRAND_TAGLINE = 'Ireland\'s Marketplace for Machinery & Commercials';

// Contact/Support info
const SUPPORT_EMAIL = process.env.EMAIL_USER;
const SUPPORT_PHONE = '';
const COMPANY_LOCATION = 'Ireland';
const DELIVERY_PARTNER_EMAILS = (process.env.DELIVERY_PARTNER_EMAILS || "seamus@evolveauto.ie")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

// URLs (adjust based on your environment)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://rexbid.ie';
const ADMIN_URL = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL}/admin`
    : 'https://rexbid.ie/admin';

// ============================================
// DYNAMIC SPECIFICATIONS RENDERER (NO HARDCODED FIELDS)
// ============================================

// Simple, dynamic specification renderer - shows ALL fields, no hardcoding
const renderSpecifications = (specifications) => {
    if (!specifications) return '';

    // Handle Map
    let entries = [];
    if (specifications instanceof Map) {
        if (specifications.size === 0) return '';
        entries = Array.from(specifications.entries());
    }
    // Handle plain object
    else if (typeof specifications === 'object') {
        entries = Object.entries(specifications);
    }

    if (entries.length === 0) return '';

    let html = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">';

    entries.forEach(([key, value]) => {
        const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^\w/, c => c.toUpperCase());

        html += `
            <tr style="border-bottom: 1px solid ${BRAND_COLORS.grayBorder};">
                <td style="padding: 8px 12px; font-weight: 600; color: ${BRAND_COLORS.secondary}; width: 40%;">${label}:</td>
                <td style="padding: 8px 12px; color: ${BRAND_COLORS.text};">${value}</td>
            </tr>
        `;
    });

    html += '</table>';
    return html;
};

// Alternative simple vertical stack (if you prefer no table)
const renderSpecificationsSimple = (specifications) => {
    if (!specifications) return '';

    let specsObj = specifications;
    if (specifications instanceof Map) {
        specsObj = Object.fromEntries(specifications);
    }

    const entries = Object.entries(specsObj).filter(([key, value]) => {
        return value !== null && value !== undefined && value !== '';
    });

    if (entries.length === 0) return '';

    let html = '<div style="margin: 16px 0;">';

    entries.forEach(([key, value]) => {
        const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^\w/, c => c.toUpperCase());

        html += `
            <div style="padding: 8px 0; border-bottom: 1px solid ${BRAND_COLORS.grayBorder};">
                <strong style="color: ${BRAND_COLORS.secondary};">${label}:</strong>
                <span style="color: ${BRAND_COLORS.text};"> ${value}</span>
            </div>
        `;
    });

    html += '</div>';
    return html;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Format currency (default EUR for Ireland)
const formatCurrency = (amount, currency = 'EUR') => {
    if (!amount && amount !== 0) return `${currency === 'GBP' ? '£' : '€'}0`;

    const symbols = {
        'EUR': '€',
        'GBP': '£',
        'USD': '$'
    };

    const symbol = symbols[currency] || currency;
    const locale = currency === 'GBP' ? 'en-GB' : 'en-IE';

    return `${symbol}${Number(amount)?.toFixed(0).toLocaleString(locale)}`;
};

// Get time remaining for auctions/end dates
const getTimeRemaining = (endDate) => {
    if (!endDate) return 'Time not available';

    const remaining = new Date(endDate) - new Date();
    if (remaining <= 0) return 'Ended';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

// Simple info card (no emojis/icons)
const createInfoCard = (content, variant = 'default') => {
    const variants = {
        default: `background: ${BRAND_COLORS.grayBg}; border: 1px solid ${BRAND_COLORS.grayBorder}; border-radius: 12px; padding: 20px; margin: 20px 0;`,
        warning: `background: #fffbeb; border-left: 4px solid ${BRAND_COLORS.warning}; padding: 16px; border-radius: 8px; margin: 20px 0;`,
        success: `background: #f0fdf4; border-left: 4px solid ${BRAND_COLORS.success}; padding: 16px; border-radius: 8px; margin: 20px 0;`
    };
    return `<div style="${variants[variant]}">${content}</div>`;
};

// Two-column summary row (flex layout)
const createSummaryRow = (label, value) => `
    <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${BRAND_COLORS.grayBorder};">
        <span style="font-weight: 600; color: ${BRAND_COLORS.secondary};">${label}</span>
        <span style="color: ${BRAND_COLORS.text};">${value}</span>
    </div>
`;

// URL box for links
const createUrlBox = (url) => `
    <div style="background: ${BRAND_COLORS.grayBg}; padding: 12px 16px; border-radius: 12px; font-family: monospace; font-size: 13px; word-break: break-all; margin: 16px 0; border: 1px solid ${BRAND_COLORS.grayBorder};">
        ${url}
    </div>
`;

// Button generator
const createButton = (text, url, variant = 'primary') => {
    const colors = {
        primary: `background: ${BRAND_COLORS.primary}; color: #ffffff;`,
        secondary: `background: ${BRAND_COLORS.secondary}; color: #ffffff;`,
        outline: `background: transparent; border: 2px solid ${BRAND_COLORS.primary}; color: ${BRAND_COLORS.primary};`
    };

    return `
        <div style="text-align: center; margin: 20px 0;">
            <a href="${url}" style="display: inline-block; ${colors[variant]} padding: 12px 28px; text-decoration: none; border-radius: 40px; font-weight: 600; font-size: 15px;">
                ${text}
            </a>
        </div>
    `;
};

// Large visual star display — for the top of review emails
const createStarRating = (rating, size = 22) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating;
        stars.push(
            `<span style="font-size: ${size}px; color: ${filled ? BRAND_COLORS.primary : '#d1d5db'};">★</span>`
        );
    }
    return `<div style="letter-spacing: 4px;">${stars.join('')}</div>`;
};

// Hero-style rating badge (big number + stars) — good visual anchor
const createRatingBadge = (rating) => `
    <div style="text-align: center; margin: 20px 0;">
        <div style="display: inline-block; background: ${BRAND_COLORS.secondary}; border-radius: 16px; padding: 22px 36px;">
            <div style="color: ${BRAND_COLORS.primary}; font-size: 44px; font-weight: 700; line-height: 1;">
                ${rating}<span style="font-size: 20px; opacity: 0.7;">/5</span>
            </div>
            <div style="margin-top: 10px;">
                ${createStarRating(rating, 20)}
            </div>
        </div>
    </div>
`;

// ============================================
// BASE EMAIL TEMPLATE (RexBid branding)
// ============================================

const baseTemplate = (content, title = BRAND_NAME) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            background-color: #f4f6f9;
            color: ${BRAND_COLORS.text};
        }
        .container {
            max-width: 560px;
            margin: 30px auto;
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.02);
        }
        .content {
            padding: 32px 40px;
        }
        @media (max-width: 600px) {
            .content {
                padding: 24px 20px;
            }
        }
        .footer {
            background: ${BRAND_COLORS.grayBg};
            padding: 24px 40px;
            text-align: center;
            color: ${BRAND_COLORS.textLight};
            font-size: 12px;
            border-top: 1px solid ${BRAND_COLORS.grayBorder};
        }
        .footer a {
            color: ${BRAND_COLORS.primary};
            text-decoration: none;
            margin: 0 8px;
        }
        .divider {
            height: 1px;
            background: ${BRAND_COLORS.grayBorder};
            margin: 24px 0;
        }
        h2 {
            font-size: 22px;
            text-align: center;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: ${BRAND_COLORS.secondary};
        }
        h3 {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 12px 0;
            color: ${BRAND_COLORS.secondary};
        }
        a {
            color: ${BRAND_COLORS.primary};
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <!-- RexBid Header: Brand name + tagline -->
            <div style="text-align: center; margin-bottom: 28px;">
                <h1 style="color: ${BRAND_COLORS.secondary}; font-size: 32px; margin: 0; letter-spacing: -0.5px;">${BRAND_NAME}</h1>
                <div style="width: 60px; height: 3px; background: ${BRAND_COLORS.primary}; margin: 12px auto 0;"></div>
                <p style="color: ${BRAND_COLORS.textLight}; font-size: 13px; margin: 12px 0 0 0;">${BRAND_TAGLINE}</p>
            </div>
            ${content}
        </div>
        <div class="footer">
            <p style="margin: 0 0 12px 0;">${BRAND_NAME} · Support Team</p>
            <p style="margin: 0 0 12px 0;">${COMPANY_LOCATION} | <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
            <p style="margin: 0;">
                <a href="${FRONTEND_URL}/contact">Help Center</a> ·
                <a href="${FRONTEND_URL}/privacy-policy">Privacy Policy</a>
            </p>
            <p style="margin: 20px 0 0 0; font-size: 11px;">© ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;
// this is different function to convert the amount from one currency to another using the cached exchange rates.
const convertRawAmount = (amount, fromCurrency, toCurrency) => {
    if (!amount) return 0;
    if (fromCurrency === toCurrency) return amount;

    const rates = getCachedRates();
    if (!rates) return amount;

    const rate = rates[fromCurrency]?.rates[toCurrency];
    if (!rate) return amount;

    return parseFloat((amount * rate).toFixed(2));
};

// ============================================================
// MARKETING CAMPAIGN EMAIL
// ============================================================
const sendMarketingCampaignEmail = async (
    user,
    campaign,
    unsubscribeToken,
    personalizedBody
) => {
    const unsubscribeUrl = `${FRONTEND_URL}/unsubscribe/${unsubscribeToken}`;

    // 1. Clamp images FIRST
    const clampedBody = personalizedBody.replace(
        /<img\b([^>]*?)>/gi,
        (match, attrs) => {
            const cleaned = attrs
                .replace(/\sstyle=("[^"]*"|'[^']*')/gi, "")
                .replace(/\swidth=("[^"]*"|'[^']*')/gi, "")
                .replace(/\sheight=("[^"]*"|'[^']*')/gi, "");
            return `<img${cleaned} style="max-width:100%;max-height:400px;width:auto;height:auto;display:block;margin:0 auto;">`;
        }
    );

    // 2. Then build content using clampedBody (NOT personalizedBody)
    const content = `
    ${clampedBody}

    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid ${BRAND_COLORS.grayBorder}; text-align: center; font-size: 12px; color: ${BRAND_COLORS.textLight}; line-height: 1.6;">
      <p style="margin: 0 0 8px 0;">
        You're receiving this email because you have an account on ${BRAND_NAME}.
      </p>
      <p style="margin: 0;">
        <a href="${unsubscribeUrl}" style="color: ${BRAND_COLORS.primary}; text-decoration: underline;">
          Unsubscribe from emails
        </a>
      </p>
    </div>
  `;

    const html = baseTemplate(content, campaign.title);

    return transporter.sendMail({
        from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: campaign.title,
        html,
    });
};

// Email Templates

// 1. Contact email for admin
const contactEmail = async (name, email, phone, userType = "Bidder", message) => {
    try {
        const content = `
            <h2 style="text-align: center;">New Contact Form Submission</h2>
            
            ${createInfoCard(`
                ${createSummaryRow('Full Name:', name)}
                ${createSummaryRow('Email:', `<a href="mailto:${email}" style="color: ${BRAND_COLORS.primary};">${email}</a>`)}
                ${createSummaryRow('Phone:', phone || 'Not provided')}
                ${createSummaryRow('User Type:', userType)}
            `)}
            
            <div style="margin: 20px 0;">
                <strong style="color: ${BRAND_COLORS.secondary};">Message:</strong>
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 16px; border-radius: 8px; margin-top: 8px; border: 1px solid ${BRAND_COLORS.grayBorder};">
                    ${message}
                </div>
            </div>
            
            <div style="margin-top: 25px; padding: 15px; background: ${BRAND_COLORS.grayBg}; border-radius: 8px; border-left: 4px solid ${BRAND_COLORS.primary};">
                <p style="margin: 0; color: ${BRAND_COLORS.secondary}; font-size: 14px;">
                    <strong>Recommended Action:</strong> Respond within 24 hours for best customer engagement.
                </p>
            </div>
        `;

        const html = baseTemplate(content, 'New Contact Query');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `New Contact Query - ${name}`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(error);
    }
};

// 2. Contact confirmation email to user
const contactConfirmationEmail = async (name, email) => {
    try {
        const content = `
            <h2 style="text-align: center;">Thank You for Contacting Us</h2>
            
            ${createInfoCard(`
                <p style="margin: 0 0 16px 0; font-size: 18px; color: ${BRAND_COLORS.secondary};">Dear ${name},</p>
                
                <p style="margin: 0 0 16px 0;">
                    Thank you for reaching out to <strong>${BRAND_NAME}</strong>. We have successfully received your inquiry and appreciate you taking the time to contact us.
                </p>
                
                <p style="margin: 0 0 16px 0;">
                    Our dedicated team is currently reviewing your message and will get back to you within <strong>24-48 hours</strong>.
                </p>
                
                <p style="margin: 0;">
                    We're committed to providing you with the best possible service and look forward to assisting you with your auction needs.
                </p>
            `, 'default')}
            
            <div style="background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                <div style="color: ${BRAND_COLORS.primary}; font-size: 18px; margin-bottom: 10px; font-weight: bold;">Need Immediate Assistance?</div>
                <div style="font-size: 14px; margin-bottom: 15px; opacity: 0.9;">
                    If your inquiry requires urgent attention, please contact our support team directly for faster service.
                </div>
            </div>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-size: 14px; border: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 0 0 8px 0;"><strong style="color: ${BRAND_COLORS.secondary};">Phone Support:</strong> Available Monday-Friday, 9:00 AM - 6:00 PM</p>
                <p style="margin: 0;"><strong style="color: ${BRAND_COLORS.secondary};">Email Support:</strong> <a href="mailto:${SUPPORT_EMAIL}" style="color: ${BRAND_COLORS.primary};">${SUPPORT_EMAIL}</a></p>
            </div>
            
            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 5px 0;">Best regards,</p>
                <p style="margin: 5px 0;"><strong>The ${BRAND_NAME} Team</strong></p>
            </div>
        `;

        const html = baseTemplate(content, 'Thank You');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Thank You for Contacting ${BRAND_NAME}`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(error);
    }
};

// 3. Welcome email for user
const welcomeEmail = async (user) => {
    try {
        const content = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="text-align: center;">Welcome to ${BRAND_NAME}, ${user.firstName || user.companyName || user.username}!</h2>
            </div>
            
            <p>We're thrilled to welcome you to ${BRAND_NAME}. Your ${user.userType || 'bidder'} account has been successfully created.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Account Details</strong></p>
                ${createSummaryRow('Name:', `${user.firstName || ''} ${user.lastName || ''}`)}
                ${createSummaryRow('Email:', user.email)}
                ${createSummaryRow('Account Type:', user.userType || 'Bidder')}
            `)}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Go to Profile', `${FRONTEND_URL}/${user?.userType || 'bidder'}/profile`, 'primary')}
            </div>
            
            <div style="text-align: center; margin: 15px 0;">
                ${createButton('Browse Auctions', `${FRONTEND_URL}/auctions`, 'outline')}
            </div>
            
            <p>Need help getting started? Check out our FAQ section or contact our support team - we're here to help!</p>
        `;

        const html = baseTemplate(content, `Welcome, ${user.firstName || user.companyName || user.username}`);

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: `Welcome to ${BRAND_NAME}, ${user.firstName || user.companyName || user.username}!`,
            html
        });

        console.log(`Welcome email sent to ${user.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send welcome email:`, error);
        return false;
    }
};

// 4. New user registered for admin
const newUserRegistrationEmail = async (adminEmail, user) => {
    try {
        const userTypeDisplay = (user.userType || "bidder").charAt(0).toUpperCase() + (user.userType || "bidder").slice(1);

        const content = `
            <h2 style="text-align: center;">New User Registration</h2>
            <p style="text-align: center;">A new user has successfully registered on ${BRAND_NAME}.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>User Information</strong></p>
                ${createSummaryRow('Full Name:', `${user.firstName || ''} ${user.lastName || ''}`)}
                ${createSummaryRow('Username:', user.username || user.companyName || 'Not provided')}
                ${createSummaryRow('Email:', user.email)}
                ${createSummaryRow('Account Type:', userTypeDisplay)}
                ${createSummaryRow('Phone Number:', user.phone || 'Not provided')}
                ${createSummaryRow('Country:', user.countryName || 'Not provided')}
            `)}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.primary};">
                <p style="margin: 0 0 12px 0;"><strong>Admin Actions</strong></p>
                <p style="margin: 0 0 16px 0;">You can review this user's account, verify their details, or take necessary actions from the admin panel.</p>
                <div style="text-align: center;">
                    ${createButton('Go to User Management', `${FRONTEND_URL}/admin/users`, 'secondary')}
                </div>
            </div>
        `;

        const html = baseTemplate(content, 'New User Registration');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: `New User Registration - ${userTypeDisplay}`,
            html
        });

        console.log(`New user registration email sent to admin for ${user.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send new user registration email:`, error);
        return false;
    }
};

// 5. Reset password email
const resetPasswordEmail = async (email, url) => {
    try {
        const content = `
            <h2 style="text-align: center;">Password Reset Request</h2>
            <p style="text-align: center;">We received a request to reset your ${BRAND_NAME} password.</p>
            
            ${createInfoCard(`
                <p>To reset your password, please click the button below. This link will expire in <strong>1 hour</strong> for security purposes.</p>
                
                ${createButton('Reset Password Now', url, 'primary')}
                
                <p style="margin-top: 16px; margin-bottom: 8px;">If the button doesn't work, copy and paste this link into your browser:</p>
                ${createUrlBox(url)}
            `, 'warning')}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 0 0 12px 0;"><strong>Create a Secure Password</strong></p>
                <p style="margin: 0 0 8px 0;">• Use at least 8 characters</p>
                <p style="margin: 0 0 8px 0;">• Include uppercase and lowercase letters</p>
                <p style="margin: 0 0 8px 0;">• Add numbers and special characters</p>
                <p style="margin: 0 0 8px 0;">• Avoid using personal information</p>
                <p style="margin: 0;">• Don't reuse passwords from other websites</p>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                <p style="margin: 0;"><strong>Important Security Notice:</strong> If you did NOT request this password reset, please ignore this email. Your account remains secure.</p>
            </div>
            
            <p>After resetting your password, you can log in to your ${BRAND_NAME} account and continue browsing our diverse selection of items.</p>
        `;

        const html = baseTemplate(content, 'Password Reset');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Reset Your ${BRAND_NAME} Password`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(`Failed to send reset password email: ${error.message}`);
    }
};

// 6. Auction submitted for admin approval
const auctionSubmittedForApprovalEmail = async (adminEmail, auction, seller) => {
    try {
        const content = `
            <h2 style="text-align: center;">New Listing Awaiting Approval</h2>
            <p style="text-align: center;">A seller has submitted a new listing for review. The listing requires your approval before it can go live.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Listing Information</strong></p>
                ${createSummaryRow('Title:', auction.title)}
                ${auction.subTitle ? createSummaryRow('Subtitle:', auction.subTitle) : ''}
                ${createSummaryRow('Categories:', auction?.categories?.join(', ') || 'N/A')}
                ${createSummaryRow('Location:', auction?.location || 'Not specified')}
                ${createSummaryRow('Listing Type:', auction?.auctionType ? auction.auctionType.toUpperCase() : 'N/A')}
                ${auction?.allowOffers ? createSummaryRow('Offers:', 'Allowed') : ''}
            `)}
            
            ${auction.specifications ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Specifications</strong>
                    ${renderSpecifications(auction.specifications)}
                </div>
            ` : ''}
            
            ${auction.description ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid ${BRAND_COLORS.grayBorder};">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Description</strong>
                    <p style="margin: 8px 0 0 0;">${auction.description.substring(0, 200)}${auction.description.length > 200 ? '...' : ''}</p>
                </div>
            ` : ''}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.primary};">
                <p style="margin: 0 0 12px 0;"><strong>Seller Information</strong></p>
                ${createSummaryRow('Name:', `${seller.firstName || seller.companyName || seller.username} ${seller.lastName || ''}`)}
                ${createSummaryRow('Username:', seller.username || seller.companyName)}
            </div>
            
            <div style="background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                <p style="margin: 0 0 12px 0;"><strong>Admin Action Required</strong></p>
                <p style="margin: 0 0 16px 0;">Please review this listing to ensure timely activation.</p>
                ${createButton('Review Listings', `${FRONTEND_URL}/admin/auctions/all`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Listing Approval Required');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: `New Listing for Approval - ${auction.title}`,
            html
        });

        console.log(`Listing submission email sent to admin for auction ${auction._id}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send listing submission email:`, error);
        return false;
    }
};

// "Tuesday 17 November, 19:04" in Irish time.
const fmtIrish = (date) =>
    date
        ? new Date(date).toLocaleString("en-IE", {
              timeZone: "Europe/Dublin",
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
          })
        : "";

// 7. Auction approved for seller. Sent when an admin approves a listing.
// If it starts later, says when it goes live (a "now live" email follows
// at that time); if it's already started, says it's live now.
const auctionApprovedEmail = async (seller, listing) => {
    try {
        const startsLater = listing?.startDate && new Date(listing.startDate) > new Date();
        const content = `
            <h2 style="text-align: center;">${startsLater ? "Your Listing is Approved" : "Listing Approved and Live"}</h2>
            <p style="text-align: center;">${
                startsLater
                    ? `Great news! Your listing has been approved. It goes live on <strong>${fmtIrish(listing.startDate)}</strong> and we'll email you again when it does.`
                    : `Great news! Your listing has been approved and is now live on ${BRAND_NAME}.`
            }</p>
            ${listing?.endDate ? `<p style="text-align: center;">Closing time: <strong>${fmtIrish(listing.endDate)}</strong> (Irish time)</p>` : ''}
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Listing Details</strong></p>
                ${createSummaryRow('Title:', listing.title)}
                ${listing.subTitle ? createSummaryRow('Subtitle:', listing.subTitle) : ''}
                ${createSummaryRow('Listing Type:', listing?.auctionType ? listing.auctionType.toUpperCase() : 'N/A')}
                ${listing?.allowOffers ? createSummaryRow('Offers:', 'Allowed') : ''}
                ${listing?.buyNowPrice ? createSummaryRow('Buy Now Price:', formatCurrency(listing.buyNowPrice)) : ''}
                ${createSummaryRow('Listing Price:', formatCurrency(listing?.startPrice))}
            `)}
            
            ${listing.specifications && listing.specifications.size > 0 ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
            ` : ''}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 12px 16px; border-radius: 12px; margin: 20px 0; word-break: break-all;">
                <strong>Your Listing URL:</strong><br>
                <a href="${FRONTEND_URL}/auction/${listing?._id}" style="color: ${BRAND_COLORS.primary};">${FRONTEND_URL}/auction/${listing?._id}</a>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton(startsLater ? 'View Your Listing' : 'View Your Live Listing', `${FRONTEND_URL}/auction/${listing?._id}`, 'primary')}
            </div>
            
            <p>${startsLater ? 'Buyers can see and bid on it from the start date.' : 'Your item is now searchable and visible to our community.'} We wish you a quick and successful sale!</p>
            
            <p>For any questions about the selling process or if you need assistance, our support team is here to help.</p>
        `;

        const html = baseTemplate(content, 'Listing Approved');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: startsLater ? `Your Listing is Approved: ${listing?.title}` : `Your Listing is Live: ${listing?.title}`,
            html
        });

        console.log(`Listing approved email sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send listing approved email:`, error);
        return false;
    }
};

// 8. Auction listed and live for seller (working one)
const auctionListedEmail = async (listing, seller) => {
    try {
        const content = `
            <h2>Your Listing is Now Live</h2>
            <p>Great news! Your listing is now active and visible to potential buyers on ${BRAND_NAME}.</p>
            ${listing?.endDate ? `<p>Closing time: <strong>${fmtIrish(listing.endDate)}</strong> (Irish time)</p>` : ''}
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Listing Details</strong></p>
                ${createSummaryRow('Title:', listing.title)}
                ${listing.subTitle ? createSummaryRow('Subtitle:', listing.subTitle) : ''}
                ${createSummaryRow('Listing Type:', listing?.auctionType ? listing.auctionType.toUpperCase() : 'N/A')}
                ${listing?.allowOffers ? createSummaryRow('Offers:', 'Allowed') : ''}
                ${listing?.buyNowPrice ? createSummaryRow('Buy Now Price:', formatCurrency(listing.buyNowPrice)) : ''}
                ${createSummaryRow('Listing Price:', formatCurrency(listing?.startPrice))}
            `)}
            
            ${listing.specifications && listing.specifications.size > 0 ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
            ` : ''}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 12px 16px; border-radius: 12px; margin: 20px 0; word-break: break-all;">
                <strong>Your Listing URL:</strong><br>
                <a href="${FRONTEND_URL}/auction/${listing?._id}" style="color: ${BRAND_COLORS.primary};">${FRONTEND_URL}/auction/${listing?._id}</a>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Your Live Listing', `${FRONTEND_URL}/auction/${listing?._id}`, 'primary')}
            </div>
            
            <p>We wish you a quick and successful sale!</p>
        `;

        const html = baseTemplate(content, 'Listing Live');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: `Your Listing is Live on ${BRAND_NAME}: ${listing?.title}`,
            html
        });

        console.log(`Listing live email sent to seller ${seller?.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send listing live email:`, error);
        return false;
    }
};

// 9. New auction listed notification for bidders (based on interests/categories) - sent when auction goes live or is coming soon
const newAuctionNotificationEmail = async (bidder, listing, seller) => {
    if (!(await canSendEmail(bidder.email, "newAuction"))) return false;

    try {
        const isLive = listing?.status === "active" || listing?.status === "approved";
        const listingStatus = isLive ? "Live Now" : "Coming Soon";

        let primaryAction = "View Details";

        if (isLive) {
            if (listing.auctionType === "buy_now" && listing?.buyNowPrice) {
                primaryAction = "Buy Now";
            } else if (listing.allowOffers) {
                primaryAction = "Make Offer";
            } else {
                primaryAction = "View Details";
            }
        }

        const content = `
            <h2 style="text-align: center;">New Listing: ${listing?.title}</h2>
            <p style="text-align: center;">We're excited to let you know about a new listing on ${BRAND_NAME}.</p>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 8px 16px; border-radius: 20px; display: inline-block; margin: 10px 0; font-size: 14px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                ${listingStatus}
            </div>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Listing Details</strong></p>
                ${createSummaryRow('Title:', listing.title)}
                ${listing.subTitle ? createSummaryRow('Subtitle:', listing.subTitle) : ''}
                ${createSummaryRow('Categories:', listing?.categories?.join(', ') || 'N/A')}
                ${createSummaryRow('Location:', listing?.location || 'Not specified')}
                ${createSummaryRow('Listing Type:', listing?.auctionType ? listing.auctionType.toUpperCase() : 'N/A')}
                ${listing?.allowOffers ? createSummaryRow('Offers:', 'Allowed') : ''}
            `)}
            
            ${listing.specifications && listing.specifications.size > 0 ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Specifications</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
            ` : ''}
            
            ${listing?.description ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid ${BRAND_COLORS.grayBorder};">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Description</strong>
                    <p style="margin: 8px 0 0 0;">${listing?.description.substring(0, 200)}${listing?.description.length > 200 ? '...' : ''}</p>
                </div>
            ` : ''}
            
            ${isLive ? `
                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                    <p style="margin: 0; font-weight: bold;">Available Now</p>
                    <p style="margin: 8px 0 0 0;">${listing?.buyNowPrice ? "Use Buy Now to secure it immediately or place a bid." : listing?.allowOffers ? "Make an offer to start negotiations." : "Place a bid to compete for this item."}</p>
                </div>
            ` : `
                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                    <p style="margin: 0; font-weight: bold;">Coming Soon</p>
                    <p style="margin: 8px 0 0 0;">This item will be available shortly.</p>
                </div>
            `}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Seller Information</strong></p>
                <p style="margin: 0;">${seller?.companyName || seller?.username}</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton(primaryAction, `${FRONTEND_URL}/auction/${listing?._id}`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'New Listing');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: bidder.email,
            subject: `New Listing: ${listing?.title}`,
            html
        });

        console.log(`New listing notification sent to bidder ${bidder?.email} for listing ${listing?._id}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send new listing notification:`, error);
        return false;
    }
};

// 10. Bulk send new listing notifications to multiple bidders (used when a new auction goes live to notify all interested bidders)
const sendBulkAuctionNotifications = async (bidders, listing, seller) => {
    try {
        const notificationPromises = bidders?.map(async (bidder) => {
            try {
                if (!canEmailUser(bidder, "newAuction")) {
                    return {
                        success: false,
                        email: bidder?.email,
                        reason: "Notifications disabled",
                    };
                }
                await newAuctionNotificationEmail(bidder, listing, seller);
                return { success: true, email: bidder?.email };
            } catch (error) {
                console.error(
                    `Failed to send notification to ${bidder?.email}:`,
                    error.message
                );
                return { success: false, email: bidder?.email, error: error.message };
            }
        });

        const results = await Promise.allSettled(notificationPromises);

        const successful = results.filter(
            (result) => result.status === "fulfilled" && result.value.success
        ).length;
        const failed = results.filter(
            (result) => result.status === "fulfilled" && !result.value.success
        ).length;
        const errors = results.filter(
            (result) => result.status === "rejected"
        ).length;

        console.log(
            `Bulk listing notifications completed: ${successful} successful, ${failed} skipped/failed, ${errors} errors`
        );

        return {
            total: bidders.length,
            successful,
            failed,
            errors,
        };
    } catch (error) {
        console.error("Error in bulk listing notifications:", error);
        throw error;
    }
};

// 11. Bid confirmation email for bidder
const bidConfirmationEmail = async (
    userEmail,
    userName,
    listing,
    amount,
    currentBid,
    userCurrency
) => {
    if (!(await canSendEmail(userEmail, "bidConfirmation"))) return false;

    try {
        const isWinning = amount >= currentBid;

        const content = `
            <h2 style="text-align: center;">Your Bid Has Been Confirmed</h2>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 20px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                
                <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary};">Bid Amount: ${formatCurrency(amount, userCurrency)}</p>
                
                ${createSummaryRow('Your Bid Amount:', formatCurrency(amount, userCurrency))}
                ${createSummaryRow('Current Highest Bid:', formatCurrency(currentBid, userCurrency))}
                ${createSummaryRow('Your Position:', isWinning ? 'Leading' : 'Leading')}
            `)}
            
            <p>Thank you for placing your bid on <strong>${listing.title}</strong> on ${BRAND_NAME}.</p>
            <p>We'll notify you immediately if you are outbid or when the listing ends.</p>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Listing Details', `${FRONTEND_URL}/auction/${listing._id}`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Bid Confirmation');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `Bid Confirmation - ${listing.title}`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(`Failed to send bid confirmation: ${error.message}`);
    }
};

// 12. New bid notification for seller
const newBidNotificationEmail = async (seller, listing, bidAmount, bidder, userCurrency) => {
    if (!(await canSendEmail(seller.email, "newBid"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">New Bid Received</h2>
            <p style="text-align: center;">Great news! Your listing has received a new bid.</p>
            
            ${createInfoCard(`
                <p style="margin: 15px 0; font-size: 32px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(bidAmount, userCurrency)}</p>
                
                ${createSummaryRow('Listing:', listing.title)}
                ${createSummaryRow('Current Price:', formatCurrency(listing.currentPrice || 0, userCurrency))}
                ${createSummaryRow('Total Bids:', (listing.bidCount || 0).toLocaleString())}
            `)}
            
            ${listing.specifications && listing.specifications.size > 0 ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
            ` : ''}
            
            ${bidder ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Bidder Information</strong></p>
                    <p style="margin: 0;">${bidder.username || bidder.companyName}</p>
                </div>
            ` : ''}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Listing Details', `${FRONTEND_URL}/auction/${listing._id}`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'New Bid Received');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: `New Bid Received - ${listing.title}`,
            html
        });

        console.log(`New bid notification sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send new bid notification:`, error);
        return false;
    }
};

// 13. Offer confirmation email for bidder
const offerConfirmationEmail = async (
    userEmail,
    userName,
    listing,
    offerAmount,
    listingPrice,
    offerId,
    userCurrency
) => {
    if (!(await canSendEmail(userEmail, "offerConfirmation"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">Your Offer Has Been Submitted</h2>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 20px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                
                <p style="margin: 15px 0; font-size: 28px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(offerAmount, userCurrency)}</p>
                
                <div style="background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 8px 15px; border-radius: 20px; display: inline-block; font-size: 14px; margin: 10px 0;">
                    Offer ID: ${offerId}
                </div>
                
                ${createSummaryRow('Your Offer Amount:', formatCurrency(offerAmount, userCurrency))}
                ${createSummaryRow('Listing Price:', formatCurrency(listingPrice, userCurrency))}
                ${createSummaryRow('Offer Difference:', formatCurrency(offerAmount - listingPrice, userCurrency))}
            `)}
            
            ${listing.specifications && listing.specifications.size > 0 ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
            ` : ''}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
                <p style="margin: 0; font-weight: bold;">What Happens Next</p>
                <p style="margin: 8px 0 0 0;">The seller has 48 hours to respond to your offer. We'll notify you immediately when they respond.</p>
            </div>
            
            <p>Thank you for submitting your offer for <strong>${listing.title}</strong> on ${BRAND_NAME}.</p>
            <p>We have notified the seller of your offer and they have 48 hours to respond.</p>
        `;

        const html = baseTemplate(content, 'Offer Submitted');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `Offer Submitted - ${listing.title}`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(`Failed to send offer confirmation: ${error.message}`);
    }
};

// 14. New offer notification for seller
const newOfferNotificationEmail = async (seller, listing, offerAmount, bidder, userCurrency) => {
    if (!(await canSendEmail(seller?.email, "newOffer"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">New Offer Received</h2>
            <p style="text-align: center;">A potential bidder has made an offer on your listing.</p>
            
            <div style="text-align: center; margin: 20px 0;">
                <p style="font-size: 36px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${formatCurrency(offerAmount, userCurrency)}</p>
            </div>
            
            ${createInfoCard(`
                ${createSummaryRow('Offer Amount:', formatCurrency(offerAmount, userCurrency))}
                ${createSummaryRow('Listing Price:', formatCurrency(listing?.startPrice || listing?.buyNowPrice || 0, userCurrency))}
                ${createSummaryRow('Item:', listing?.title)}
            `)}
            
            ${listing.specifications && listing.specifications.size > 0 ? `
                <div style="margin: 20px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
            ` : ''}
            
            ${bidder ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Bidder Information</strong></p>
                    <p style="margin: 0;">Username: ${bidder?.username || bidder?.companyName}</p>
                </div>
            ` : ''}
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 25px 0; text-align: center; border-left: 4px solid ${BRAND_COLORS.warning};">
                <p style="margin: 0; font-weight: bold;">Respond Within 48 Hours</p>
                <p style="margin: 8px 0 0 0;">Offers typically expire after 48 hours. Respond promptly to keep the bidder engaged.</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Review Offers', `${FRONTEND_URL}/seller/offers/all`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'New Offer Received');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller?.email,
            subject: `New Offer Received - ${listing?.title}`,
            html
        });

        console.log(`New offer notification sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send new offer notification:`, error);
        return false;
    }
};

// 15. Outbid notification for bidder
const outbidNotificationEmail = async (
    userEmail,
    userName,
    listing,
    newBid,
    listingUrl,
    outBidderCurrency
) => {
    if (!(await canSendEmail(userEmail, "outbid"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">You've Been Outbid</h2>
            <p style="text-align: center;">Another bidder has placed a higher bid on an item you were bidding on.</p>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.danger};">
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                
                <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary};">New Highest Bid: ${formatCurrency(newBid, outBidderCurrency)}</p>
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 20px 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            </div>
            
            <div style="text-align: center; padding: 25px; background: ${BRAND_COLORS.grayBg}; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 15px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">Place a new bid to regain your position.</p>
                
                <div style="margin: 20px 0;">
                    ${createButton('Place New Bid Now', listingUrl, 'primary')}
                </div>
                
                <div>
                    <a href="${FRONTEND_URL}/bidder/bids" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 5px;">View All Your Bids</a>
                    <a href="${FRONTEND_URL}/auctions" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 5px;">Browse Other Listings</a>
                </div>
            </div>
            
            <p>Dear ${userName},</p>
            <p>This is an automated notification to let you know that another bidder has placed a higher bid on <strong>${listing.title}</strong>.</p>
            <p>Act quickly. The sooner you place your next bid, the better your chances of winning.</p>
        `;

        const html = baseTemplate(content, 'Outbid Notification');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `You've Been Outbid - ${listing.title}`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(`Failed to send outbid notification: ${error.message}`);
    }
};

// ─────────────────────────────────────────────
// Outbid batching — accumulate candidates, flush after quiet period
// ─────────────────────────────────────────────
const OUTBID_FLUSH_DELAY_MS = 3000;
const pendingOutbidFlushes = new Map();

/**
 * Schedule outbid emails. Does NOT send immediately — accumulates
 * recipients and flushes after a quiet window, so a proxy cascade
 * produces exactly one email per user with the FINAL price.
 * Callers can `await` this; it returns synchronously (safe).
 */
const sendOutbidNotifications = async (
    auction,
    previousBidders,
    currentBidderId,
    newBidAmount,
    outBidderCurrency
) => {
    try {
        const auctionId = auction._id.toString();

        let entry = pendingOutbidFlushes.get(auctionId);
        if (!entry) {
            entry = { candidateIds: new Set(), timer: null, currency: outBidderCurrency };
            pendingOutbidFlushes.set(auctionId, entry);
        }

        // Latest currency wins (same user might view in different currencies)
        entry.currency = outBidderCurrency || entry.currency;

        const winnerId = currentBidderId?.toString();
        for (const bidderId of previousBidders || []) {
            const idStr = bidderId?.toString();
            if (idStr && idStr !== winnerId) entry.candidateIds.add(idStr);
        }

        // Reset the timer — cascade keeps pushing the quiet-window out
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            const captured = pendingOutbidFlushes.get(auctionId);
            pendingOutbidFlushes.delete(auctionId);
            if (captured?.candidateIds.size) {
                flushOutbidNotifications(
                    auctionId,
                    captured.candidateIds,
                    captured.currency
                ).catch((err) =>
                    console.error("flushOutbidNotifications:", err)
                );
            }
        }, OUTBID_FLUSH_DELAY_MS);
    } catch (err) {
        console.error("sendOutbidNotifications schedule:", err);
    }
};

const flushOutbidNotifications = async (auctionId, candidateIds, currency) => {
    try {
        if (!candidateIds || candidateIds.size === 0) return;

        const Auction = (await import("../models/auction.model.js")).default;
        const auction = await Auction.findById(auctionId)
            .populate("seller", "username companyName firstName lastName")
            .lean();
        if (!auction) return;

        const finalWinnerId = auction.currentBidder?.toString();
        const toNotifyIds = [...candidateIds].filter((id) => id !== finalWinnerId);
        if (toNotifyIds.length === 0) {
            console.log(`Outbid flush ${auctionId}: all candidates ended up winning — skip`);
            return;
        }

        const users = await User.find({ _id: { $in: toNotifyIds } });
        const eligible = users.filter((u) => canEmailUser(u, "outbid"));
        if (eligible.length === 0) return;

        // Convert final price base → user currency
        const rates = getCachedRates();
        const base = auction.baseCurrency;
        const baseToUser = rates?.[base]?.rates?.[currency] || 1;
        const finalBidInUserCurrency = parseFloat(
            (auction.currentPrice * baseToUser).toFixed(2)
        );
        const auctionUrl = `${process.env.FRONTEND_URL}/auction/${auction._id}`;

        const results = await Promise.allSettled(
            eligible.map((user) =>
                outbidNotificationEmail(
                    user.email,
                    user.username ||
                    user.companyName ||
                    `${user.firstName} ${user.lastName}`,
                    auction,
                    finalBidInUserCurrency,
                    auctionUrl,
                    currency
                ).catch((err) =>
                    console.error(`outbid email to ${user.email}:`, err.message)
                )
            )
        );

        const ok = results.filter((r) => r.status === "fulfilled").length;
        console.log(
            `Outbid flush ${auctionId}: ${ok}/${eligible.length} sent (final ${auction.currentPrice} ${base})`
        );
    } catch (err) {
        console.error("flushOutbidNotifications:", err);
    }
};

const auctionEndingSoonEmail = async (
    userEmail,
    userName,
    listing
) => {
    if (!(await canSendEmail(userEmail, "endingSoon"))) return false;

    try {
        const title = listing?.title || "Auction";
        const currency = listing?.baseCurrency || "EUR";
        const currentPrice = listing?.currentPrice ?? listing?.startPrice ?? 0;
        const bidCount =
            listing?.bidCount ?? listing?.bids?.length ?? 0;
        const endDateStr = listing?.endDate
            ? new Date(listing.endDate).toLocaleString()
            : "soon";
        const timeLabel = "2 hours";

        const content = `
      <h2 style="text-align: center;">⏰ Ending in ${timeLabel}!</h2>
      <p style="text-align: center; color: ${BRAND_COLORS.textLight};">
        This is your final reminder — bidding closes soon.
      </p>

      ${createInfoCard(`
        <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
          ${title}
        </p>
        ${listing.subTitle
                ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>`
                : ""}

        ${createSummaryRow("Auction Type:", listing?.auctionType || "N/A")}
        ${createSummaryRow("Current Price:", `${currency} ${Number(currentPrice).toLocaleString()}`)}
        ${createSummaryRow("Total Bids:", bidCount.toLocaleString())}
        ${createSummaryRow("Ends At:", endDateStr)}

        ${listing.specifications && listing.specifications.size > 0
                ? `
              <div style="margin: 16px 0 0 0;">
                <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                ${renderSpecifications(listing.specifications)}
              </div>
            `
                : ""}
      `)}

      <p>Hi ${userName || "there"}, the auction for <strong>${title}</strong> ends in <strong>${timeLabel}</strong>.
      Don't miss your chance to place a winning bid!</p>

      <div style="text-align: center; margin: 25px 0;">
        ${createButton(
                    "Place Your Bid Now",
                    `${FRONTEND_URL}/auction/${listing._id}`,
                    "primary"
                )}
      </div>
    `;

        const html = baseTemplate(content, `Ending in ${timeLabel}`);

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `⏰ Ending in ${timeLabel}: ${title}`,
            html,
        });

        return !!info;
    } catch (error) {
        console.error(`Failed to send ending-soon email:`, error);
        return false;
    }
};

const auctionEndingSoonSellerEmail = async (
    sellerEmail,
    sellerName,
    listing
) => {
    if (!(await canSendEmail(sellerEmail, "endingSoonSeller"))) return false;

    try {
        const title = listing?.title || "Your Listing";
        const currency = listing?.baseCurrency || "EUR";
        const currentPrice = listing?.currentPrice ?? listing?.startPrice ?? 0;
        const startPrice = listing?.startPrice ?? 0;
        const bidCount = listing?.bidCount ?? listing?.bids?.length ?? 0;
        const offerCount = listing?.offers?.length ?? 0;
        const reservePrice = listing?.reservePrice ?? null;
        const reserveMet =
            listing?.auctionType === "reserve"
                ? Number(currentPrice) >= Number(reservePrice || 0)
                : true;
        const watchers = listing?.watchlistCount ?? 0;
        const views = listing?.views ?? 0;
        const endDateStr = listing?.endDate
            ? new Date(listing.endDate).toLocaleString()
            : "in 2 hours";
        const timeLabel = "2 hours";
        const hasActivity = bidCount > 0 || offerCount > 0;

        // Contextual tip block — nudges seller to act
        const tipBlock = !hasActivity
            ? `
          <div style="background: #FFF7ED; border-left: 4px solid #F97316; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
            <strong style="color: #9A3412;">💡 No bids yet</strong>
            <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.textLight};">
              Consider lowering your reserve price or sharing the listing to attract bidders in the final hours.
            </p>
          </div>
        `
            : `
          <div style="background: #ECFDF5; border-left: 4px solid #10B981; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
            <strong style="color: #065F46;">✅ Your listing has activity</strong>
            <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.textLight};">
              ${bidCount} bid${bidCount === 1 ? "" : "s"}${offerCount > 0 ? ` and ${offerCount} offer${offerCount === 1 ? "" : "s"}` : ""
            } so far. Get ready to finalize the sale.
            </p>
          </div>
        `;

        const content = `
      <h2 style="text-align: center;">⏰ Your listing ends in ${timeLabel}</h2>
      <p style="text-align: center; color: ${BRAND_COLORS.textLight};">
        Here's the final snapshot before bidding closes.
      </p>

      ${createInfoCard(`
        <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
          ${title}
        </p>
        ${listing.subTitle
                ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>`
                : ""}

        ${createSummaryRow("Auction Type:", listing?.auctionType || "N/A")}
        ${createSummaryRow("Starting Price:", `${currency} ${Number(startPrice).toLocaleString()}`)}
        ${createSummaryRow("Current Price:", `${currency} ${Number(currentPrice).toLocaleString()}`)}
        ${createSummaryRow("Total Bids:", bidCount.toLocaleString())}
        ${offerCount > 0 ? createSummaryRow("Offers Received:", offerCount.toLocaleString()) : ""}
        ${listing?.auctionType === "reserve"
                ? createSummaryRow(
                    "Reserve Price:",
                    `${currency} ${Number(reservePrice).toLocaleString()} ${reserveMet ? "(met ✓)" : "(not met)"
                    }`
                )
                : ""
            }
        ${createSummaryRow("Watchers:", watchers.toLocaleString())}
        ${createSummaryRow("Views:", views.toLocaleString())}
        ${createSummaryRow("Ends At:", endDateStr)}

        ${listing.specifications && listing.specifications.size > 0
                ? `
                <div style="margin: 16px 0 0 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                    ${renderSpecifications(listing.specifications)}
                </div>
              `
                : ""
            }
      `)}

      ${tipBlock}

      <p>Hi ${sellerName || "there"}, your auction for <strong>${title}</strong> ends in
      <strong>${timeLabel}</strong>. Bidders can still place bids until then — no action is
      required from you unless you want to lower the reserve price or answer buyer questions.</p>

      <div style="text-align: center; margin: 25px 0;">
        ${createButton(
                "View Your Listing",
                `${FRONTEND_URL}/auction/${listing._id}`,
                "primary"
            )}
      </div>
    `;

        const html = baseTemplate(content, `Your Listing Ends in ${timeLabel}`);

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: sellerEmail,
            subject: `⏰ Your listing ends in ${timeLabel}: ${title}`,
            html,
        });

        return !!info;
    } catch (error) {
        console.error(`Failed to send seller ending-soon email:`, error);
        return false;
    }
};

// 18. Auction ended notification for seller (with final status - sold/unsold)
const sendAuctionEndedSellerEmail = async (listing) => {
    try {
        // Safety check - ensure seller is populated and has email
        if (
            !listing?.seller ||
            typeof listing?.seller === "string" ||
            !listing?.seller?.email
        ) {
            console.error("Seller not populated or missing email for listing:", listing?._id);
            return false;
        }

        const isSold = listing?.status === "sold" || listing?.status === "sold_buy_now";
        const statusMessage = isSold
            ? `Sold for ${formatCurrency(listing?.finalPrice || 0)}`
            : "Listing ended without sale";

        const content = `
            <h2 style="text-align: center;">${isSold ? 'Item Sold' : 'Listing Ended'}</h2>
            <p style="text-align: center;">${statusMessage}</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                
                ${listing?.finalPrice ? `
                    <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(listing?.finalPrice, listing?.seller?.currency)}</p>
                ` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Final Status:', listing?.status?.toUpperCase() || 'N/A')}
                ${createSummaryRow('Original Price:', formatCurrency(listing?.buyNowPrice || listing?.startPrice || 0, listing?.seller?.currency))}
                ${createSummaryRow('Total Offers:', (listing?.offers?.length || 0).toLocaleString())}
                ${createSummaryRow('Total Views:', (listing?.views || 0).toLocaleString())}
            `)}
            
            ${isSold && listing?.winner ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.success};">
                    <p style="margin: 0 0 8px 0;"><strong>Congratulations! Your item has been sold.</strong></p>
                    <p style="margin: 0;">Buyer details will be shared after payment confirmation.</p>
                </div>
            ` : `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                    <p style="margin: 0;"><strong>No Sale This Time</strong></p>
                    <p style="margin: 8px 0 0 0;">Your listing ended without a sale.</p>
                </div>
            `}
            
            <p>Dear ${listing?.seller?.firstName || listing?.seller?.companyName || listing?.seller?.username},</p>
            <p>Your listing for <strong>${listing?.title}</strong> on ${BRAND_NAME} has ended.</p>
        `;

        const html = baseTemplate(content, isSold ? 'Item Sold' : 'Listing Ended');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: listing?.seller?.email,
            subject: `Your Listing Has Ended - ${listing?.title}`,
            html
        });
        return !!info;
    } catch (error) {
        console.error(`Failed to send listing ended email to seller for listing ${listing?._id}:`, error);
        return false;
    }
};
// 19. Auction won notification for bidder
const sendAuctionWonStandardEmail = async (listing) => {
    try {
        if (
            !listing?.winner ||
            typeof listing?.winner === "string" ||
            !listing?.winner.email
        ) {
            console.error(
                "Winner not populated or missing email for listing:",
                listing?._id
            );
            return false;
        }

        const finalPrice = listing?.finalPrice || listing?.currentPrice || 0;
        const bidderCommission = listing?.bidderCommissionAmount || 0;

        const winnerCurrency = listing?.winner?.currency;
        const finalPriceInCurrency = convertRawAmount(
            finalPrice,
            listing?.baseCurrency,
            winnerCurrency
        );
        const bidderCommissionInCurrency = convertRawAmount(
            bidderCommission,
            listing?.baseCurrency,
            winnerCurrency
        );
        const totalInCurrency =
            Math.round((finalPriceInCurrency + bidderCommissionInCurrency) * 100) / 100;

        const content = `
            <h2 style="text-align: center;">Congratulations! You Won the Listing</h2>
            <p style="text-align: center;">You are the winning bidder for this item.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(finalPriceInCurrency, winnerCurrency)}</p>
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Invoice Number:', listing?.transactionId || `INV-${listing?._id?.toString()?.toUpperCase()}`)}
                ${createSummaryRow('Winning Bid/Offer:', formatCurrency(finalPriceInCurrency, winnerCurrency))}

                ${bidderCommission > 0
                ? createSummaryRow('Buyer Commission:', formatCurrency(bidderCommissionInCurrency, winnerCurrency))
                : ''
            }

                ${bidderCommission > 0
                ? `<div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                        <span style="font-weight: 700; color: ${BRAND_COLORS.secondary}; font-size: 16px;">Total Payable</span>
                        <span style="font-weight: 700; color: ${BRAND_COLORS.primary}; font-size: 16px;">${formatCurrency(totalInCurrency, winnerCurrency)}</span>
                    </div>`
                : ''
            }
            `)}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Pay Now', `${FRONTEND_URL}/checkout/${listing?._id}`, 'primary')}
                ${createButton('Confirm Payment', `mailto:${SUPPORT_EMAIL}?subject=Payment%20Confirmation%20-%20${listing?.title}`, 'secondary')}
            </div>
        `;

        const html = baseTemplate(content, 'Invoice');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: listing?.winner?.email,
            subject: `Invoice - ${listing?.title}`,
            html,
        });

        console.log(`Listing won invoice email sent to ${listing?.winner?.email}`);
        return !!info;
    } catch (error) {
        console.error(
            `Failed to send listing won invoice email for listing ${listing._id}:`,
            error
        );
        return false;
    }
};

// 19B. Auction won high amount notification for bidder
const sendAuctionWonHighValueEmail = async (listing) => {
    try {
        if (
            !listing?.winner ||
            typeof listing?.winner === "string" ||
            !listing?.winner.email
        ) {
            console.error(
                "Winner not populated or missing email for listing:",
                listing?._id
            );
            return false;
        }

        const finalPrice = listing?.finalPrice || listing?.currentPrice || 0;
        const bidderCommission = listing?.bidderCommissionAmount || 0;

        const winnerCurrency = listing?.winner?.currency;
        const finalPriceInCurrency = convertRawAmount(
            finalPrice,
            listing?.baseCurrency,
            winnerCurrency
        );
        const bidderCommissionInCurrency = convertRawAmount(
            bidderCommission,
            listing?.baseCurrency,
            winnerCurrency
        );
        const totalInCurrency =
            Math.round((finalPriceInCurrency + bidderCommissionInCurrency) * 100) / 100;

        const content = `
            <h2 style="text-align: center;">Congratulations! You Won the Listing</h2>
            <p style="text-align: center;">You are the winning bidder for this item.</p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}

                <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(finalPriceInCurrency, winnerCurrency)}</p>

                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}

                ${createSummaryRow('Winning Bid/Offer:', formatCurrency(finalPriceInCurrency, winnerCurrency))}

                ${bidderCommission > 0
                ? createSummaryRow('Buyer Commission:', formatCurrency(bidderCommissionInCurrency, winnerCurrency))
                : ''
            }

                ${bidderCommission > 0
                ? `<div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                        <span style="font-weight: 700; color: ${BRAND_COLORS.secondary}; font-size: 16px;">Total Payable</span>
                        <span style="font-weight: 700; color: ${BRAND_COLORS.primary}; font-size: 16px;">${formatCurrency(totalInCurrency, winnerCurrency)}</span>
                    </div>`
                : ''
            }
            `)}

            <div style="margin: 25px 0;">
                <p style="margin: 0 0 12px 0;">Admin will be in touch with you shortly with your invoice and payment link.</p>
                <p style="margin: 0 0 12px 0;">Once the funds have cleared, collection can be arranged with the seller.</p>
                <p style="margin: 0;">If you have any questions in the meantime, please contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${BRAND_COLORS.secondary};">${SUPPORT_EMAIL}</a>.</p>
            </div>
        `;

        const html = baseTemplate(content, 'Auction Won');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: listing?.winner?.email,
            subject: `Congratulations - You Won ${listing?.title}`,
            html,
        });

        console.log(`High-value auction won email sent to ${listing?.winner?.email}`);
        return !!info;
    } catch (error) {
        console.error(
            `Failed to send high-value auction won email for listing ${listing._id}:`,
            error
        );
        return false;
    }
};

// 19C. Send the auction won email dynamically
const sendAuctionWonEmail = async (listing) => {
    try {
        // Safety check
        if (
            !listing?.winner ||
            typeof listing?.winner === "string" ||
            !listing?.winner.email
        ) {
            console.error(
                "Winner not populated or missing email for listing:",
                listing?._id
            );
            return false;
        }

        // Fail-safe: rate lookup failure → treat as high-value
        if (isManualPaymentRequired(listing)) {
            return sendAuctionWonHighValueEmail(listing);
        }

        return sendAuctionWonStandardEmail(listing);
    } catch (error) {
        console.error(
            `Failed to dispatch auction won email for listing ${listing._id}:`,
            error
        );
        return false;
    }
};

// 20. Auction won notification for admin
const auctionWonAdminEmail = async (adminEmail, adminCurrency, listing, buyer) => {
    try {
        const content = `
            <h2 style="text-align: center;">Item Sold</h2>
            <p style="text-align: center;">A listing has been successfully completed with a buyer.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(convertRawAmount(listing?.finalPrice || listing?.startPrice || listing?.buyNowPrice || 0, listing?.baseCurrency, adminCurrency) || 0, adminCurrency)}</p>
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Sale Type:', listing?.auctionType || 'N/A')}
                ${createSummaryRow('Categories:', listing?.categories?.join(', ') || 'N/A')}
                ${createSummaryRow('Total Offers/Bids:', (listing?.offers?.length || listing?.bids?.length || 0).toLocaleString())}
                ${createSummaryRow('Sale Status:', 'Completed')}
                ${createSummaryRow('Payment:', listing?.paymentStatus || 'Pending')}
            `)}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 12px 0;"><strong>Buyer Information</strong></p>
                ${createSummaryRow('Name:', buyer?.firstName || buyer?.companyName || buyer?.username)}
                ${createSummaryRow('Username:', buyer?.username || buyer?.companyName)}
                ${createSummaryRow('Email:', buyer?.email)}
                ${createSummaryRow('Phone:', buyer?.phone || 'Not provided')}
            </div>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 12px 0;"><strong>Seller Information</strong></p>
                ${createSummaryRow('Name:', listing?.seller?.firstName || listing?.seller?.username || 'N/A')}
                ${createSummaryRow('Email:', listing?.seller?.email || 'N/A')}
                ${listing?.seller?.phone ? createSummaryRow('Phone:', listing?.seller?.phone) : ''}
            </div>
        `;

        const html = baseTemplate(content, 'Item Sold');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: `Item Sold - ${listing?.title}`,
            html
        });

        console.log(`Listing sold admin email sent for listing ${listing._id}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send listing sold admin email:`, error);
        return false;
    }
};

// 21. Auction ended notification for admin
const auctionEndedAdminEmail = async (adminEmail, adminCurrency, listing) => {
    try {
        const isSold = listing.status === "sold" || listing.status === "sold_buy_now";
        const statusDisplay = isSold ? 'Sold' : 'Ended';

        const content = `
            <h2 style="text-align: center;">Listing ${statusDisplay}</h2>
            <p style="text-align: center;">A listing on ${BRAND_NAME} has ended.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing?.finalPrice && isSold ? `
                    <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary}; text-align: center;">${formatCurrency(convertRawAmount(listing?.finalPrice, listing?.baseCurrency, adminCurrency), adminCurrency)}</p>
                ` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Listing Type:', listing?.auctionType || 'N/A')}
                ${createSummaryRow('Categories:', listing?.categories?.join(', ') || 'N/A')}
                ${createSummaryRow('Original Price:', formatCurrency(convertRawAmount(listing?.startPrice || listing?.buyNowPrice || 0, listing?.baseCurrency, adminCurrency), adminCurrency))}
                ${createSummaryRow('Final Status:', listing?.status?.toUpperCase() || 'N/A')}
                ${createSummaryRow('Total Offers/Bids:', (listing?.offers?.length || listing?.bids?.length || 0).toLocaleString())}
                ${createSummaryRow('Total Views:', (listing?.views || 0).toLocaleString())}
                ${createSummaryRow('Listing ID:', listing?._id?.toString() || 'N/A')}
            `)}
            
            ${listing?.seller ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Seller Information</strong></p>
                    ${createSummaryRow('Name:', listing?.seller?.firstName || listing?.seller?.companyName || listing?.seller?.username)}
                    ${createSummaryRow('Email:', listing?.seller?.email)}
                    ${listing?.seller?.phone ? createSummaryRow('Phone:', listing?.seller?.phone) : ''}
                </div>
            ` : ''}
            
            ${listing.winner && isSold ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Buyer Information</strong></p>
                    ${createSummaryRow('Name:', listing?.winner?.firstName || listing?.winner?.companyName || listing?.winner?.username)}
                    ${createSummaryRow('Email:', listing?.winner?.email)}
                    ${listing?.winner?.phone ? createSummaryRow('Phone:', listing?.winner?.phone) : ''}
                </div>
            ` : ''}
        `;

        const html = baseTemplate(content, `Listing ${statusDisplay}`);

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: `Listing ${statusDisplay} - ${listing?.title}`,
            html
        });

        console.log(`Listing ended admin email sent for listing ${listing?._id} (Status: ${listing?.status})`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send listing ended admin email:`, error);
        return false;
    }
};

// 22. Offer accepted notification for bidder
const offerAcceptedEmail = async (
    buyerEmail,
    buyerName,
    buyerCurrency,
    seller,
    listing,
    offerAmount,
    offerId
) => {
    try {
        const currency = buyerCurrency || listing?.winner?.currency || listing?.baseCurrency || 'EUR';
        const finalPrice = listing?.finalPrice || listing?.currentPrice || 0;
        const bidderCommission = listing?.bidderCommissionAmount || 0;

        const finalPriceInCurrency = convertRawAmount(finalPrice, listing?.baseCurrency, currency);
        const bidderCommissionInCurrency = convertRawAmount(bidderCommission, listing?.baseCurrency, currency);
        const totalInCurrency = Math.round((finalPriceInCurrency + bidderCommissionInCurrency) * 100) / 100;

        const content = `
            <h2 style="text-align: center;">Offer Accepted</h2>
            <p style="text-align: center;">Congratulations! The seller has accepted your offer.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Original Price:', formatCurrency(convertRawAmount(listing?.buyNowPrice || listing?.startPrice || 0, listing?.baseCurrency, currency), currency))}
                ${createSummaryRow('Final Price:', formatCurrency(finalPriceInCurrency, currency))}
                ${bidderCommission > 0
                ? createSummaryRow('Buyer Commission:', formatCurrency(bidderCommissionInCurrency, currency))
                : ''
            }
                ${bidderCommission > 0
                ? `<div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                        <span style="font-weight: 700; color: ${BRAND_COLORS.secondary}; font-size: 16px;">Total Payable</span>
                        <span style="font-weight: 700; color: ${BRAND_COLORS.primary}; font-size: 16px;">${formatCurrency(totalInCurrency, currency)}</span>
                    </div>`
                : ''
            }
                ${createSummaryRow('Offer ID:', offerId)}
            `)}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Purchase', `${FRONTEND_URL}/bidder/offers`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Offer Accepted');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: buyerEmail,
            subject: `Offer Accepted - ${listing?.title}`,
            html
        });

        console.log(`Offer accepted email sent to buyer ${buyerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send offer accepted email:`, error);
        return false;
    }
};

// 23. Offer rejected notification for bidder
const offerRejectedEmail = async (
    buyerEmail,
    buyerName,
    buyerCurrency,
    seller,
    listing,
    offerAmount,
    offerId,
    reason,
) => {
    try {
        const content = `
            <h2 style="text-align: center;">Offer Declined</h2>
            <p style="text-align: center;">The seller has declined your offer.</p>
            
            ${reason ? `
                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                    <p style="margin: 0 0 8px 0;"><strong>Seller's Response</strong></p>
                    <p style="margin: 0;">${reason}</p>
                </div>
            ` : ''}
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Offer ID:', offerId)}
            `)}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Browse Other Listings', `${FRONTEND_URL}/auctions`, 'primary')}
            </div>
            
            <div style="text-align: center; margin: 15px 0;">
                <a href="${FRONTEND_URL}/auction/${listing._id}" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 5px;">Make New Offer</a>
                <a href="${FRONTEND_URL}/bidder/offers" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 5px;">My Offers</a>
            </div>
        `;

        const html = baseTemplate(content, 'Offer Declined');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: buyerEmail,
            subject: `Offer Declined - ${listing?.title}`,
            html
        });

        console.log(`Offer rejected email sent to buyer ${buyerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send offer rejected email:`, error);
        return false;
    }
};

// 24. Offer canceled notification for bidder
const offerCanceledEmail = async (
    buyerEmail,
    buyerName,
    buyerCurrency,
    seller,
    listing,
    offerAmount,
    offerId
) => {
    try {
        const content = `
            <h2 style="text-align: center;">Offer Canceled</h2>
            <p style="text-align: center;">Your offer has been canceled by the seller.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Offer ID:', offerId)}
            `)}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Browse Other Listings', `${FRONTEND_URL}/auctions`, 'primary')}
            </div>
            
            <div style="text-align: center; margin: 15px 0;">
                <a href="${FRONTEND_URL}/auctions?category=${listing?.categories?.[0]}" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Similar Items</a>
            </div>
        `;

        const html = baseTemplate(content, 'Offer Canceled');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: buyerEmail,
            subject: `Offer Canceled - ${listing?.title}`,
            html
        });

        console.log(`Offer canceled email sent to buyer ${buyerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send offer canceled email:`, error);
        return false;
    }
};

// 24b. Seller sent a counter offer — notify buyer
const offerCounteredEmail = async (
    buyerEmail,
    buyerName,
    buyerCurrency,
    seller,
    listing,
    originalOfferAmount,   // in buyer currency
    counterAmount,         // in buyer currency
    counterMessage,
    offerId,
    expiresAt
) => {
    try {
        const diff = Number(counterAmount) - Number(originalOfferAmount);
        const expiresStr = expiresAt
            ? new Date(expiresAt).toLocaleString('en-IE')
            : '48 hours from now';

        const content = `
            <h2 style="text-align: center;">Seller Sent a Counter Offer</h2>
            <p style="text-align: center;">The seller has responded to your offer with a counter proposal.</p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${listing?.title}
                </p>
                ${listing?.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}

                <p style="margin: 15px 0; font-size: 28px; font-weight: bold; color: ${BRAND_COLORS.primary}; text-align: center;">
                    ${formatCurrency(counterAmount, buyerCurrency)}
                </p>

                ${createSummaryRow('Your Offer:', formatCurrency(originalOfferAmount, buyerCurrency))}
                ${createSummaryRow('Seller Counter:', formatCurrency(counterAmount, buyerCurrency))}
                ${createSummaryRow('Difference:', `+ ${formatCurrency(diff, buyerCurrency)}`)}
                ${createSummaryRow('Offer ID:', offerId)}
            `)}

            ${counterMessage ? `
                <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
                    <strong style="color: #1E40AF;">Seller's message</strong>
                    <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.text};">"${counterMessage}"</p>
                </div>
            ` : ''}

            <div style="background: #FFF7ED; border-left: 4px solid #F97316; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
                <strong style="color: #9A3412;">⏳ Respond before it expires</strong>
                <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.textLight};">
                    This counter offer expires on <strong>${expiresStr}</strong>.
                </p>
            </div>

            <p>Hi ${buyerName || 'there'}, you have three options on the counter offer:</p>
            <ul style="color: ${BRAND_COLORS.text}; padding-left: 20px;">
                <li><strong>Accept</strong> — the auction will be sold to you at the counter price.</li>
                <li><strong>Counter</strong> — propose your own amount back to the seller.</li>
                <li><strong>Decline</strong> — end the negotiation.</li>
            </ul>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Review Counter Offer', `${FRONTEND_URL}/bidder/offers`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Counter Offer Received');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: buyerEmail,
            subject: `Counter Offer Received - ${listing?.title}`,
            html
        });

        console.log(`Offer countered email sent to buyer ${buyerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send offer countered email:`, error);
        return false;
    }
};

// 24c. Buyer counter-countered — notify seller
const buyerCounteredEmail = async (
    sellerEmail,
    sellerName,
    sellerCurrency,
    buyer,
    listing,
    previousCounterAmount,  // seller's previous counter, in seller currency
    newAmount,              // buyer's new counter, in seller currency
    message,
    offerId
) => {
    try {
        const content = `
            <h2 style="text-align: center;">Buyer Countered Your Offer</h2>
            <p style="text-align: center;">The buyer has sent a counter proposal back to you.</p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${listing?.title}
                </p>
                ${listing?.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}

                <p style="margin: 15px 0; font-size: 28px; font-weight: bold; color: ${BRAND_COLORS.primary}; text-align: center;">
                    ${formatCurrency(newAmount, sellerCurrency)}
                </p>

                ${createSummaryRow('Your Counter:', formatCurrency(previousCounterAmount, sellerCurrency))}
                ${createSummaryRow('Buyer Counter:', formatCurrency(newAmount, sellerCurrency))}
                ${createSummaryRow('Offer ID:', offerId)}
            `)}

            ${message ? `
                <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
                    <strong style="color: #1E40AF;">Buyer's message</strong>
                    <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.text};">"${message}"</p>
                </div>
            ` : ''}

            ${buyer ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Buyer Information</strong></p>
                    ${createSummaryRow('Username:', buyer?.username || buyer?.companyName || 'N/A')}
                </div>
            ` : ''}

            <div style="background: #FFF7ED; border-left: 4px solid #F97316; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
                <strong style="color: #9A3412;">Respond within 48 hours</strong>
                <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.textLight};">
                    You can accept, reject, or send another counter offer.
                </p>
            </div>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Review Counter', `${FRONTEND_URL}/seller/offers/all`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Buyer Countered');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: sellerEmail,
            subject: `Buyer Countered - ${listing?.title}`,
            html
        });

        console.log(`Buyer countered email sent to seller ${sellerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send buyer countered email:`, error);
        return false;
    }
};

// 24d. Buyer declined seller's counter — notify seller
const counterOfferRejectedEmail = async (
    sellerEmail,
    sellerName,
    sellerCurrency,
    buyer,
    listing,
    counterAmount,  // seller's counter that was rejected, in seller currency
    offerId
) => {
    try {
        const content = `
            <h2 style="text-align: center;">Counter Offer Declined</h2>
            <p style="text-align: center;">The buyer has declined your counter offer.</p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${listing?.title}
                </p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}

                ${createSummaryRow('Your Counter:', formatCurrency(counterAmount, sellerCurrency))}
                ${createSummaryRow('Offer ID:', offerId)}
            `)}

            <div style="background: #FEF2F2; border-left: 4px solid ${BRAND_COLORS.danger}; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
                <strong style="color: #991B1B;">Negotiation ended</strong>
                <p style="margin: 6px 0 0 0; color: ${BRAND_COLORS.textLight};">
                    The buyer has walked away from this offer. You can continue receiving new offers from other bidders.
                </p>
            </div>

            ${buyer ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Buyer Information</strong></p>
                    ${createSummaryRow('Username:', buyer?.username || buyer?.companyName || 'N/A')}
                </div>
            ` : ''}

            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View All Offers', `${FRONTEND_URL}/seller/offers/all`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Counter Offer Declined');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: sellerEmail,
            subject: `Counter Offer Declined - ${listing?.title}`,
            html
        });

        console.log(`Counter offer rejected email sent to seller ${sellerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send counter offer rejected email:`, error);
        return false;
    }
};

// 25. Payment completed notification for bidder
const paymentCompletedEmail = async (user, listing) => {
    try {
        const currency = user?.currency || listing?.winner?.currency || listing?.baseCurrency || 'EUR';
        const finalPrice = listing?.finalPrice || listing?.currentPrice || 0;
        const bidderCommission = listing?.bidderCommissionAmount || 0;

        const finalPriceInCurrency = convertRawAmount(finalPrice, listing?.baseCurrency, currency);
        const bidderCommissionInCurrency = convertRawAmount(bidderCommission, listing?.baseCurrency, currency);
        const totalInCurrency = Math.round((finalPriceInCurrency + bidderCommissionInCurrency) * 100) / 100;

        const content = `
            <h2 style="text-align: center;">Payment Confirmed</h2>
            <p style="text-align: center;">Thank you for your payment, ${user?.firstName || user?.companyName || user?.username}!</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Winning Bid:', formatCurrency(finalPriceInCurrency, currency))}
                ${bidderCommission > 0
                ? createSummaryRow('Buyer Commission:', formatCurrency(bidderCommissionInCurrency, currency))
                : ''
            }
                <div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                    <span style="font-weight: 700; color: ${BRAND_COLORS.secondary}; font-size: 16px;">Total Paid</span>
                    <span style="font-weight: 700; color: ${BRAND_COLORS.primary}; font-size: 16px;">${formatCurrency(totalInCurrency, currency)}</span>
                </div>
                ${listing?.transactionId ? createSummaryRow('Transaction ID:', listing.transactionId) : ''}
            `)}
            
            <p>Great news! Your payment has been successfully processed and confirmed.</p>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View My Purchases', `${FRONTEND_URL}/bidder/auctions/won`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Payment Confirmed');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: user?.email,
            subject: `Payment Confirmed - ${listing?.title}`,
            html
        });

        console.log(`Payment completed email sent to buyer ${user?.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send payment completed email:`, error);
        return false;
    }
};

// 26. Payment completed notification for bidder
const paymentSuccessEmail = async (user, listing) => {
    try {
        const content = `
            <h2 style="text-align: center;">Payment Successful</h2>
            <p style="text-align: center;">Your payment has been processed successfully, ${user.firstName || user?.companyName || user.username}!</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            `)}
            
            <p>You can check your order details from your dashboard.</p>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View My Purchases', `${FRONTEND_URL}/bidder/auctions/won`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Payment Successful');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: `Payment Confirmed - ${listing.title}`,
            html
        });

        console.log(`Payment success email sent to ${user.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send payment success email:`, error);
        return false;
    }
};

// 27. Payment completed notification for seller
const paymentCompletedSellerEmail = async (seller, listing, buyer) => {
    try {
        const currency = seller?.currency || listing?.baseCurrency || 'EUR';
        const finalPrice = listing?.finalPrice || listing?.currentPrice || 0;
        const sellerCommission = listing?.sellerCommissionAmount || 0;

        const finalPriceInCurrency = convertRawAmount(finalPrice, listing?.baseCurrency, currency);
        const sellerCommissionInCurrency = convertRawAmount(sellerCommission, listing?.baseCurrency, currency);
        const netInCurrency = Math.round((finalPriceInCurrency - sellerCommissionInCurrency) * 100) / 100;

        const content = `
            <h2 style="text-align: center;">Payment Received</h2>
            <p style="text-align: center;">Great news, ${seller?.firstName || seller?.companyName || seller?.username}!</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
                
                ${createSummaryRow('Final Sale Amount:', formatCurrency(finalPriceInCurrency, currency))}
                ${sellerCommission > 0
                ? createSummaryRow('Platform Commission:', formatCurrency(sellerCommissionInCurrency, currency))
                : ''
            }
                <div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                    <span style="font-weight: 700; color: ${BRAND_COLORS.secondary}; font-size: 16px;">Amount You Receive</span>
                    <span style="font-weight: 700; color: ${BRAND_COLORS.primary}; font-size: 16px;">${formatCurrency(netInCurrency, currency)}</span>
                </div>
            `)}
            
            <p>We're pleased to inform you that the buyer has successfully completed payment for your item. The funds have been received and confirmed.</p>
            
            ${buyer ? `
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 0 0 12px 0;"><strong>Buyer Information</strong></p>
                    ${createSummaryRow('Name:', `${buyer?.firstName || buyer?.companyName || buyer?.username} ${buyer?.lastName || ''}`)}
                    ${buyer?.email ? createSummaryRow('Email:', buyer.email) : ''}
                    ${buyer?.phone ? createSummaryRow('Phone:', buyer.phone) : ''}
                </div>
            ` : ''}
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Sold Items', `${FRONTEND_URL}/seller/auctions/sold`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Payment Received');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller?.email,
            subject: `Payment Received - ${listing?.title}`,
            html
        });

        console.log(`Payment completed email sent to seller ${seller?.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send payment completed email to seller:`, error);
        return false;
    }
};

const flaggedCommentAdminEmail = async (
    adminEmail,
    reason,
    comment,
    listing,
    reportedByUser
) => {
    try {
        const content = `
            <h2 style="text-align: center;">Comment Flagged for Review</h2>
            <p style="text-align: center;">A user has reported inappropriate content.</p>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                <p style="margin: 0 0 8px 0;"><strong>Report Reason</strong></p>
                <p style="margin: 0;">${reason}</p>
            </div>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
            `)}
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.danger};">
                <p style="margin: 0 0 8px 0;"><strong>Flagged Comment</strong></p>
                <p style="margin: 0; font-style: italic;">${comment?.content}</p>
            </div>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 12px 0;"><strong>Comment Author</strong></p>
                ${createSummaryRow('Name:', `${comment?.user?.firstName || comment?.user?.companyName || comment?.userName || 'N/A'} ${comment?.user?.lastName || ''}`)}
                ${createSummaryRow('Username:', comment?.user?.username || comment?.user?.companyName || comment?.userName || 'N/A')}
                ${createSummaryRow('Email:', comment?.user?.email || 'N/A')}
                ${createSummaryRow('Account Type:', comment?.user?.userType || 'N/A')}
            </div>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 12px 0;"><strong>Reported By</strong></p>
                ${createSummaryRow('Name:', `${reportedByUser?.firstName} ${reportedByUser?.lastName}`)}
                ${createSummaryRow('Username:', reportedByUser?.username || reportedByUser?.companyName)}
                ${createSummaryRow('Email:', reportedByUser?.email)}
                ${createSummaryRow('Account Type:', reportedByUser?.userType)}
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Review Comments', `${FRONTEND_URL}/admin/comments`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'Flagged Comment');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: `Flagged Comment - ${listing?.title}`,
            html
        });

        console.log(`Flagged comment email sent to admin for comment ${comment._id}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send flagged comment email:`, error);
        return false;
    }
};

// Comment emails
const newCommentSellerEmail = async (seller, listing, comment, commentAuthor) => {
    if (!(await canSendEmail(seller?.email, "newComment"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">New Comment on Your Listing</h2>
            <p style="text-align: center;">${commentAuthor?.username || commentAuthor?.companyName || commentAuthor?.firstName} has commented on your listing.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            `)}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.primary};">
                <p style="margin: 0 0 8px 0;"><strong>Comment</strong></p>
                <p style="margin: 0; font-style: italic;">${comment?.content}</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Listing', `${FRONTEND_URL}/auction/${listing?._id}`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'New Comment');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller?.email,
            subject: `New Comment on Your Listing: ${listing.title}`,
            html
        });

        console.log(`New comment email sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send new comment email to seller:`, error);
        return false;
    }
};

const newCommentBidderEmail = async (bidder, listing, comment, commentAuthor) => {
    if (!(await canSendEmail(bidder?.email, "newComment"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">New Activity on Listing</h2>
            <p style="text-align: center;">${commentAuthor?.username || commentAuthor?.companyName || commentAuthor?.firstName} has added a comment on a listing you're interested in.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing?.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            `)}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.primary};">
                <p style="margin: 0 0 8px 0;"><strong>Comment</strong></p>
                <p style="margin: 0; font-style: italic;">${comment?.content}</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Listing', `${FRONTEND_URL}/auction/${listing?._id}`, 'primary')}
            </div>
        `;

        const html = baseTemplate(content, 'New Activity');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: bidder?.email,
            subject: `New Activity on Listing: ${listing?.title}`,
            html
        });

        console.log(`New comment email sent to bidder ${bidder.email}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send new comment email to bidder:`, error);
        return false;
    }
};

// Note: sendOfferOutbidNotifications is not needed as offers cannot be outbid
const sendOfferOutbidNotifications = async () => {
    console.log("sendOfferOutbidNotifications is deprecated - offers cannot be outbid");
    return false;
};

// ============================================
// PAYOUT EMAILS (RexBid Branding)
// ============================================

// Payout Initiated
const payoutInitiatedEmail = async (seller, auction, payout) => {
    try {
        const displayName =
            seller?.firstName || seller?.companyName || seller?.username || "there";

        const content = `
            <h2 style="text-align: center;">Payout Initiated</h2>
            <p style="text-align: center; color: ${BRAND_COLORS.textLight};">
                Good news, ${displayName}! Your payout is now being processed.
            </p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${auction.title}
                </p>

                ${createSummaryRow("Payout Method:", payout.payoutMethod)}
                ${createSummaryRow("Total Sale Amount:", payout.formattedTotalAmount)}
                ${createSummaryRow("Commission:", payout.formattedCommissionAmount)}

                <div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                    <span style="font-weight: bold; color: ${BRAND_COLORS.secondary}; font-size: 16px;">
                        Your Payout Amount
                    </span>
                    <span style="font-weight: bold; color: ${BRAND_COLORS.primary}; font-size: 16px;">
                        ${payout.formattedSellerAmount}
                    </span>
                </div>
            `)}

            <p>Dear <strong>${displayName}</strong>,</p>

            <p>
                We're pleased to inform you that the payout process for your sold item
                has been initiated by our admin team. Your payment is now being processed.
            </p>

            <div style="background: #fffbeb; border-left: 4px solid ${BRAND_COLORS.warning}; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 6px 0;"><strong>What happens next?</strong></p>
                <p style="margin: 0; color: ${BRAND_COLORS.textLight};">
                    The admin will process your payment manually. You'll receive another
                    notification once the payment has been completed. Please allow
                    1–3 business days for processing.
                </p>
            </div>

            <p>
                If you have any questions about this payout, please contact our support team.
            </p>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton("View Your Listing", `${FRONTEND_URL}/auction/${auction._id}`, "primary")}
            </div>
        `;

        const html = baseTemplate(content, "Payout Initiated");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: `Payout Initiated - ${auction.title}`,
            html,
        });

        console.log(`Payout initiated email sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error("Failed to send payout initiated email:", error);
        return false;
    }
};

// Payout Completed
const payoutCompletedEmail = async (seller, auction, payout) => {
    try {
        const displayName =
            seller?.firstName || seller?.companyName || seller?.username || "there";

        const content = `
            <h2 style="text-align: center;">Payout Completed</h2>
            <p style="text-align: center; color: ${BRAND_COLORS.textLight};">
                Your payout has been processed, ${displayName}!
            </p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${auction.title}
                </p>

                ${createSummaryRow("Payout Method:", payout.payoutMethod)}
                ${payout.transactionId
                ? createSummaryRow("Transaction ID:", payout.transactionId)
                : ""
            }
                ${createSummaryRow("Total Sale Amount:", payout.formattedTotalAmount)}
                ${createSummaryRow("Commission:", payout.formattedCommissionAmount)}

                <div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; border-top: 2px solid ${BRAND_COLORS.secondary};">
                    <span style="font-weight: bold; color: ${BRAND_COLORS.secondary}; font-size: 16px;">
                        Amount Sent to You
                    </span>
                    <span style="font-weight: bold; color: ${BRAND_COLORS.primary}; font-size: 16px;">
                        ${payout.formattedSellerAmount}
                    </span>
                </div>
            `)}

            <p>Dear <strong>${displayName}</strong>,</p>

            <p>
                Great news! Your payout has been successfully processed and the payment
                has been sent to your ${payout.payoutMethod} account.
            </p>

            <div style="background: #f0fdf4; border-left: 4px solid ${BRAND_COLORS.success}; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 6px 0;"><strong>Payment Details</strong></p>
                <p style="margin: 0; color: ${BRAND_COLORS.textLight};">
                    Please check your ${payout.payoutMethod} account. The payment should
                    appear within 1–3 business days depending on your provider.
                </p>
            </div>

            <p>Thank you for selling with ${BRAND_NAME}! We appreciate your business.</p>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton("View Your Listing", `${FRONTEND_URL}/auction/${auction._id}`, "primary")}
            </div>

            <!-- Rate Us CTA -->
            <div style="background: ${BRAND_COLORS.grayBg}; border: 1px solid ${BRAND_COLORS.grayBorder}; border-radius: 12px; padding: 20px; margin: 28px 0 0 0; text-align: center;">
                <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.secondary};">
                    How was your experience?
                </p>
                <p style="margin: 0 0 12px 0; color: ${BRAND_COLORS.textLight}; font-size: 14px;">
                    A quick rating helps other buyers and sellers trust ${BRAND_NAME}.
                </p>
                ${createButton("Rate Us", `${FRONTEND_URL}/rate-us`, "outline")}
            </div>
        `;

        const html = baseTemplate(content, "Payout Completed");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: `Payout Completed - ${auction.title}`,
            html,
        });

        console.log(`Payout completed email sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error("Failed to send payout completed email:", error);
        return false;
    }
};

// Payout Failed / Action Required
const payoutFailedEmail = async (seller, payout) => {
    try {
        const displayName =
            seller?.firstName || seller?.companyName || seller?.username || "there";

        const content = `
            <h2 style="text-align: center;">Payout Issue</h2>
            <p style="text-align: center; color: ${BRAND_COLORS.textLight};">
                We encountered an issue with your payout.
            </p>

            <div style="background: #fffbeb; border-left: 4px solid ${BRAND_COLORS.warning}; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 6px 0;"><strong>Reason</strong></p>
                <p style="margin: 0; color: ${BRAND_COLORS.textLight};">
                    ${payout.failureReason || "Payment method issue or invalid details"}
                </p>
            </div>

            ${createInfoCard(`
                ${createSummaryRow("Payout Amount:", payout.formattedSellerAmount)}
                ${createSummaryRow("Payout Method:", payout.payoutMethod)}
            `)}

            <p>Dear <strong>${displayName}</strong>,</p>

            <p>
                We regret to inform you that there was an issue processing your payout of
                <strong>${payout.formattedSellerAmount}</strong> via ${payout.payoutMethod}.
            </p>

            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 0 0 8px 0;"><strong>Next Steps</strong></p>
                <p style="margin: 0; color: ${BRAND_COLORS.textLight};">
                    Please check your payout method details in your account settings and
                    ensure they are correct. Our admin team will review the issue and may
                    contact you for additional information.
                </p>
            </div>

            <p>
                If you need immediate assistance, please contact our support team.
            </p>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton("Contact Support", `mailto:${SUPPORT_EMAIL}`, "primary")}
            </div>
        `;

        const html = baseTemplate(content, "Payout Issue");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: `Payout Update - Action Required`,
            html,
        });

        console.log(`Payout failed email sent to seller ${seller.email}`);
        return !!info;
    } catch (error) {
        console.error("Failed to send payout failed email:", error);
        return false;
    }
};

// 28. Giveaway participation confirmation email
const giveawayParticipationEmail = async (userEmail, listing) => {
    if (!(await canSendEmail(userEmail, "giveawayParticipation"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">You're in the Giveaway!</h2>
            <p style="text-align: center;">You have successfully entered the giveaway for <strong>${listing.title}</strong>.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            `)}
            
            <p>Thank you for participating in this giveaway!</p>
            <p>We'll notify you via email if you are selected as the winner.</p>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('View Giveaway', `${FRONTEND_URL}/auction/${listing._id}`, 'primary')}
            </div>
            
            <p>Good luck!</p>
        `;

        const html = baseTemplate(content, 'Giveaway Entry Confirmed');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `Giveaway Entry Confirmed - ${listing.title}`,
            html
        });

        console.log(`Giveaway participation email sent to ${userEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send giveaway participation email:`, error);
        return false;
    }
};

// 29. Giveaway winner notification email
const giveawayWinnerEmail = async (winnerEmail, winnerName, listing) => {
    try {
        const content = `
            <h2 style="text-align: center;">🎉 Congratulations! You Won!</h2>
            <p style="text-align: center;">You have been selected as the winner of the giveaway for <strong>${listing.title}</strong>!</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>
                ${listing.subTitle ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>` : ''}
                
                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 16px 0 0 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            `)}
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid ${BRAND_COLORS.success};">
                <p style="margin: 0 0 12px 0;"><strong>What happens next?</strong></p>
                <p style="margin: 0;">Please contact our support team to arrange collection or delivery of your prize.</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Contact Support', `mailto:${SUPPORT_EMAIL}?subject=Giveaway%20Winner%20-%20${listing.title}`, 'primary')}
            </div>
            
            <p>Dear ${winnerName},</p>
            <p>We are delighted to inform you that you have been selected as the winner of the <strong>${listing.title}</strong> giveaway!</p>
            <p>Our team will be in touch with you shortly to arrange the next steps.</p>
            
            <p>Once again, congratulations on your win!</p>
        `;

        const html = baseTemplate(content, '🎉 You Won the Giveaway!');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: winnerEmail,
            subject: `🎉 Congratulations! You Won ${listing.title}!`,
            html
        });

        console.log(`Giveaway winner email sent to ${winnerEmail}`);
        return !!info;
    } catch (error) {
        console.error(`Failed to send giveaway winner email:`, error);
        return false;
    }
};

// ============================================
// ACCOUNT APPROVED EMAIL (to user)
// ============================================

const accountApprovedEmail = async (user) => {
    try {
        const content = `
            <h2 style="text-align: center;">✅ Account Approved</h2>
            <p style="text-align: center;">Welcome to ${BRAND_NAME}, ${user.firstName || user.username}!</p>
            
            <p>We are pleased to inform you that your account has been <strong>approved</strong> by our team. You now have full access to all features of ${BRAND_NAME}.</p>
            
            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: ${BRAND_COLORS.secondary};">Your Approved Account Allows You To:</p>
                
                <div style="margin: 12px 0 0 0;">
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid ${BRAND_COLORS.grayBorder};">
                        <span style="font-size: 20px;">🏷️</span>
                        <span style="color: ${BRAND_COLORS.text};">Bid on auctions and compete for items</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0;">
                        <span style="font-size: 20px;">📤</span>
                        <span style="color: ${BRAND_COLORS.text};">Upload your own auctions and start selling</span>
                    </div>
                </div>
            `)}
            
            <p>You can now log in to your account and start exploring all the features ${BRAND_NAME} has to offer.</p>
            
            <div style="text-align: center; margin: 25px 0;">
                ${createButton('Go to Dashboard', `${FRONTEND_URL}/${user?.userType || 'bidder'}/dashboard`, 'primary')}
            </div>
            
            <div style="background: ${BRAND_COLORS.grayBg}; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 0 0 12px 0; font-weight: bold; color: ${BRAND_COLORS.secondary};">📞 Need Assistance?</p>
                <p style="margin: 0 0 8px 0; color: ${BRAND_COLORS.text};">If you have any questions or need any assistance at any stage, just reach out to us:</p>
                
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid ${BRAND_COLORS.grayBorder};">
                    <div style="display: flex; align-items: center; gap: 10px; padding: 4px 0;">
                        <span style="font-weight: 600; color: ${BRAND_COLORS.secondary}; min-width: 50px;">Email:</span>
                        <a href="mailto:admin@rexbid.ie" style="color: ${BRAND_COLORS.primary}; text-decoration: none;">admin@rexbid.ie</a>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; padding: 4px 0;">
                        <span style="font-weight: 600; color: ${BRAND_COLORS.secondary}; min-width: 50px;">Phone:</span>
                        <span style="color: ${BRAND_COLORS.text};">087 203 9257 (Darren)</span>
                    </div>
                </div>
            </div>
            
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.success};">
                <p style="margin: 0; color: #166534; font-size: 14px;">
                    <strong>🎉 Welcome aboard!</strong> We're excited to have you as part of the ${BRAND_NAME} community.
                </p>
            </div>
        `;

        const html = baseTemplate(content, 'Account Approved');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: `Account Approved - Welcome to ${BRAND_NAME}!`,
            html
        });

        console.log(`✅ Account approval email sent to ${user.email}`);
        return !!info;
    } catch (error) {
        console.error(`❌ Failed to send account approval email:`, error);
        return false;
    }
};

const auctionReserveNotMetEmail = async (
    bidderEmail,
    bidderName,
    listing,
    bidderRank,
    bidderAmount,
) => {
    if (!(await canSendEmail(bidderEmail, "reserveNotMet"))) return false;

    try {
        const title = listing?.title || "Auction";
        const currency = listing?.baseCurrency || "EUR";
        const reservePrice = Number(listing?.reservePrice || 0);
        const theirBid = Number(bidderAmount || 0);
        const gap = Math.max(0, reservePrice - theirBid);
        const endDateStr = listing?.endDate
            ? new Date(listing.endDate).toLocaleString()
            : "recently";
        const offerUrl = `${FRONTEND_URL}/bidder/bids`;

        const rankBadge =
            bidderRank === 1
                ? `<span style="display:inline-block;background:#FEF3C7;color:#92400E;font-weight:600;padding:4px 10px;border-radius:999px;font-size:12px;">🥇 Highest Bidder</span>`
                : `<span style="display:inline-block;background:#E0E7FF;color:#3730A3;font-weight:600;padding:4px 10px;border-radius:999px;font-size:12px;">🥈 Second Highest Bidder</span>`;

        const content = `
      <h2 style="text-align:center;margin-bottom:6px;">Reserve Price Not Met</h2>
      <p style="text-align:center;color:${BRAND_COLORS.textLight};margin-top:0;">
        The auction for <strong>${title}</strong> ended without meeting the seller's reserve.
      </p>

      <div style="text-align:center;margin:12px 0 18px 0;">${rankBadge}</div>

      ${createInfoCard(`
        <p style="margin:0 0 12px 0;font-size:18px;font-weight:bold;color:${BRAND_COLORS.secondary};">${title}</p>
        ${listing.subTitle
                ? `<p style="margin:0 0 16px 0;text-align:center;color:${BRAND_COLORS.textLight};">${listing.subTitle}</p>`
                : ""}
        ${createSummaryRow("Auction Ended:", endDateStr)}
        ${createSummaryRow("Your Highest Bid:", `${currency} ${theirBid.toLocaleString()}`)}
        ${createSummaryRow("Reserve Price:", `${currency} ${reservePrice.toLocaleString()}`)}
        ${createSummaryRow("Difference:", `${currency} ${gap.toLocaleString()}`)}
      `)}

      <div style="background:#EFF6FF;border-left:4px solid #3B82F6;padding:14px 16px;border-radius:6px;margin:20px 0;">
        <strong style="color:#1E40AF;">💬 You can still make an offer</strong>
        <p style="margin:6px 0 0 0;color:${BRAND_COLORS.textLight};">
          The reserve was <strong>${currency} ${reservePrice.toLocaleString()}</strong>.
          You were only <strong>${currency} ${gap.toLocaleString()}</strong> away.
          As one of the top two bidders, you can submit a direct offer to the seller from your
          <strong>My Bids</strong> page.
        </p>
      </div>

      <p>Hi ${bidderName || "there"}, if you're still interested in <strong>${title}</strong>,
      go to <strong>My Bids</strong> and use the <em>Make an Offer</em> button on this listing.
      The seller is free to accept or decline.</p>

      <div style="text-align:center;margin:25px 0;">
        ${createButton("Go to My Bids", offerUrl, "primary")}
      </div>
    `;

        const html = baseTemplate(content, "Reserve Price Not Met");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: bidderEmail,
            subject: `Reserve not met — you can still make an offer on "${title}"`,
            html,
        });
        return !!info;
    } catch (error) {
        console.error("Failed to send reserve-not-met email:", error);
        return false;
    }
};

// Watchlist bid notification for users watching an auction
const watchlistBidNotificationEmail = async (
    userEmail,
    userName,
    listing,
    newBid,
    listingUrl,
    outBidderCurrency
) => {
    if (!(await canSendEmail(userEmail, "watchlist"))) return false;

    try {
        const content = `
            <h2 style="text-align: center;">New Bid on an Auction You're Watching</h2>
            <p style="text-align: center;">A new bid has just been placed on an auction you added to your watchlist.</p>

            <div style="background: ${BRAND_COLORS.grayBg}; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.primary};">
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">${listing.title}</p>

                <p style="margin: 15px 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.secondary};">Current Highest Bid: ${formatCurrency(newBid, outBidderCurrency)}</p>

                ${listing.endDate ? `
                    <p style="margin: 10px 0; font-size: 14px; color: ${BRAND_COLORS.secondary};">
                        <strong>Auction Ends:</strong> ${new Date(listing.endDate).toLocaleString('en-IE')}
                    </p>
                ` : ''}

                ${listing.specifications && listing.specifications.size > 0 ? `
                    <div style="margin: 20px 0;">
                        <strong style="color: ${BRAND_COLORS.secondary};">Item Details</strong>
                        ${renderSpecifications(listing.specifications)}
                    </div>
                ` : ''}
            </div>

            <div style="text-align: center; padding: 25px; background: ${BRAND_COLORS.grayBg}; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0 0 15px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">Still interested? Place your bid before the auction ends.</p>

                <div style="margin: 20px 0;">
                    ${createButton('View Auction & Bid Now', listingUrl, 'primary')}
                </div>

                <div>
                    <a href="${FRONTEND_URL}/bidder/watchlist" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 5px;">View My Watchlist</a>
                    <a href="${FRONTEND_URL}/auctions" style="display: inline-block; background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 5px;">Browse Other Listings</a>
                </div>
            </div>

            <p>Dear ${userName},</p>
            <p>This is an automated notification to let you know that a new bid has been placed on <strong>${listing.title}</strong>, an auction you're watching.</p>
            <p>If you're still interested, we recommend placing your bid soon. Auctions can end at any time and extensions may apply.</p>
        `;

        const html = baseTemplate(content, 'Watchlist Bid Notification');

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: `New Bid on "${listing.title}" — Auction You're Watching`,
            html
        });

        return !!info;
    } catch (error) {
        throw new Error(`Failed to send watchlist bid notification: ${error.message}`);
    }
};

const WATCHLIST_DEBOUNCE_DELAY = 60 * 1000; // 1 minute per auction
const lastWatchlistNotificationTimes = new Map();

// 18. Bulk watchlist bid notifications
const sendWatchlistBidNotifications = async (
    auction,
    currentBidderId,
    newBidAmount,
    outBidderCurrency
) => {
    try {
        const auctionId = auction._id.toString();

        // Per-auction debounce
        const now = Date.now();
        const lastTime = lastWatchlistNotificationTimes.get(auctionId) || 0;

        if (now - lastTime < WATCHLIST_DEBOUNCE_DELAY) {
            console.log(
                `Watchlist bid notifications debounced for auction ${auctionId} - too frequent`
            );
            return;
        }
        lastWatchlistNotificationTimes.set(auctionId, now);

        // Fetch all users watching this auction
        const watchers = await Watchlist.find({ auction: auctionId }).select("user");
        const watcherIds = watchers.map((w) => w.user.toString());

        // Exclude the bidder (in case they watch their own target) and the seller
        const sellerId =
            auction.seller?._id?.toString() || auction.seller?.toString();
        const recipientIds = watcherIds.filter(
            (id) => id !== currentBidderId && id !== sellerId
        );

        if (recipientIds.length === 0) {
            console.log("No watchlist users to notify for this bid");
            return;
        }

        const users = await User.find({
            _id: { $in: recipientIds },
            isActive: true,
        }).select("email username companyName firstName lastName");

        const eligibleUsers = users.filter((u) => canEmailUser(u, "watchlist"));
        if (eligibleUsers.length === 0) {
            console.log("No watchlist users with notifications enabled");
            return;
        }

        if (eligibleUsers.length === 0) {
            console.log("No active watchlist users found for this auction");
            return;
        }

        const auctionUrl = `${process.env.FRONTEND_URL}/auction/${auction._id}`;

        const notificationPromises = eligibleUsers.map(async (user) => {
            try {
                await watchlistBidNotificationEmail(
                    user.email,
                    user.username ||
                    user.companyName ||
                    `${user.firstName} ${user.lastName}`,
                    auction,
                    newBidAmount,
                    auctionUrl,
                    outBidderCurrency
                );
            } catch (error) {
                console.error(
                    `Failed to send watchlist bid notification to ${user.email}:`,
                    error.message
                );
            }
        });

        const results = await Promise.allSettled(notificationPromises);

        const successful = results.filter(
            (r) => r.status === "fulfilled"
        ).length;
        const failed = results.filter(
            (r) => r.status === "rejected"
        ).length;

        console.log(
            `Watchlist bid notifications for auction ${auctionId}: ${successful} successful, ${failed} failed`
        );
    } catch (error) {
        console.error("Error sending watchlist bid notifications:", error);
    }
};

// ============================================================
// Delivery Quote - Admin Notification (goes to seamus@evolveauto.ie)
// ============================================================
const deliveryQuoteAdminEmail = async ({
    name,
    email,
    phone,
    subject,
    whatDelivered,
    weightDimensions,
    collectionAddress,
    deliveryAddress,
    ipAddress,
    userAgent,
    message, // legacy fallback
}) => {
    try {
        if (DELIVERY_PARTNER_EMAILS.length === 0) {
            console.warn(
                "deliveryQuoteAdminEmail: no DELIVERY_PARTNER_EMAILS configured"
            );
            return false;
        }

        const displayWhatDelivered = whatDelivered || message || "—";
        const emailSubject =
            subject || `New Delivery Quote Request - ${displayWhatDelivered}`;

        const content = `
            <h2 style="text-align: center;">New Delivery Quote Request</h2>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${displayWhatDelivered}
                </p>

                <div style="margin-top: 8px;">
                    ${weightDimensions
                ? createSummaryRow("Weight / Dimensions:", weightDimensions)
                : ""}
                    ${createSummaryRow("Collection Address:", collectionAddress || "—")}
                    ${createSummaryRow("Delivery Address:", deliveryAddress || "—")}
                </div>
            `)}

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Contact Information</strong></p>
                ${createSummaryRow("Full Name:", name)}
                ${createSummaryRow(
                    "Email:",
                    `<a href="mailto:${email}" style="color: ${BRAND_COLORS.primary};">${email}</a>`
                )}
                ${createSummaryRow("Phone:", phone || "Not provided")}
            `)}
        `;

        const html = baseTemplate(content, "New Delivery Quote Request");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: DELIVERY_PARTNER_EMAILS, // 👈 array from DELIVERY_PARTNER_EMAILS env
            replyTo: email,              // 👈 replies go back to the submitter
            subject: emailSubject,
            html,
        });

        return !!info;
    } catch (error) {
        throw new Error(error);
    }
};

// ============================================================
// Delivery Quote - User Confirmation
// ============================================================
const deliveryQuoteUserEmail = async ({ name, email }) => {
    try {
        const content = `
            <h2 style="text-align: center;">Our Delivery Partner Has Received Your Quote Request</h2>

            ${createInfoCard(
            `
                <p style="margin: 0 0 16px 0; font-size: 18px; color: ${BRAND_COLORS.secondary};">
                    Dear ${name},
                </p>

                <p style="margin: 0 0 16px 0;">
                    Thank you for requesting a delivery quote. Our delivery partner have successfully received your request and their team is reviewing it now.
                </p>

                <p style="margin: 0 0 16px 0;">
                    You can expect to hear back from them with a personalised quote asap.
                </p>
            `,
            "default"
        )}

            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 5px 0;">Best regards,</p>
                <p style="margin: 5px 0;"><strong>The ${BRAND_NAME} Team</strong></p>
            </div>
        `;

        const html = baseTemplate(content, "Quote Request Received");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `We've Received Your Delivery Quote Request — ${BRAND_NAME}`,
            html,
        });

        return !!info;
    } catch (error) {
        throw new Error(error);
    }
};

// ============================================================
// Website Review - Admin Notification
// ============================================================
const websiteReviewAdminEmail = async (review) => {
    try {
        const userTypeDisplay =
            review.userType === "delivery-partner"
                ? "Delivery Partner"
                : (review.userType || "other").charAt(0).toUpperCase() +
                (review.userType || "other").slice(1);

        const content = `
            <h2 style="text-align: center;">New Website Review Submitted</h2>
            <p style="text-align: center; color: ${BRAND_COLORS.textLight}; margin-top: -8px;">
                A new review has been submitted and is pending your approval.
            </p>

            ${createRatingBadge(review.rating)}

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0;"><strong>Reviewer Information</strong></p>
                ${createSummaryRow("Full Name:", review.name)}
                ${createSummaryRow(
            "Email:",
            `<a href="mailto:${review.email}" style="color: ${BRAND_COLORS.primary};">${review.email}</a>`
        )}
                ${createSummaryRow("Phone:", review.phone || "Not provided")}
                ${createSummaryRow("Location:", review.location)}
                ${createSummaryRow("User Type:", userTypeDisplay)}
            `)}

            <div style="margin: 20px 0;">
                <strong style="color: ${BRAND_COLORS.secondary};">Their Feedback:</strong>
                <div style="background: ${BRAND_COLORS.grayBg}; padding: 16px; border-radius: 8px; margin-top: 8px; border: 1px solid ${BRAND_COLORS.grayBorder}; border-left: 4px solid ${BRAND_COLORS.primary}; white-space: pre-wrap; font-style: italic; color: ${BRAND_COLORS.text};">
                    "${review.feedback}"
                </div>
            </div>

            <div style="background: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${BRAND_COLORS.warning};">
                <p style="margin: 0; color: ${BRAND_COLORS.secondary}; font-size: 14px;">
                    <strong>Action Required:</strong> Please review this feedback and
                    approve or reject it from the admin panel. Only approved reviews
                    appear publicly on the "What Our Clients Say" page.
                </p>
            </div>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton("Review in Admin Panel", `${ADMIN_URL}/website-reviews`, "primary")}
            </div>
        `;

        const html = baseTemplate(content, "New Website Review");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            replyTo: review.email,
            subject: `New Website Review — ${review.rating}★ from ${review.name}`,
            html,
        });

        console.log(
            `Website review admin email sent for review ${review._id || "(new)"}`
        );
        return !!info;
    } catch (error) {
        console.error(`Failed to send website review admin email:`, error);
        return false;
    }
};

// ============================================================
// Website Review - User Confirmation
// ============================================================
const websiteReviewUserEmail = async ({ name, email }) => {
    try {
        const content = `
            <h2 style="text-align: center;">Thank You for Your Review!</h2>

            ${createInfoCard(`
                <p style="margin: 0 0 16px 0; font-size: 18px; color: ${BRAND_COLORS.secondary};">
                    Dear ${name},
                </p>

                <p style="margin: 0 0 16px 0;">
                    We really appreciate you taking the time to share your experience
                    with <strong>${BRAND_NAME}</strong>. Your feedback helps us improve
                    our platform for everyone.
                </p>

                <p style="margin: 0;">
                    Our team is reviewing your submission now. Once approved, your
                    review will be published on our public
                    <strong>"What Our Clients Say"</strong> page so others can read
                    about your experience.
                </p>
            `, "default")}

            <div style="background: ${BRAND_COLORS.secondary}; color: #ffffff; padding: 22px; border-radius: 12px; margin: 25px 0; text-align: center;">
                <div style="color: ${BRAND_COLORS.primary}; font-size: 16px; margin-bottom: 10px; font-weight: bold;">
                    Want to See What Others Are Saying?
                </div>
                <p style="font-size: 14px; margin: 0 0 18px 0; opacity: 0.9;">
                    Visit our reviews page to read feedback from other buyers and
                    sellers across Ireland.
                </p>
                <a href="${FRONTEND_URL}/reviews" style="display: inline-block; background: ${BRAND_COLORS.primary}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 40px; font-weight: 600; font-size: 15px;">
                    View All Reviews
                </a>
            </div>

            <div style="background: ${BRAND_COLORS.grayBg}; padding: 18px; border-radius: 8px; margin: 20px 0; text-align: center; font-size: 14px; border: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 0 0 8px 0;">
                    <strong style="color: ${BRAND_COLORS.secondary};">Need to Get in Touch?</strong>
                </p>
                <p style="margin: 0;">
                    Email: <a href="mailto:${SUPPORT_EMAIL}" style="color: ${BRAND_COLORS.primary};">${SUPPORT_EMAIL}</a>
                </p>
            </div>

            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid ${BRAND_COLORS.grayBorder};">
                <p style="margin: 5px 0;">Warm regards,</p>
                <p style="margin: 5px 0;"><strong>The ${BRAND_NAME} Team</strong></p>
            </div>
        `;

        const html = baseTemplate(content, "Review Received");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Thank You for Your Review — ${BRAND_NAME}`,
            html,
        });

        console.log(`Website review confirmation email sent to ${email}`);
        return !!info;
    } catch (error) {
        console.error(
            `Failed to send website review confirmation email:`,
            error
        );
        return false;
    }
};

// Seller nudge: last hour, bid is within 25% of reserve
const auctionReserveNudgeEmail = async (seller, listing) => {
    if (!(await canSendEmail(seller.email, "reserveNudge"))) return false;

    try {
        const base = listing?.baseCurrency || "EUR";
        const currency = seller?.currency || base;

        const currentBidBase = Number(listing?.currentPrice || 0);
        const reserveBase = Number(listing?.reservePrice || 0);
        const gapBase = Math.max(0, reserveBase - currentBidBase);

        // Convert all three to seller's currency
        const currentBid = convertRawAmount(currentBidBase, base, currency);
        const reservePrice = convertRawAmount(reserveBase, base, currency);
        const gap = convertRawAmount(gapBase, base, currency);

        const gapPercent = reserveBase > 0
            ? ((gapBase / reserveBase) * 100).toFixed(1)
            : "0";

        const minutesRemaining = Math.max(
            1,
            Math.ceil((new Date(listing.endDate) - new Date()) / (60 * 1000))
        );

        const suggestedReserve = currentBid; // lower it to the current bid to guarantee a sale

        const content = `
            <h2 style="text-align: center;">Your reserve is within reach</h2>
            <p style="text-align: center; color: ${BRAND_COLORS.textLight}; margin-top: -6px;">
                Your auction ends in <strong>${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}</strong> —
                the highest bid is only <strong>${gapPercent}%</strong> below your reserve.
            </p>

            ${createInfoCard(`
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: ${BRAND_COLORS.secondary};">
                    ${listing.title}
                </p>
                ${listing.subTitle
                ? `<p style="margin: 0 0 16px 0; text-align: center; color: ${BRAND_COLORS.textLight};">${listing.subTitle}</p>`
                : ""}

                ${createSummaryRow("Current Bid:", formatCurrency(currentBid, currency))}
                ${createSummaryRow("Your Reserve:", formatCurrency(reservePrice, currency))}
                ${createSummaryRow("Gap to Reserve:", formatCurrency(gap, currency))}
                ${createSummaryRow("Ends In:", `${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}`)}
            `)}

            <div style="background: #FFF7ED; border-left: 4px solid #F97316; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #9A3412;">
                    Lower your reserve to secure the sale
                </p>
                <p style="margin: 0; color: ${BRAND_COLORS.textLight};">
                    If the reserve isn't met by the time bidding closes, the auction will end
                    without a sale. Lowering your reserve to
                    <strong>${formatCurrency(suggestedReserve, currency)}</strong>
                    or just below would convert this bidder into a buyer.
                </p>
            </div>

            <p>Hi ${seller.firstName || seller.companyName || seller.username || "there"},</p>
            <p>
                Your listing <strong>${listing.title}</strong> is in its final hour.
                The current highest bid is <strong>${formatCurrency(currentBid, currency)}</strong>,
                and your reserve is <strong>${formatCurrency(reservePrice, currency)}</strong> — a
                difference of just <strong>${formatCurrency(gap, currency)}</strong>.
            </p>

            <p>
                You can lower the reserve directly from your seller dashboard
                right up until bidding closes.
            </p>

            <div style="text-align: center; margin: 25px 0;">
                ${createButton("Lower Reserve Price", `${FRONTEND_URL}/seller/auctions/all`, "primary")}
            </div>

            <p style="text-align: center; color: ${BRAND_COLORS.textLight}; font-size: 13px;">
                ⏱ Once bidding closes, the reserve cannot be changed.
            </p>
        `;

        const html = baseTemplate(content, "Last Chance to Lower Your Reserve");

        const info = await transporter.sendMail({
            from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
            to: seller.email,
            subject: `⏰ ${minutesRemaining}m left — your reserve is ${gapPercent}% away from a sale`,
            html,
        });

        return !!info;
    } catch (error) {
        console.error("Failed to send reserve nudge email:", error);
        return false;
    }
};

export {
    contactEmail, //done
    contactConfirmationEmail, //done
    welcomeEmail, //done
    newUserRegistrationEmail, //done
    resetPasswordEmail, //done
    auctionSubmittedForApprovalEmail, //done
    auctionApprovedEmail, // done
    auctionListedEmail, //done
    newAuctionNotificationEmail, //done
    sendBulkAuctionNotifications, //done
    bidConfirmationEmail, //done
    newBidNotificationEmail, //done
    offerConfirmationEmail, //done
    newOfferNotificationEmail, //done
    outbidNotificationEmail, //done
    sendOutbidNotifications, //done
    sendOfferOutbidNotifications, //no need to do as offers cannot be outbid
    auctionEndingSoonEmail, //done
    auctionEndingSoonSellerEmail,
    sendAuctionWonStandardEmail, //done
    sendAuctionWonHighValueEmail,
    sendAuctionWonEmail,
    sendAuctionEndedSellerEmail, //done
    auctionWonAdminEmail, //done
    auctionEndedAdminEmail, //done
    offerAcceptedEmail, //done
    offerRejectedEmail, //done
    offerCanceledEmail, //done
    newCommentSellerEmail, //done
    newCommentBidderEmail, //done
    flaggedCommentAdminEmail, //done
    paymentCompletedEmail, //done
    paymentSuccessEmail, //done
    paymentCompletedSellerEmail, //done
    payoutInitiatedEmail, //22
    payoutCompletedEmail, //23
    payoutFailedEmail, //24
    giveawayParticipationEmail,
    giveawayWinnerEmail,
    accountApprovedEmail,
    auctionReserveNotMetEmail,
    watchlistBidNotificationEmail,
    sendWatchlistBidNotifications,
    offerCounteredEmail,
    buyerCounteredEmail,
    counterOfferRejectedEmail,
    deliveryQuoteAdminEmail,
    deliveryQuoteUserEmail,
    sendMarketingCampaignEmail,
    websiteReviewAdminEmail,
    websiteReviewUserEmail,
    auctionReserveNudgeEmail,
};