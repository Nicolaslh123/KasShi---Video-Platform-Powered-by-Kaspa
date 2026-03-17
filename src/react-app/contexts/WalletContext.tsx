import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@getmocha/users-service/react";
import toast from "react-hot-toast";

interface WalletState {
  address: string;
  publicKey: string;
  balanceKAS: string;
  isLinkedToAccount: boolean; // True if loaded from user account
}

interface ChannelState {
  id: number;
  name: string;
  handle: string;
  walletAddress: string;
  avatarUrl?: string;
  bannerUrl?: string;
  description?: string;
  subscriberCount: number;
  totalKasEarned: string;
  isVerified: boolean;
}

interface PendingBalanceState {
  pendingBalanceKas: number;
  readyForSettlement: boolean;
  pendingDebitsKas: number; // What the user has spent in batched transactions (not yet settled)
}

interface ExternalWalletState {
  address: string;
  publicKey?: string;
  authToken: string;
  userId?: string; // For interaction queries when user has no channel
  provider?: "kasware" | "kastle" | "seed"; // Which wallet provider was used to connect
  // Internal custody wallet (for frictionless micropayments)
  internalAddress?: string;
  internalPublicKey?: string;
  // Original external address (e.g., Kastle/KasWare address derived from seed)
  // Important for channel lookups when channel was created via extension
  externalAddress?: string;
}

interface WalletContextType {
  wallet: WalletState | null;
  channel: ChannelState | null;
  isLoading: boolean;
  balance: string;
  isConnected: boolean;
  hasChannel: boolean;
  mode: "mainnet" | "demo"; // mainnet hides demo content, demo shows everything
  pendingBalance: PendingBalanceState | null;
  externalWallet: ExternalWalletState | null; // For KasWare/external wallet users
  
  // Actions
  loadWalletFromAccount: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  refreshPendingBalance: () => Promise<void>;
  // Frictionless micropayment - no PIN needed when logged in
  micropay: (toAddress: string, amountKAS: number, videoId?: string, paymentType?: string, recipientChannelId?: number, commentId?: number) => Promise<{ success: boolean; transactionId?: string; error?: string; needsConsolidation?: boolean; utxoCount?: number; batched?: boolean; requiresChannel?: boolean }>;
  // Channel management
  createChannel: (name: string, handle: string) => Promise<{ success: boolean; channel?: ChannelState; error?: string }>;
  refreshChannel: () => Promise<void>;
  // External wallet authentication
  connectExternalWallet: (address: string, signature: string, challenge: string, publicKey?: string, provider?: "kasware" | "kastle") => Promise<{ success: boolean; error?: string }>;
  disconnectExternalWallet: () => void;
  // External wallet payments (KasWare sends tx, then we record it)
  externalMicropay: (transactionId: string, toAddress: string, amountKAS: number, videoId?: string, paymentType?: string, recipientChannelId?: number) => Promise<{ success: boolean; error?: string }>;
  // Create channel for external wallet users
  createExternalChannel: (name: string, handle: string, bio?: string) => Promise<{ success: boolean; channel?: ChannelState; error?: string }>;
}

const WalletContext = createContext<WalletContextType | null>(null);

const EXTERNAL_WALLET_KEY = "kasshi_external_wallet";

