// Email verification at sign-up: a 6-digit code is emailed and must be entered
// before the account can be used. Applies to accounts created from now on
// (emailVerificationRequired); existing accounts are not affected.
//
// Codes are stored hashed, last 30 minutes, allow 5 tries, and a new one can
// be sent once a minute.

import crypto from "crypto";
import User from "../models/user.model.js";
import { verificationCodeEmail } from "../utils/nodemailer.js";

export const CODE_MINUTES = 30;
export const MAX_ATTEMPTS = 5;
export const RESEND_SECONDS = 60;

export const hashCode = (userId, code) =>
  crypto.createHash("sha256").update(`${userId}:${String(code).trim()}`).digest("hex");

/**
 * Sign-up codes are switched off unless EMAIL_VERIFICATION=on is set on the
 * server. While off, new accounts sign straight in and anyone still waiting
 * for a code can log in normally.
 */
export const emailVerificationEnabled = () =>
  String(process.env.EMAIL_VERIFICATION || "").toLowerCase() === "on";

/** Does this user still need to verify their email? */
export const needsEmailVerification = (user) =>
  emailVerificationEnabled() && Boolean(user?.emailVerificationRequired) && !user?.emailVerifiedAt;

/** Seconds until another code may be sent (0 = now). */
export const resendWaitSeconds = (user, now = Date.now()) => {
  const sent = user?.emailVerificationSentAt ? new Date(user.emailVerificationSentAt).getTime() : 0;
  return Math.max(0, Math.ceil((sent + RESEND_SECONDS * 1000 - now) / 1000));
};

/** Creates a new code, saves its hash and emails it. */
export const sendVerificationCode = async (user) => {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationCode: hashCode(user._id, code),
        emailVerificationExpires: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
        emailVerificationAttempts: 0,
        emailVerificationSentAt: new Date(),
      },
    }
  );
  await verificationCodeEmail(user, code, CODE_MINUTES);
  return code; // returned for tests only; never sent to the browser
};

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

/**
 * Checks a code. On success the account is marked verified and returned.
 * Wrong or expired codes throw with a message for the person.
 */
export const confirmVerificationCode = async (email, code) => {
  const normalized = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select("+emailVerificationCode +sessions");
  if (!user || user.deletedAt) throw fail(400, "That code isn't right. Please check it and try again.");
  if (!needsEmailVerification(user)) return { user, alreadyVerified: true };

  if (!/^\d{6}$/.test(String(code || "").trim())) throw fail(400, "Enter the 6-digit code from the email.");
  if (!user.emailVerificationCode || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    throw fail(400, "That code has expired. We can send you a new one.", "CODE_EXPIRED");
  }
  if ((user.emailVerificationAttempts || 0) >= MAX_ATTEMPTS) {
    throw fail(429, "Too many wrong tries. Please ask for a new code.", "TOO_MANY_ATTEMPTS");
  }

  const ok = crypto.timingSafeEqual(Buffer.from(hashCode(user._id, code)), Buffer.from(user.emailVerificationCode));
  if (!ok) {
    await User.updateOne({ _id: user._id }, { $inc: { emailVerificationAttempts: 1 } });
    const left = MAX_ATTEMPTS - (user.emailVerificationAttempts || 0) - 1;
    throw fail(400, left > 0
      ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
      : "That code isn't right. Please ask for a new code.");
  }

  user.emailVerifiedAt = new Date();
  user.isEmailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpires = undefined;
  user.emailVerificationAttempts = 0;
  await user.save({ validateBeforeSave: false });
  return { user, alreadyVerified: false };
};
