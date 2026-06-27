import fs from "fs";
import path from "path";

const DB_PATH = path.join(__dirname, "../../data/folium.json");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export interface User {
  id: number;
  telegram_id: string;
  wallet_address: string;
  referral_code: string;
  referred_by: string | null;
  paid: boolean;
  tx_hash: string | null;
  tokens_total: number;
  tokens_unlocked: number;
  tokens_locked: number;
  unlock_date: string | null;
  registered_at: string;
}

interface DB {
  users: User[];
}

function loadDB(): DB {
  if (!fs.existsSync(DB_PATH)) return { users: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as DB;
}

function saveDB(db: DB): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function generateReferralCode(telegramId: string): string {
  return `FOL${telegramId.slice(-4)}${Math.random().toString(36).slice(-4).toUpperCase()}`;
}

export function createUser(
  telegramId: string,
  walletAddress: string,
  referredBy: string | null
): User {
  const db = loadDB();
  const existing = db.users.find((u) => u.telegram_id === telegramId);
  if (existing) return existing;

  const user: User = {
    id: db.users.length + 1,
    telegram_id: telegramId,
    wallet_address: walletAddress.toLowerCase(),
    referral_code: generateReferralCode(telegramId),
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
  return user;
}

export function getUserByTelegramId(telegramId: string): User | undefined {
  return loadDB().users.find((u) => u.telegram_id === telegramId);
}

export function getUserByWallet(walletAddress: string): User | undefined {
  return loadDB().users.find((u) => u.wallet_address === walletAddress.toLowerCase());
}

export function getUserByReferralCode(code: string): User | undefined {
  return loadDB().users.find((u) => u.referral_code === code);
}

export function markUserPaid(
  telegramId: string,
  txHash: string
): User | undefined {
  const db = loadDB();
  const user = db.users.find((u) => u.telegram_id === telegramId);
  if (!user) return undefined;

  const unlockDate = new Date();
  unlockDate.setMonth(unlockDate.getMonth() + 1);

  user.paid = true;
  user.tx_hash = txHash;
  user.tokens_total = 1000;
  user.tokens_unlocked = 700;
  user.tokens_locked = 300;
  user.unlock_date = unlockDate.toISOString();

  saveDB(db);
  return user;
}

export function countUsers(): number {
  return loadDB().users.length;
}

export function countPaidUsers(): number {
  return loadDB().users.filter((u) => u.paid).length;
}

export function getReferralCount(referralCode: string): number {
  return loadDB().users.filter((u) => u.referred_by === referralCode && u.paid).length;
}