// Detect if running inside Electron
function isElectron(): boolean {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return true;
  }
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return true;
  }
  return false;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, isPending: authPending } = useAuth();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [channel, setChannel] = useState<ChannelState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [balance, setBalance] = useState("0.00");
  const [mode, setMode] = useState<"mainnet" | "demo">("mainnet");
  const [pendingBalance, setPendingBalance] = useState<PendingBalanceState | null>(null);
  const [externalWallet, setExternalWallet] = useState<ExternalWalletState | null>(null);

  // Load external wallet from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(EXTERNAL_WALLET_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ExternalWalletState;
        
        // For Electron, validate the stored token to ensure persistent login
        if (isElectron() && parsed.authToken) {
          // Validate and refresh the session
          fetch("/api/wallet-auth/refresh", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${parsed.authToken}`,
            },
          })
            .then(res => {
              if (!res.ok) {
                // Token is invalid/expired, clear stored session
                console.log("Electron session expired, clearing stored wallet");
                localStorage.removeItem(EXTERNAL_WALLET_KEY);
                setIsLoading(false);
                return;
              }
              return res.json();
            })
            .then(data => {
              if (!data) return;
              
              // Session is valid, restore wallet state
              setExternalWallet(parsed);
              setWallet({
                address: parsed.internalAddress || parsed.address,
                publicKey: parsed.internalPublicKey || parsed.publicKey || "",
                balanceKAS: "0.00",
                isLinkedToAccount: false,
              });
              fetchExternalWalletData(parsed.externalAddress || parsed.address, parsed.internalAddress);
            })
            .catch(err => {
              console.error("Failed to refresh Electron session:", err);
              // Still try to use stored wallet on network error
              setExternalWallet(parsed);
              setWallet({
                address: parsed.internalAddress || parsed.address,
                publicKey: parsed.internalPublicKey || parsed.publicKey || "",
                balanceKAS: "0.00",
                isLinkedToAccount: false,
              });
              fetchExternalWalletData(parsed.externalAddress || parsed.address, parsed.internalAddress);
            });
        } else {
          // Non-Electron or no token - restore directly
          setExternalWallet(parsed);
          // Set wallet state - use internal wallet as primary for payments
          setWallet({
            address: parsed.internalAddress || parsed.address,
            publicKey: parsed.internalPublicKey || parsed.publicKey || "",
            balanceKAS: "0.00",
            isLinkedToAccount: false,
          });
          // Fetch balance and channel for external wallet
          // Pass externalAddress for channel lookup (channel may have been created via Kastle/KasWare extension)
          fetchExternalWalletData(parsed.externalAddress || parsed.address, parsed.internalAddress);
        }
      } catch (e) {
        console.error("Failed to parse external wallet:", e);
        localStorage.removeItem(EXTERNAL_WALLET_KEY);
      }
    }
  }, []);

  // Fetch data for external wallet users
  const fetchExternalWalletData = async (externalAddress: string, internalAddress?: string) => {
    setIsLoading(true);
    try {
      // Fetch balance from internal custody wallet if available (for micropayments)
      // Fall back to external wallet balance
      const balanceAddress = internalAddress || externalAddress;
      const balRes = await fetch(`/api/kaspa/balance/${balanceAddress}`);
      if (balRes.ok) {
        const balData = await balRes.json();
        const newBalance = balData.balanceKAS || "0.00";
        setBalance(newBalance);
        setWallet(prev => prev ? { ...prev, balanceKAS: newBalance } : null);
      }
      
      // Fetch channel if exists (check both external and internal addresses)
      await fetchChannel(externalAddress);
      if (internalAddress && internalAddress !== externalAddress) {
        await fetchChannel(internalAddress);
      }
    } catch (e) {
      console.error("Failed to fetch external wallet data:", e);
    }
    setIsLoading(false);
  };

  // Fetch channel by wallet address
  const fetchChannel = async (walletAddress: string) => {
    try {
      const res = await fetch(`/api/kasshi/channels/wallet/${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setChannel({
            id: data.id,
            name: data.name,
            handle: data.handle,
            walletAddress: data.wallet_address,
            avatarUrl: data.avatar_url,
            bannerUrl: data.banner_url,
            description: data.description,
            subscriberCount: data.subscriber_count || 0,
            totalKasEarned: data.total_kas_earned || "0",
            isVerified: !!data.is_verified,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch channel:", error);
    }
  };

  // Load wallet when user logs in, clear when user logs out
  useEffect(() => {
    if (authPending) return; // Wait for auth to finish loading
    
    if (user) {
      loadWalletFromAccount();
    } else {
      // User logged out - but don't clear if we have an external wallet (KasWare)
      // Check localStorage directly since externalWallet state may not be set yet
      const storedExternalWallet = localStorage.getItem(EXTERNAL_WALLET_KEY);
      if (!storedExternalWallet) {
        // No external wallet, clear wallet state
        setWallet(null);
        setChannel(null);
        setBalance("0.00");
        setIsLoading(false);
      }
    }
  }, [user, authPending]);

  const loadWalletFromAccount = async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/wallet", { credentials: "include" });
      
      if (!res.ok) {
        // User not logged in or no wallet
        setWallet(null);
        setIsLoading(false);
        return { success: false, error: "Not logged in" };
      }
      
      const data = await res.json();
      
      const walletState: WalletState = {
        address: data.wallet_address,
        publicKey: data.public_key,
        balanceKAS: data.balanceKAS || "0.00",
        isLinkedToAccount: true,
      };
      
      setWallet(walletState);
      setBalance(data.balanceKAS || "0.00");
      
      // Fetch wallet mode (mainnet vs demo)
      try {
        const modeRes = await fetch("/api/wallet/mode", { credentials: "include" });
        if (modeRes.ok) {
          const modeData = await modeRes.json();
          setMode(modeData.mode as "mainnet" | "demo");
        }
      } catch (e) {
        console.error("Failed to fetch wallet mode:", e);
      }
      
      // Also fetch the user's channel if they have one
      await fetchChannel(data.wallet_address);
      
      setIsLoading(false);
      
      // Check pending balance and process renewals after a short delay (need channel to be set)
      setTimeout(async () => {
        try {
          const pendingRes = await fetch("/api/kasshi/pending-balance", { credentials: "include" });
          if (pendingRes.ok) {
            const pendingData = await pendingRes.json();
            setPendingBalance({
              pendingBalanceKas: pendingData.pendingBalanceKas || 0,
              readyForSettlement: pendingData.readyForSettlement || false,
              pendingDebitsKas: pendingData.pendingDebitsKas || 0,
            });
            
            // Show toast if ready for settlement on login
            if (pendingData.readyForSettlement && pendingData.pendingBalanceKas > 0) {
              toast(
                `You have ${pendingData.pendingBalanceKas.toFixed(4)} KAS in pending earnings ready to settle! Go to Settings to claim.`,
                { duration: 8000, icon: "💰" }
              );
            }
          }
        } catch (e) {
          console.error("Failed to check pending balance:", e);
        }
        

      }, 500);
      
      return { success: true };
    } catch (error) {
      console.error("Failed to load wallet:", error);
      setIsLoading(false);
      return { success: false, error: "Failed to load wallet" };
    }
  };

  // Refresh balance - supports both internal wallets and external wallets with internal custody
  const refreshBalance = useCallback(async () => {
    // For internal wallet users, use wallet.address
    // For external wallet users (KasWare/Kastle), use their internal custody address
    const balanceAddress = wallet?.address || externalWallet?.internalAddress;
    
    if (!balanceAddress) {
      setBalance("0.00");
      return;
    }
    
    try {
      const res = await fetch(`/api/kaspa/balance/${balanceAddress}`);
      const data = await res.json();
      const newBalance = data.balanceKAS || "0.00";
      setBalance(newBalance);
      if (wallet) {
        setWallet(prev => prev ? { ...prev, balanceKAS: newBalance } : null);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }, [wallet?.address, externalWallet?.internalAddress]);

  // Refresh pending balance for micropayment batching
  const refreshPendingBalance = useCallback(async () => {
    // Allow fetching pending debits even without a channel (KasWare users without channels)
    if (!wallet?.address && !externalWallet?.authToken) {
      setPendingBalance(null);
      return;
    }
    
    try {
      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch("/api/kasshi/pending-balance", {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setPendingBalance({
          pendingBalanceKas: data.pendingBalanceKas || 0,
          readyForSettlement: data.readyForSettlement || false,
          pendingDebitsKas: data.pendingDebitsKas || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch pending balance:", error);
    }
  }, [wallet?.address, externalWallet?.authToken]);

  // Auto-refresh balance every 30 seconds (for both internal and external wallet users)
  useEffect(() => {
    const hasBalanceAddress = wallet?.address || externalWallet?.internalAddress;
    if (hasBalanceAddress) {
      const interval = setInterval(refreshBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [wallet?.address, externalWallet?.internalAddress, refreshBalance]);

  const disconnect = () => {
    setWallet(null);
    setChannel(null);
    setBalance("0.00");
  };

  // Create a channel for the connected wallet
  const createChannel = async (
    name: string,
    handle: string
  ): Promise<{ success: boolean; channel?: ChannelState; error?: string }> => {
    if (!wallet) {
      return { success: false, error: "No wallet connected" };
    }

    try {
      const res = await fetch("/api/kasshi/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          walletAddress: wallet.address,
          name,
          handle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "Failed to create channel" };
      }

      const newChannel: ChannelState = {
        id: data.id,
        name: data.name,
        handle: data.handle,
        walletAddress: data.wallet_address,
        avatarUrl: data.avatar_url,
        bannerUrl: data.banner_url,
        description: data.description,
        subscriberCount: data.subscriber_count || 0,
        totalKasEarned: data.total_kas_earned || "0",
        isVerified: !!data.is_verified,
      };

      setChannel(newChannel);
      return { success: true, channel: newChannel };
    } catch (error) {
      console.error("Failed to create channel:", error);
      return { success: false, error: "Failed to create channel" };
    }
  };

  // Refresh channel data
  const refreshChannel = async () => {
    if (wallet?.address) {
      await fetchChannel(wallet.address);
    }
  };

  // Connect external wallet (KasWare, Kastle, etc.) via signature verification
  const connectExternalWallet = async (
    address: string,
    signature: string,
    challenge: string,
    publicKey?: string,
    provider?: "kasware" | "kastle"
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Check for stored referral code
      let referralCode: string | undefined;
      try {
        const storedRef = localStorage.getItem('kasshi_referral');
        if (storedRef) {
          const refData = JSON.parse(storedRef);
          if (refData.expires > Date.now()) {
            referralCode = refData.code;
          } else {
            localStorage.removeItem('kasshi_referral');
          }
        }
      } catch {
        // Ignore parsing errors
      }
      
      const res = await fetch("/api/wallet-auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, challenge, publicKey, referralCode }),
      });

      if (!res.ok) {
        try {
          const data = await res.json();
          const errorMsg = data.details ? `${data.error}: ${data.details}` : (data.error || "Authentication failed");
          console.error("Wallet verify error:", data);
          return { success: false, error: errorMsg };
        } catch {
          return { success: false, error: `Authentication failed (${res.status})` };
        }
      }

      const data = await res.json();
      
      const extWallet: ExternalWalletState = {
        address,
        publicKey,
        authToken: data.token,
        userId: data.userId, // For interaction queries when user has no channel
        provider, // Track which wallet provider was used
        // Store internal custody wallet for frictionless micropayments
        internalAddress: data.internalWalletAddress,
        internalPublicKey: data.internalPublicKey,
        // Store external address for channel lookup persistence
        externalAddress: address,
      };
      
      // Store in localStorage
      localStorage.setItem(EXTERNAL_WALLET_KEY, JSON.stringify(extWallet));
      setExternalWallet(extWallet);
      
      // Clear used referral code
      localStorage.removeItem('kasshi_referral');
      
      // Set wallet state - use internal wallet as primary for payments
      setWallet({
        address: data.internalWalletAddress || address,
        publicKey: data.internalPublicKey || publicKey || "",
        balanceKAS: "0.00",
        isLinkedToAccount: false,
      });
      
      // Fetch balance and channel - pass internal address for balance fetching
      await fetchExternalWalletData(address, data.internalWalletAddress);
      
      return { success: true };
    } catch (error) {
      console.error("External wallet auth error:", error);
      return { success: false, error: "Authentication failed" };
    }
  };

  // Disconnect external wallet
  const disconnectExternalWallet = () => {
    localStorage.removeItem(EXTERNAL_WALLET_KEY);
    setExternalWallet(null);
    setWallet(null);
    setChannel(null);
    setBalance("0.00");
  };

  // Frictionless micropayment - uses server-side decryption with user.id
  // For external wallet users with internal custody wallet, uses internal-micropay endpoint
  const micropay = async (
    toAddress: string,
    amountKAS: number,
    videoId?: string,
    paymentType?: string,
    recipientChannelId?: number,
    commentId?: number
  ): Promise<{ success: boolean; transactionId?: string; error?: string; needsConsolidation?: boolean; requiresChannel?: boolean; utxoCount?: number; batched?: boolean }> => {
    // Check if this is an external wallet user with internal custody wallet
    const isExternalWithInternal = externalWallet?.internalAddress && externalWallet?.authToken;
    
    // Need either internal wallet OR external wallet with internal custody
    if (!wallet && !isExternalWithInternal) {
      return { success: false, error: "No wallet connected" };
    }
    
    try {
      // Use internal-micropay endpoint for KasWare users with internal wallet
      const endpoint = isExternalWithInternal ? "/api/kasshi/internal-micropay" : "/api/kasshi/micropay";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      
      // Add Bearer token for external wallet users (always send if available)
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        credentials: "include", // Required for Google login session cookies
        body: JSON.stringify({
          toAddress,
          amountKas: amountKAS.toString(),
          videoId,
          paymentType,
          recipientChannelId,
          commentId,
        }),
      });
      
      let data;
      try {
        data = await res.json();
      } catch {
        return { success: false, error: "Server error. Please try again." };
      }
      
      if (!res.ok) {
        // Log full debug info for troubleshooting
        if (data.debug) {
          console.error('[MICROPAY DEBUG]', JSON.stringify(data.debug, null, 2));
        }
        
        // If wallet needs recreation, reload the page to trigger new wallet setup
        if (data.walletReset) {
          window.location.reload();
          return { success: false, error: "Wallet being recreated. Please wait..." };
        }
        // Handle UTXO consolidation needed
        if (data.needsConsolidation) {
          // Include debug info in the error for troubleshooting
          const debugInfo = data.debug ? ` [Debug: ${data.debug.txType}, UTXOs: ${data.debug.senderUtxoCount}, Raw: ${data.debug.rawError?.substring(0, 100)}]` : '';
          return { 
            success: false, 
            error: (data.error || "Wallet needs consolidation") + debugInfo, 
            needsConsolidation: true, 
            utxoCount: data.utxoCount 
          };
        }
        // Handle channel required for micropayments
        if (data.requiresChannel) {
          return { 
            success: false, 
            error: "Create a channel to enable interactions like likes and comments.",
            requiresChannel: true 
          };
        }
        return { success: false, error: data.error || "Payment failed" };
      }
      
      // Immediately update pending debits if returned (for batched payments)
      if (data.pendingDebitsKas !== undefined) {
        setPendingBalance(prev => ({
          pendingBalanceKas: prev?.pendingBalanceKas || 0,
          readyForSettlement: prev?.readyForSettlement || false,
          pendingDebitsKas: data.pendingDebitsKas || 0
        }));
      }
      
      // Refresh balance and pending balance after transaction
      setTimeout(() => {
        refreshBalance();
        refreshPendingBalance();
      }, 2000);
      
      // Show notification if auto-settlement was triggered
      if (data.autoSettled) {
        toast.success(`Settlement triggered! ${data.settlementItemCount} pending payments settled (${data.settlementTotalKas?.toFixed(4)} KAS)`, {
          duration: 5000,
        });
      }
      
      return { success: true, transactionId: data.transactionId, batched: data.batched };
    } catch (error) {
      console.error("Micropay error:", error);
      return { success: false, error: "Payment failed" };
    }
  };

  // External wallet micropayment - records a payment made via KasWare
  const externalMicropay = async (
    transactionId: string,
    toAddress: string,
    amountKAS: number,
    videoId?: string,
    paymentType?: string,
    recipientChannelId?: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (!externalWallet) {
      return { success: false, error: "No external wallet connected" };
    }

    try {
      const res = await fetch("/api/kasshi/external-pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${externalWallet.authToken}`,
        },
        body: JSON.stringify({
          transactionId,
          toAddress,
          amountKas: amountKAS.toString(),
          videoId,
          paymentType,
          recipientChannelId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to record payment" };
      }

      // Refresh balance after transaction
      setTimeout(() => refreshBalance(), 2000);
      return { success: true };
    } catch (error) {
      console.error("External micropay error:", error);
      return { success: false, error: "Failed to record payment" };
    }
  };

  // Create channel for external wallet users
  const createExternalChannel = async (
    name: string,
    handle: string,
    bio?: string
  ): Promise<{ success: boolean; channel?: ChannelState; error?: string }> => {
    if (!externalWallet) {
      return { success: false, error: "No external wallet connected" };
    }

    try {
      const res = await fetch("/api/kasshi/external-channel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${externalWallet.authToken}`,
        },
        body: JSON.stringify({ name, handle, bio }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Failed to create channel" };
      }

      const newChannel: ChannelState = {
        id: data.channel.id,
        name: data.channel.name,
        handle: data.channel.handle,
        walletAddress: data.channel.wallet_address,
        avatarUrl: data.channel.avatar_url,
        bannerUrl: data.channel.banner_url,
        description: data.channel.bio,
        subscriberCount: 0,
        totalKasEarned: "0",
        isVerified: false,
      };

      setChannel(newChannel);
      return { success: true, channel: newChannel };
    } catch (error) {
      console.error("Create external channel error:", error);
      return { success: false, error: "Failed to create channel" };
    }
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        channel,
        isLoading,
        balance,
        isConnected: !!wallet || !!externalWallet,
        hasChannel: !!channel,
        mode,
        pendingBalance,
        loadWalletFromAccount,
        disconnect,
        refreshBalance,
        refreshPendingBalance,
        micropay,
        createChannel,
        refreshChannel,
        externalWallet,
        connectExternalWallet,
        disconnectExternalWallet,
        externalMicropay,
        createExternalChannel,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
