const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, "data/folium.json");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { users: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function generateReferralCode(telegramId) {
  return `FOL${telegramId.slice(-4)}${Math.random().toString(36).slice(-4).toUpperCase()}`;
}

// ── Blockchain ────────────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
const distributorWallet = new ethers.Wallet(process.env.DISTRIBUTOR_PRIVATE_KEY, provider);

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const tokenContract = new ethers.Contract(
  process.env.TOKEN_CONTRACT_ADDRESS,
  ERC20_ABI,
  distributorWallet
);

const BNB_PRICE_USD = 600;

function usdToBnb(usd) {
  return (usd / BNB_PRICE_USD).toFixed(6);
}

// ── Telegram Bot ──────────────────────────────────────────────────────────────
const { Bot } = require("grammy");
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const MINI_APP_URL = process.env.FRONTEND_URL || "http://localhost:3000";

bot.command("start", async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const args = ctx.message?.text?.split(" ") ?? [];
  const referralCode = args[1] || null;
  const appUrl = `${MINI_APP_URL}?tid=${telegramId}${referralCode ? `&ref=${referralCode}` : ""}`;

  await ctx.reply(
    `🌿 *Welcome to Folium!*\n\nFolium is a community-driven meme coin on BSC.\n\n💰 *Public Sale:*\n• Price: $7 per registration\n• Receive: 1,000 FOLIUM tokens\n• 70% unlocked immediately\n• 30% locked for 1 month\n\n👥 *Referral:* Earn $2 for every friend you refer!\n\nTap below to open the Folium app 👇`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open Folium App", web_app: { url: appUrl } }],
          [{ text: "📢 Join Community", url: "https://t.me/foliumcoin" }],
          [{ text: "🐦 Follow on Twitter", url: "https://twitter.com/foliumcoin" }],
        ],
      },
    }
  );
});

bot.command("status", async (ctx) => {
  const db = loadDB();
  const user = db.users.find(u => u.telegram_id === String(ctx.from?.id));
  if (!user) return ctx.reply("Not registered yet. Use /start to open the Folium app!");
  await ctx.reply(
    `🌿 *Your Folium Status*\n\nWallet: \`${user.wallet_address}\`\nPaid: ${user.paid ? "✅ Yes" : "❌ No"}\nTokens: ${user.tokens_total} FOLIUM\n• Unlocked: ${user.tokens_unlocked}\n• Locked: ${user.tokens_locked}\n\n🔗 *Referral Link:*\nhttps://t.me/${ctx.me.username}?start=${user.referral_code}`,
    { parse_mode: "Markdown" }
  );
});

bot.catch((err) => console.error("Bot error:", err.message));

// ── API Routes ────────────────────────────────────────────────────────────────
app.post("/api/register", (req, res) => {
  const { telegram_id, wallet_address, referral_code } = req.body;
  if (!telegram_id || !wallet_address) return res.status(400).json({ error: "Missing fields" });
  if (!ethers.isAddress(wallet_address)) return res.status(400).json({ error: "Invalid wallet address" });

  const db = loadDB();
  const existing = db.users.find(u => u.telegram_id === telegram_id);
  if (existing) return res.json({ success: true, user: existing, already_registered: true });

  let referredBy = null;
  if (referral_code) {
    const referrer = db.users.find(u => u.referral_code === referral_code);
    if (referrer) referredBy = referral_code;
  }

  const user = {
    id: db.users.length + 1,
    telegram_id,
    wallet_address: wallet_address.toLowerCase(),
    referral_code: generateReferralCode(telegram_id),
    referred_by: referredBy,
    paid: false,
    tx_hash: null,
    tokens_total: 0,
    tokens_unlocked: 0,
    tokens_locked: 0,
    unlock_date: null,
    registered_at: new Date().toISOString(),
  };

  db.users.push(user);
  saveDB(db);
  res.json({ success: true, user, already_registered: false });
});

app.get("/api/user/:telegram_id", (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.telegram_id === req.params.telegram_id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

app.post("/api/verify-payment", async (req, res) => {
  const { telegram_id, tx_hash } = req.body;
  if (!telegram_id || !tx_hash) return res.status(400).json({ error: "Missing fields" });

  const db = loadDB();
  const user = db.users.find(u => u.telegram_id === telegram_id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.paid) return res.json({ success: true, message: "Already paid", user });

  try {
    const tx = await provider.getTransaction(tx_hash);
    if (!tx) return res.status(400).json({ error: "Transaction not found" });
    if (tx.from.toLowerCase() !== user.wallet_address.toLowerCase())
      return res.status(400).json({ error: "Transaction not from registered wallet" });

    const decimals = await tokenContract.decimals();
    const amount = ethers.parseUnits("700", decimals);
    const transferTx = await tokenContract.transfer(user.wallet_address, amount);
    await transferTx.wait();

    const unlockDate = new Date();
    unlockDate.setMonth(unlockDate.getMonth() + 1);
    user.paid = true;
    user.tx_hash = tx_hash;
    user.tokens_total = 1000;
    user.tokens_unlocked = 700;
    user.tokens_locked = 300;
    user.unlock_date = unlockDate.toISOString();
    saveDB(db);

    res.json({ success: true, message: "Payment verified! 700 FOLIUM sent!", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/price", (req, res) => {
  res.json({ usd: 7, bnb: usdToBnb(7), project_wallet: process.env.PROJECT_WALLET });
});

app.get("/api/stats", (req, res) => {
  const db = loadDB();
  const paid = db.users.filter(u => u.paid).length;
  res.json({ total_users: db.users.length, paid_users: paid, total_raised_usd: paid * 7 });
});

app.get("/api/referral/:code", (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.referral_code === req.params.code);
  if (!user) return res.status(404).json({ error: "Not found" });
  const count = db.users.filter(u => u.referred_by === req.params.code && u.paid).length;
  res.json({ referral_code: user.referral_code, total_referrals: count, total_earned_usd: count * 2 });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Folium API running on port ${PORT}`));
bot.start({ onStart: (info) => console.log(`✅ Bot @${info.username} is running!`) });
