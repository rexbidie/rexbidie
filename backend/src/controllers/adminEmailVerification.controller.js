// Admin: help a person who didn't get their sign-up code
// (services/emailVerificationService.js).
import User from "../models/user.model.js";
import { needsEmailVerification, sendVerificationCode } from "../services/emailVerificationService.js";

const load = async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user || user.deletedAt) {
    res.status(404).json({ success: false, message: "User not found" });
    return null;
  }
  return user;
};

// POST /api/v1/admin/users/:userId/resend-verification
export const adminResendVerification = async (req, res) => {
  try {
    const user = await load(req, res);
    if (!user) return;
    if (!needsEmailVerification(user)) {
      return res.status(400).json({ success: false, message: "This email address is already confirmed." });
    }
    if (user.emailBounced) {
      return res.status(400).json({ success: false, message: "This address is marked as bounced, so emails to it are blocked. Check the address with the person." });
    }
    await sendVerificationCode(user);
    res.json({ success: true, message: `New code sent to ${user.email}.` });
  } catch (error) {
    console.error("Admin resend verification error:", error);
    res.status(500).json({ success: false, message: `Could not send the code: ${error.message}` });
  }
};

// POST /api/v1/admin/users/:userId/confirm-email
export const adminConfirmEmail = async (req, res) => {
  try {
    const user = await load(req, res);
    if (!user) return;
    if (!needsEmailVerification(user)) {
      return res.json({ success: true, message: "Already confirmed.", data: { emailVerifiedAt: user.emailVerifiedAt } });
    }
    await User.updateOne(
      { _id: user._id },
      {
        $set: { emailVerifiedAt: new Date(), isEmailVerified: true, emailVerificationAttempts: 0, emailVerifiedByAdmin: req.user?._id || null },
        $unset: { emailVerificationCode: "", emailVerificationExpires: "" },
      },
      { strict: false }
    );
    res.json({ success: true, message: "Email marked as confirmed. They can log in now.", data: { emailVerifiedAt: new Date() } });
  } catch (error) {
    console.error("Admin confirm email error:", error);
    res.status(500).json({ success: false, message: "Could not update the account." });
  }
};
