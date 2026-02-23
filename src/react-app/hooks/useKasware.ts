import { useState, useEffect, useCallback } from "react";

// KasWare wallet interface (browser extension API)
interface KaswareAPI {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  getNetwork(): Promise<string>;
  getPublicKey(): Promise<string>;
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>;
  signMessage(message: string): Promise<string>;
  sendKaspa(toAddress: string, sompiAmount: number): Promise<string>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  removeListener(event: string, callback: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    kasware?: KaswareAPI;
  }
}

interface UseKaswareReturn {
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
}

export function useKasware(): UseKaswareReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ confirmed: number; unconfirmed: number; total: number } | null>(null);

  // Check if KasWare extension is available
  useEffect(() => {
    const checkKasware = () => {
      setIsAvailable(!!window.kasware);
    };

    // Check immediately
    checkKasware();

    // Also check after a short delay (extension may load async)
    const timeout = setTimeout(checkKasware, 500);

    return () => clearTimeout(timeout);
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (!window.kasware) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accts = accounts as string[];
      if (accts.length === 0) {
        // Disconnected
        setIsConnected(false);
        setAddress(null);
        setPublicKey(null);
        setBalance(null);
      } else {
        setAddress(accts[0]);
        setIsConnected(true);
      }
    };

    window.kasware.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.kasware?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [isAvailable]);

  // Check if already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.kasware) return;
      
      try {
        const accounts = await window.kasware.getAccounts();
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setIsConnected(true);
          
          // Also get public key
          try {
            const pk = await window.kasware.getPublicKey();
            setPublicKey(pk);
          } catch (e) {
            console.error("Failed to get public key:", e);
          }
        }
      } catch (e) {
        // Not connected
        console.log("KasWare not connected:", e);
      }
    };

    if (isAvailable) {
      checkConnection();
    }
  }, [isAvailable]);

  const connect = useCallback(async (): Promise<{ success: boolean; address?: string; error?: string }> => {
    if (!window.kasware) {
      return { success: false, error: "KasWare wallet not installed" };
    }

    setIsConnecting(true);

    try {
      const accounts = await window.kasware.requestAccounts();
      
      if (accounts.length === 0) {
        setIsConnecting(false);
        return { success: false, error: "No accounts available" };
      }

      const addr = accounts[0];
      setAddress(addr);
      setIsConnected(true);

      // Get public key
      try {
        const pk = await window.kasware.getPublicKey();
        setPublicKey(pk);
      } catch (e) {
        console.error("Failed to get public key:", e);
      }

      // Get initial balance
      try {
        const bal = await window.kasware.getBalance();
        setBalance(bal);
      } catch (e) {
        console.error("Failed to get balance:", e);
      }

      setIsConnecting(false);
      return { success: true, address: addr };
    } catch (error) {
      setIsConnecting(false);
      const err = error as Error;
      return { success: false, error: err.message || "Failed to connect" };
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress(null);
    setPublicKey(null);
    setBalance(null);
    // Note: KasWare doesn't have a disconnect method, we just clear local state
    // User can revoke access from extension settings
  }, []);

  const signMessage = useCallback(async (message: string): Promise<{ success: boolean; signature?: string; error?: string }> => {
    if (!window.kasware || !isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const signature = await window.kasware.signMessage(message);
      return { success: true, signature };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message || "Failed to sign message" };
    }
  }, [isConnected]);

  const sendKaspa = useCallback(async (toAddress: string, kasAmount: number): Promise<{ success: boolean; txId?: string; error?: string }> => {
    if (!window.kasware || !isConnected) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      // Convert KAS to sompi (1 KAS = 100,000,000 sompi)
      const sompiAmount = Math.round(kasAmount * 100_000_000);
      const txId = await window.kasware.sendKaspa(toAddress, sompiAmount);
      return { success: true, txId };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message || "Transaction failed" };
    }
  }, [isConnected]);

  const refreshBalance = useCallback(async () => {
    if (!window.kasware || !isConnected) return;

    try {
      const bal = await window.kasware.getBalance();
      setBalance(bal);
    } catch (error) {
      console.error("Failed to refresh balance:", error);
    }
  }, [isConnected]);

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
  };
}
