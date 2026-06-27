import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
const distributorWallet = new ethers.Wallet(process.env.DISTRIBUTOR_PRIVATE_KEY!, provider);

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const tokenContract = new ethers.Contract(
  process.env.TOKEN_CONTRACT_ADDRESS!,
  ERC20_ABI,
  distributorWallet
);

// BNB price in USD (update this or use a price feed)
const BNB_PRICE_USD = 600;

export function usdToBnb(usd: number): string {
  const bnb = usd / BNB_PRICE_USD;
  return bnb.toFixed(6);
}

export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export async function verifyPayment(
  txHash: string,
  expectedFrom: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const tx = await provider.getTransaction(txHash);
    if (!tx) return { valid: false, reason: "Transaction not found" };

    // Check it's from the right wallet
    if (tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
      return { valid: false, reason: "Transaction not from registered wallet" };
    }

    // Check it's sent to project wallet
    if (tx.to?.toLowerCase() !== process.env.PROJECT_WALLET?.toLowerCase()) {
      return { valid: false, reason: "Transaction not sent to project wallet" };
    }

    // Check amount ($7 worth of BNB)
    const expectedBnb = usdToBnb(7);
    const expectedWei = ethers.parseEther(expectedBnb);
    const tolerance = ethers.parseEther("0.001"); // small tolerance

    if (tx.value < expectedWei - tolerance) {
      return { valid: false, reason: "Insufficient payment amount" };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: err.message };
  }
}

export async function sendTokens(
  toAddress: string,
  amount: number
): Promise<string> {
  const decimals = await tokenContract.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const tx = await tokenContract.transfer(toAddress, amountWei);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function splitPayment(
  referrerWallet: string | null
): Promise<void> {
  // $5 already goes to project wallet directly from user
  // $2 goes to referrer if exists
  if (referrerWallet) {
    const referralBnb = usdToBnb(2);
    const tx = await distributorWallet.sendTransaction({
      to: referrerWallet,
      value: ethers.parseEther(referralBnb),
    });
    await tx.wait();
  }
}
