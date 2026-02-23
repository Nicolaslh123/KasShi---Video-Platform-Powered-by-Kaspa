import { useCallback } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useKasware } from "./useKasware";
import { useKastle } from "./useKastle";
import toast from "react-hot-toast";

const MIN_ONCHAIN_KAS = 0.1;

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
 * Unified payment hook that handles both internal (KasShi) and external (KasWare) wallets.
 * 
 * For internal wallets: Uses micropay (server-side signing, auto-batching)
 * For KasWare users with internal custody: Same as internal wallets (frictionless micropay)
 * For KasWare users without internal custody: Direct on-chain payments via KasWare signing
 */
export function usePayment() {
  const { wallet, externalWallet, micropay, externalMicropay } = useWallet();
  const kasware = useKasware();
  const kastle = useKastle();

  // Check if external wallet has internal custody (can use server-side micropay without SDK connection)
  const hasInternalCustody = externalWallet?.internalAddress && externalWallet?.authToken;
  
  // Check if external wallet provider SDK is connected (needed for direct on-chain payments)
  const isExternalProviderConnected = externalWallet && (
    // If user has internal custody, they don't need SDK to be connected for micropayments
    hasInternalCustody ||
    // Otherwise, check the actual SDK connection
    (externalWallet.provider === "kasware" && kasware.isConnected) ||
    (externalWallet.provider === "kastle" && kastle.isConnected) ||
    // Fallback: if provider not set, check either
    (!externalWallet.provider && (kasware.isConnected || kastle.isConnected))
  );

  const pay = useCallback(async (
    toAddress: string,
    amountKAS: number,
    options?: {
      videoId?: string;
      paymentType?: string;
      recipientChannelId?: number;
      commentId?: number;
      recipientType?: string;
      silent?: boolean; // Don't show toasts
    }
  ): Promise<PaymentResult> => {
    const { videoId, paymentType, recipientChannelId, commentId, silent } = options || {};

    console.log("[usePayment] pay() called:", {
      toAddress,
      amountKAS,
      hasWallet: !!wallet,
      hasExternalWallet: !!externalWallet,
      externalWalletProvider: externalWallet?.provider,
      externalWalletInternalAddress: externalWallet?.internalAddress,
      kaswareIsConnected: kasware.isConnected,
      kastleIsConnected: kastle.isConnected,
      isExternalProviderConnected,
    });

    // Check which wallet type is active
    if (externalWallet && isExternalProviderConnected) {
      console.log("[usePayment] Using external wallet path");
      // KasWare user with internal custody wallet: use frictionless micropay
      // This gives the same experience as Google login users
      if (externalWallet.internalAddress) {
        console.log("[usePayment] Using frictionless micropay for external wallet with internal custody");
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

      // Legacy external wallet without internal wallet: direct KasWare payments
      // Only allow payments >= 0.1 KAS (KIP-9 minimum)
      if (amountKAS < MIN_ONCHAIN_KAS) {
        return { 
          success: false, 
          error: "Please deposit KAS to your KasShi wallet for micropayments" 
        };
      }

      // Large payment: send on-chain immediately via external wallet
      const walletName = externalWallet.provider === "kastle" ? "Kastle" : "KasWare";
      if (!silent) {
        toast.loading(`Confirming in ${walletName}...`, { id: "external-pay" });
      }

      try {
        // Step 1: Send via external wallet (client-side signing)
        const sendResult = externalWallet.provider === "kastle" 
          ? await kastle.sendKaspa(toAddress, amountKAS)
          : await kasware.sendKaspa(toAddress, amountKAS);
        
        if (!sendResult.success || !sendResult.txId) {
          if (!silent) {
            toast.dismiss("external-pay");
            toast.error(sendResult.error || "Transaction failed");
          }
          return { success: false, error: sendResult.error || "Transaction failed" };
        }

        // Step 2: Record the payment on our backend
        const recordResult = await externalMicropay(
          sendResult.txId,
          toAddress,
          amountKAS,
          videoId,
          paymentType,
          recipientChannelId
        );

        if (!silent) {
          toast.dismiss("external-pay");
        }

        if (!recordResult.success) {
          // Transaction went through but recording failed - not critical
          console.warn("Payment sent but failed to record:", recordResult.error);
        }

        if (!silent) {
          toast.success("Payment confirmed!");
        }

        return { 
          success: true, 
          transactionId: sendResult.txId 
        };
      } catch (error) {
        if (!silent) {
          toast.dismiss("external-pay");
          toast.error("Payment failed");
        }
        console.error("External payment error:", error);
        return { success: false, error: "Payment failed" };
      }
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
  }, [wallet, externalWallet, kasware, kastle, micropay, externalMicropay, isExternalProviderConnected, hasInternalCustody]);

  // Check if user can make payments
  const canPay = !!(wallet || isExternalProviderConnected);

  // Get the wallet type being used
  // External wallet users with internal custody wallet act like internal wallet users (frictionless)
  const walletType: "internal" | "external" | null = 
    isExternalProviderConnected && !hasInternalCustody ? "external" : 
    wallet ? "internal" : 
    null;

  return {
    pay,
    canPay,
    walletType,
    isExternalWallet: walletType === "external",
  };
}
