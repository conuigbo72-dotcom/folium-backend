import { Router, Request, Response } from "express";
import {
  createUser,
  getUserByTelegramId,
  getUserByReferralCode,
  markUserPaid,
  countUsers,
  countPaidUsers,
  getReferralCount,
} from "../db/database";
import {
  isValidAddress,
  verifyPayment,
  sendTokens,
  usdToBnb,
} from "../utils/bsc";

const router = Router();

// ── Register user ────────────────────────────────────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  const { telegram_id, wallet_address, referral_code } = req.body;

  if (!telegram_id || !wallet_address) {
    return res.status(400).json({ error: "Missing telegram_id or wallet_address" });
  }

  if (!isValidAddress(wallet_address)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const existing = getUserByTelegramId(telegram_id);
  if (existing) {
    return res.json({ success: true, user: existing, already_registered: true });
  }

  // Check referral
  let referredBy = null;
  if (referral_code) {
    const referrer = getUserByReferralCode(referral_code);
    if (referrer) referredBy = referral_code;
  }

  const user = createUser(telegram_id, wallet_address, referredBy);
  return res.json({ success: true, user, already_registered: false });
});

// ── Get user info ─────────────────────────────────────────────────────────────
router.get("/user/:telegram_id", (req: Request, res: Response) => {
  const user = getUserByTelegramId(req.params.telegram_id);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

// ── Verify payment & send tokens ──────────────────────────────────────────────
router.post("/verify-payment", async (req: Request, res: Response) => {
  const { telegram_id, tx_hash } = req.body;

  if (!telegram_id || !tx_hash) {
    return res.status(400).json({ error: "Missing telegram_id or tx_hash" });
  }

  const user = getUserByTelegramId(telegram_id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.paid) return res.json({ success: true, message: "Already paid", user });

  // Verify the payment on chain
  const verification = await verifyPayment(tx_hash, user.wallet_address);
  if (!verification.valid) {
    return res.status(400).json({ error: verification.reason });
  }

  // Send 700 tokens immediately (70%)
  try {
    await sendTokens(user.wallet_address, 700);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to send tokens: " + err.message });
  }

  // Mark user as paid
  const updatedUser = markUserPaid(telegram_id, tx_hash);

  return res.json({
    success: true,
    message: "Payment verified! 700 tokens sent, 300 locked for 1 month.",
    user: updatedUser,
  });
});

// ── Get referral stats ────────────────────────────────────────────────────────
router.get("/referral/:referral_code", (req: Request, res: Response) => {
  const user = getUserByReferralCode(req.params.referral_code);
  if (!user) return res.status(404).json({ error: "Referral code not found" });

  const count = getReferralCount(req.params.referral_code);
  return res.json({
    referral_code: user.referral_code,
    total_referrals: count,
    total_earned_usd: count * 2,
  });
});

// ── Get BNB price for $7 ──────────────────────────────────────────────────────
router.get("/price", (_req: Request, res: Response) => {
  return res.json({
    usd: 7,
    bnb: usdToBnb(7),
    project_wallet: process.env.PROJECT_WALLET,
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", (_req: Request, res: Response) => {
  return res.json({
    total_users: countUsers(),
    paid_users: countPaidUsers(),
    total_raised_usd: countPaidUsers() * 7,
  });
});

export default router;
