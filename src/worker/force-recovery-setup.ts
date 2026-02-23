// Force recovery phrase generation for existing wallets that don't have one
// This is a one-time migration endpoint for accounts created before recovery phrases were mandatory

import type { MochaUser } from "@getmocha/users-service/shared";
import { generateWallet, encryptPrivateKey } from "./services/kaspa-wallet";

export async function forceRecoveryPhraseSetup(
  db: D1Database,
  user: MochaUser
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the user's wallet
    const wallet = await db.prepare(
      "SELECT * FROM user_wallets WHERE user_id = ?"
    ).bind(user.id).first();
    
    if (!wallet) {
      return { success: false, error: "Wallet not found" };
    }
    
    // Check if they already have a recovery phrase
    if (wallet.encrypted_mnemonic) {
      return { success: false, error: "Recovery phrase already exists" };
    }
    
    // Generate a new wallet to get a fresh mnemonic
    // Note: This will create NEW keys, so we need to inform the user
    // that this is a NEW recovery phrase for their EXISTING wallet
    const { mnemonic, wallet: newWallet } = await generateWallet();
    
    // Encrypt the mnemonic with user.id (same as other wallets)
    const encryptedMnemonic = await encryptPrivateKey(mnemonic, user.id);
    
    // Also update the private key to match the new mnemonic
    const encryptedPrivateKey = await encryptPrivateKey(newWallet.privateKey, user.id);
    
    // Update the wallet with the new encrypted mnemonic and private key
    await db.prepare(
      `UPDATE user_wallets 
       SET encrypted_mnemonic = ?, encrypted_private_key = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    ).bind(encryptedMnemonic, encryptedPrivateKey, user.id).run();
    
    return { success: true };
  } catch (error) {
    console.error("Failed to force recovery phrase setup:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to generate recovery phrase" 
    };
  }
}
