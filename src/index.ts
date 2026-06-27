import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { Bot } from "grammy";
import apiRoutes from "./routes/api";
import { getUserByTelegramId } from "./db/database";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);

// ── Telegram Bot ──────────────────────────────────────────────────────────────
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

const MINI_APP_URL = process.env.FRONTEND_URL || "http://localhost:3000";

bot.command("start", async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const args = ctx.message?.text?.split(" ") ?? [];
  const referralCode = args[1] || null;

  const user = getUserByTelegramId(telegramId);

  // Build the mini app URL with referral code and telegram ID
  const appUrl = `${MINI_APP_URL}?tid=${telegramId}${referralCode ? `&ref=${referralCode}` : ""}`;

  await ctx.reply(
    `🌿 *Welcome to Folium!*\n\n` +
    `Folium is a community-driven meme coin on BSC.\n\n` +
    `💰 *Public Sale:*\n` +
    `• Price: $7 per registration\n` +
    `• Receive: 1,000 FOLIUM tokens\n` +
    `• 70% unlocked immediately\n` +
    `• 30% locked for 1 month\n\n` +
    `👥 *Referral:* Earn $2 for every friend you refer!\n\n` +
    `Tap the button below to open the Folium app 👇`,
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
  const telegramId = String(ctx.from?.id);
  const user = getUserByTelegramId(telegramId);

  if (!user) {
    return ctx.reply("You haven't registered yet. Use /start to open the Folium app!");
  }

  const unlockDate = user.unlock_date
    ? new Date(user.unlock_date).toLocaleDateString()
    : "N/A";

  await ctx.reply(
    `🌿 *Your Folium Status*\n\n` +
    `Wallet: \`${user.wallet_address}\`\n` +
    `Paid: ${user.paid ? "✅ Yes" : "❌ No"}\n` +
    `Tokens: ${user.tokens_total} FOLIUM\n` +
    `• Unlocked: ${user.tokens_unlocked}\n` +
    `• Locked: ${user.tokens_locked} (until ${unlockDate})\n\n` +
    `🔗 *Your Referral Link:*\n` +
    `https://t.me/${ctx.me.username}?start=${user.referral_code}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("referral", async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const user = getUserByTelegramId(telegramId);

  if (!user) {
    return ctx.reply("Register first! Use /start to open the Folium app.");
  }

  await ctx.reply(
    `👥 *Your Referral Info*\n\n` +
    `Your code: \`${user.referral_code}\`\n` +
    `Your link:\n` +
    `https://t.me/${ctx.me.username}?start=${user.referral_code}\n\n` +
    `Share this link and earn *$2* for every friend who registers!`,
    { parse_mode: "Markdown" }
  );
});

bot.catch((err) => console.error("Bot error:", err.message));

// ── Start server & bot ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Folium API running on port ${PORT}`));
bot.start({ onStart: (info) => console.log(`✅ Bot @${info.username} is running!`) });
