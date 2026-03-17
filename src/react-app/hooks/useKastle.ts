import { useState, useEffect, useCallback, useRef } from "react";
import {
  wasmReady,
  isWalletInstalled,
  connect as kastleConnect,
  disconnect as kastleDisconnect,
  getWalletAddress,
  getPublicKey,
  getBalance as kastleGetBalance,
  sendKaspa as kastleSendKaspa,
  signMessage as kastleSignMessage,
  setEventListener,
  removeEventListener,
} from "@forbole/kastle-sdk";

interface UseKastleReturn {
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  publicKey: string | null;
  balance: { confirmed: number; unconfirmed: number; total: number } | null;
  connect: () => Promise<{ success: boolean; address?: string; error?: string }>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<{ success: boolean; signature?: string; error?: string }>;
  sendKaspa: (toAddress: string, kasAmount: number) => Promise<{ success: boolean; txId?: string; error?: string }>;
  refreshBalance: () => Promise<void>;
  detectedAPI: { methods: string[]; properties: string[]; globalName?: string } | null;
}

export function useKastle(): UseKastleReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ confirmed: number; unconfirmed: number; total: number } | null>(null);
  const [wasmLoaded, setWasmLoaded] = useState(false);
  
  // Use ref to track connection status synchronously (React state is async)
  // This prevents race conditions when signMessage is called immediately after connect
  const isConnectedRef = useRef(false);

  // Initialize WASM and check if Kastle is installed
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      try {
        console.log("[Kastle SDK] Waiting for WASM to be ready...");
        await wasmReady;
        if (!mounted) return;
        console.log("[Kastle SDK] WASM ready");
        setWasmLoaded(true);

        try {
          const installed = await isWalletInstalled();
          if (!mounted) return;
          console.log("[Kastle SDK] Wallet installed:", installed);
          setIsAvailable(installed);
        } catch (installError) {
          // "Kastle provider not found" error occurs when extension isn't installed
          const errMsg = String(installError);
          if (errMsg.includes("provider not found") || errMsg.includes("not installed")) {
            console.log("[Kastle SDK] Wallet not installed (caught gracefully)");
          } else {
            console.error("[Kastle SDK] Install check error:", installError);
          }
          if (mounted) setIsAvailable(false);
        }
      } catch (error) {
        const errMsg = String(error);
        // Handle "provider not found" error gracefully - it just means wallet isn't installed
        if (errMsg.includes("provider not found") || errMsg.includes("not installed")) {
          console.log("[Kastle SDK] Wallet not installed (caught gracefully)");
        } else {
          console.error("[Kastle SDK] Init error:", error);
        }
        if (mounted) {
          setWasmLoaded(true);
          setIsAvailable(false);
        }
      }
    };

    init();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Set up event listeners when connected
  useEffect(() => {
    if (!isConnected || !wasmLoaded) return;

    const handleAccountChange = (data: unknown) => {
      console.log("[Kastle SDK] Account changed:", data);
      const newAddress = data as string | null;
      if (newAddress) {
        setAddress(newAddress);
      } else {
        setIsConnected(false);
        isConnectedRef.current = false;
        setAddress(null);
        setPublicKey(null);
        setBalance(null);
      }
    };

    const handleBalanceChange = (data: unknown) => {
      console.log("[Kastle SDK] Balance changed:", data);
      const newBalance = Number(data);
      setBalance({
        confirmed: newBalance,
        unconfirmed: 0,
        total: newBalance,
      });
    };

    const handleNetworkChange = (data: unknown) => {
      console.log("[Kastle SDK] Network changed:", data);
    };

    try {
      setEventListener("kas:account_changed", handleAccountChange);
      setEventListener("kas:balance_changed", handleBalanceChange);
      setEventListener("kas:network_changed", handleNetworkChange);
    } catch (e) {
      console.log("[Kastle SDK] Event listeners not supported:", e);
    }

    return () => {
      try {
        removeEventListener("kas:account_changed", handleAccountChange);
        removeEventListener("kas:balance_changed", handleBalanceChange);
        removeEventListener("kas:network_changed", handleNetworkChange);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [isConnected, wasmLoaded]);

  const connect = useCallback(async (): Promise<{ success: boolean; address?: string; error?: string }> => {
    if (!wasmLoaded) {
      return { success: false, error: "WASM module not loaded yet. Please wait." };
    }

    try {
      const installed = await isWalletInstalled();
      if (!installed) {
        return { success: false, error: "Kastle wallet not installed. Please install from Chrome Web Store." };
      }
    } catch (checkError) {
      const errMsg = String(checkError);
      if (errMsg.includes("provider not found") || errMsg.includes("not installed")) {
        return { success: false, error: "Kastle wallet not installed. Please install from Chrome Web Store." };
      }
      return { success: false, error: "Failed to check wallet status" };
    }

    setIsConnecting(true);
    console.log("[Kastle SDK] Connecting...");

    try {
      const connected = await kastleConnect();
      console.log("[Kastle SDK] Connect result:", connected);

      if (!connected) {
        setIsConnecting(false);
        return { success: false, error: "Failed to connect to Kastle wallet" };
      }

      // Get wallet address
      const addr = await getWalletAddress();
      console.log("[Kastle SDK] Wallet address:", addr);
      setAddress(addr);
      setIsConnected(true);
      isConnectedRef.current = true; // Sync update for immediate use

      // Get public key
      try {
        const pk = await getPublicKey();
        console.log("[Kastle SDK] Public key:", pk);
        setPublicKey(pk);
      } catch (e) {
        console.log("[Kastle SDK] Failed to get public key:", e);
      }

      // Get balance
      try {
        const bal = await kastleGetBalance();
        console.log("[Kastle SDK] Balance (sompi):", bal);
        const balNum = Number(bal);
        setBalance({
          confirmed: balNum,
          unconfirmed: 0,
          total: balNum,
        });
      } catch (e) {
        console.log("[Kastle SDK] Failed to get balance:", e);
      }

      setIsConnecting(false);
      return { success: true, address: addr };
    } catch (error) {
      setIsConnecting(false);
      const err = error as Error;
      console.error("[Kastle SDK] Connection error:", err);
      return { success: false, error: err.message || "Failed to connect" };
    }
  }, [wasmLoaded]);

  const disconnect = useCallback(async () => {
    setIsConnected(false);
    isConnectedRef.current = false; // Sync update
    setAddress(null);
    setPublicKey(null);
    setBalance(null);

    try {
      await kastleDisconnect();
      console.log("[Kastle SDK] Disconnected");
    } catch (error) {
      console.error("[Kastle SDK] Disconnect error:", error);
    }
  }, []);

  const signMessage = useCallback(async (message: string): Promise<{ success: boolean; signature?: string; error?: string }> => {
    // Use ref for immediate check after connect() - React state may not have updated yet
    if (!isConnectedRef.current) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      console.log("[Kastle SDK] Signing message:", message);
      const signature = await kastleSignMessage(message);
      console.log("[Kastle SDK] Signature:", signature);
      return { success: true, signature };
    } catch (error) {
      const err = error as Error;
      console.error("[Kastle SDK] Sign error:", err);
      return { success: false, error: err.message || "Failed to sign message" };
    }
  }, [isConnected]);

  const sendKaspa = useCallback(async (toAddress: string, kasAmount: number): Promise<{ success: boolean; txId?: string; error?: string }> => {
    // Use ref for immediate check - React state may not have updated yet
    if (!isConnectedRef.current) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const sompiAmount = BigInt(Math.round(kasAmount * 100_000_000));
      console.log(`[Kastle SDK] Sending ${kasAmount} KAS (${sompiAmount} sompi) to ${toAddress}`);
      
      const txId = await kastleSendKaspa(toAddress, sompiAmount);
      console.log("[Kastle SDK] Transaction ID:", txId);
      
      // Refresh balance after sending
      setTimeout(async () => {
        try {
          const bal = await kastleGetBalance();
          const balNum = Number(bal);
          setBalance({
            confirmed: balNum,
            unconfirmed: 0,
            total: balNum,
          });
        } catch {
          // Ignore balance refresh errors
        }
      }, 2000);

      return { success: true, txId };
    } catch (error) {
      const err = error as Error;
      console.error("[Kastle SDK] Send error:", err);
      return { success: false, error: err.message || "Transaction failed" };
    }
  }, [isConnected]);

  const refreshBalance = useCallback(async () => {
    if (!isConnected || !wasmLoaded) return;

    try {
      const bal = await kastleGetBalance();
      const balNum = Number(bal);
      setBalance({
        confirmed: balNum,
        unconfirmed: 0,
        total: balNum,
      });
    } catch (error) {
      console.error("[Kastle SDK] Failed to refresh balance:", error);
    }
  }, [isConnected, wasmLoaded]);

  return {
    isAvailable,
    isConnected,
    isConnecting,
    address,
    publicKey,
    balance,
    connect,
    disconnect,
    signMessage,
    sendKaspa,
    refreshBalance,
    // This is now null since we use the SDK
    detectedAPI: wasmLoaded ? { methods: ["connect", "disconnect", "getWalletAddress", "getPublicKey", "getBalance", "sendKaspa"], properties: [], globalName: "@forbole/kastle-sdk" } : null,
  };
}
