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
        // Add timeout for WASM loading - forbole's CDN can be unreliable
        const wasmTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('WASM load timeout')), 5000)
        );
        
        await Promise.race([wasmReady, wasmTimeout]);
        if (!mounted) return;
        setWasmLoaded(true);

        try {
          const installed = await isWalletInstalled();
          if (!mounted) return;
          setIsAvailable(installed);
          
          // If wallet is installed, try to get existing connection
          if (installed) {
            try {
              const existingAddress = await getWalletAddress();
              if (existingAddress && mounted) {
                // Wallet was already connected - restore state
                setAddress(existingAddress);
                setIsConnected(true);
                isConnectedRef.current = true;
                
                // Get public key
                try {
                  const pk = await getPublicKey();
                  if (mounted) setPublicKey(pk);
                } catch {
                  // Public key not required
                }
                
                // Get balance
                try {
                  const bal = await kastleGetBalance();
                  const balKas = Number(bal) / 100_000_000;
                  if (mounted) {
                    setBalance({
                      confirmed: balKas,
                      unconfirmed: 0,
                      total: balKas,
                    });
                  }
                } catch {
                  // Balance fetch not critical
                }
              }
            } catch {
              // Not connected - this is fine, user will need to connect manually
            }
          }
        } catch (installError) {
          // "Kastle provider not found" error occurs when extension isn't installed
          // This is expected and not an error
          if (mounted) setIsAvailable(false);
        }
      } catch (error) {
        // WASM failed to load (timeout, 500 error, or MIME type issue)
        // This is expected when forbole's CDN is down - fail silently
        if (mounted) {
          setWasmLoaded(false);
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
      // SDK returns bigint in sompi, convert to KAS
      const newBalanceSompi = Number(data);
      const newBalanceKas = newBalanceSompi / 100_000_000;
      setBalance({
        confirmed: newBalanceKas,
        unconfirmed: 0,
        total: newBalanceKas,
      });
    };

    const handleNetworkChange = () => {
      // Network changed - may need to refresh state
    };

    try {
      setEventListener("kas:account_changed", handleAccountChange);
      setEventListener("kas:balance_changed", handleBalanceChange);
      setEventListener("kas:network_changed", handleNetworkChange);
    } catch {
      // Event listeners not supported
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
      return { success: false, error: "Kastle wallet service unavailable. Try KasWare wallet instead." };
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

    try {
      const connected = await kastleConnect();

      if (!connected) {
        setIsConnecting(false);
        return { success: false, error: "Failed to connect to Kastle wallet" };
      }

      // Get wallet address
      const addr = await getWalletAddress();
      setAddress(addr);
      setIsConnected(true);
      isConnectedRef.current = true; // Sync update for immediate use

      // Get public key
      try {
        const pk = await getPublicKey();
        setPublicKey(pk);
      } catch {
        // Public key not required
      }

      // Get balance
      try {
        const bal = await kastleGetBalance();
        // SDK returns bigint in sompi, convert to KAS
        const balKas = Number(bal) / 100_000_000;
        setBalance({
          confirmed: balKas,
          unconfirmed: 0,
          total: balKas,
        });
      } catch {
        // Balance fetch not critical
      }

      setIsConnecting(false);
      return { success: true, address: addr };
    } catch (error) {
      setIsConnecting(false);
      const err = error as Error;
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
    } catch {
      // Ignore disconnect errors
    }
  }, []);

  const signMessage = useCallback(async (message: string): Promise<{ success: boolean; signature?: string; error?: string }> => {
    // Use ref for immediate check after connect() - React state may not have updated yet
    if (!isConnectedRef.current) {
      return { success: false, error: "Wallet not connected" };
    }

    try {
      const signature = await kastleSignMessage(message);
      return { success: true, signature };
    } catch (error) {
      const err = error as Error;
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
      
      const txId = await kastleSendKaspa(toAddress, sompiAmount);
      
      // Refresh balance after sending
      setTimeout(async () => {
        try {
          const bal = await kastleGetBalance();
          // SDK returns bigint in sompi, convert to KAS
          const balKas = Number(bal) / 100_000_000;
          setBalance({
            confirmed: balKas,
            unconfirmed: 0,
            total: balKas,
          });
        } catch {
          // Ignore balance refresh errors
        }
      }, 2000);

      return { success: true, txId };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: err.message || "Transaction failed" };
    }
  }, [isConnected]);

  const refreshBalance = useCallback(async () => {
    if (!isConnected || !wasmLoaded) return;

    try {
      const bal = await kastleGetBalance();
      // SDK returns bigint in sompi, convert to KAS
      const balKas = Number(bal) / 100_000_000;
      setBalance({
        confirmed: balKas,
        unconfirmed: 0,
        total: balKas,
      });
    } catch {
      // Ignore balance refresh errors
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
    detectedAPI: wasmLoaded ? { methods: ["connect", "disconnect", "getWalletAddress", "getPublicKey", "getBalance", "sendKaspa", "signMessage", "getNetwork", "switchNetwork", "getUtxoEntries", "commitReveal", "signPskt"], properties: [], globalName: "@forbole/kastle-sdk" } : null,
  };
}
