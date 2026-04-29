import { useCallback } from "react";
import { useWallet } from "../contexts/WalletContext";

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  batched?: boolean;
  needsConsolidation?: boolean;
  utxoCount?: number;
  requiresChannel?: boolean;
}

/**
 * Unified payment hook that handles payments through internal wallets only.
 * 
 * For internal wallet users (Google login): Uses micropay (server-side signing)
 * For external wallet users (KasWare/Kastle): Uses their internal wallet via micropay
 * 
 * External wallets are ONLY for login and depositing KAS to internal wallets.
 * All actual payments go through internal wallets for security and KIP-9 compliance.
 */
export function usePayment() {
  const { wallet, externalWallet, micropay } = useWallet();

  // Check if external wallet user has internal wallet set up
  const hasInternalWallet = externalWallet?.internalAddress && externalWallet?.authToken;

  const pay = useCallback(async (
    toAddress: string,
    amountKAS: number,
    options?: {
      videoId?: string;
      paymentType?: string;
      recipientChannelId?: number;
      commentId?: number;
      recipientType?: string;
      silent?: boolean;
    }
  ): Promise<PaymentResult> => {
    const { videoId, paymentType, recipientChannelId, commentId } = options || {};

    console.log("[usePayment] pay() called:", {
      toAddress,
      amountKAS,
      hasWallet: !!wallet,
      hasExternalWallet: !!externalWallet,
      hasInternalWallet,
    });

    // External wallet users use their internal wallet for payments
    if (externalWallet) {
      if (hasInternalWallet) {
        console.log("[usePayment] Using internal wallet micropay for external wallet user");
        const result = await micropay(
          toAddress,
          amountKAS,
          videoId,
          paymentType,
          recipientChannelId,
          commentId
        );
        return result;
      }

      // External wallet without internal wallet set up - cannot make payments
      return { 
        success: false, 
        error: "Please deposit KAS to your internal wallet first" 
      };
    } else if (wallet) {
      // Internal wallet flow: Server-side signing via micropay
      console.log("[usePayment] Using internal wallet micropay");
      const result = await micropay(
        toAddress,
        amountKAS,
        videoId,
        paymentType,
        recipientChannelId,
        commentId
      );
      return result;
    } else {
      console.log("[usePayment] No wallet available - cannot pay");
      return { success: false, error: "No wallet connected" };
    }
  }, [wallet, externalWallet, micropay, hasInternalWallet]);

  // Check if user can make payments (has wallet with internal custody)
  const canPay = !!(wallet || hasInternalWallet);

  return {
    pay,
    canPay,
    // All payments now go through internal wallets
    walletType: canPay ? "internal" : null,
    isExternalWallet: false, // External wallets don't make direct payments anymore
  };
}
