import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Wallet, Copy, LogIn, LogOut, RefreshCw, QrCode, ChevronDown, ChevronUp, ExternalLink, Globe, Link2, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Loader2, Key } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import { useKasware } from "../hooks/useKasware";
import { useKastle } from "../hooks/useKastle";
import toast from "react-hot-toast";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { wallet, isConnected, balance, pendingBalance, isLoading: walletLoading, loadWalletFromAccount, refreshBalance, refreshPendingBalance, connectExternalWallet, disconnectExternalWallet, externalWallet } = useWallet();
  const { user, redirectToLogin } = useAuth();
  const kasware = useKasware();
  const kastle = useKastle();
  const [copied, setCopied] = useState(false);
  void copied; // Used in copy feedback
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  // Deposit/Withdraw states
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [internalBalance, setInternalBalance] = useState("0");
  const [externalBalance, setExternalBalance] = useState("0");
  // Seed phrase import states
  const [showSeedImport, setShowSeedImport] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Fetch both balances for KasWare users
  useEffect(() => {
    if (externalWallet?.authToken) {
      fetchBothBalances();
    }
  }, [externalWallet?.authToken]);

  const fetchBothBalances = async () => {
    if (!externalWallet?.authToken) return;
    try {
      const res = await fetch("/api/wallet-auth/me", {
        headers: { Authorization: `Bearer ${externalWallet.authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInternalBalance(data.internalBalanceKAS || "0");
        setExternalBalance(data.externalBalanceKAS || "0");
      }
    } catch (e) {
      console.error("Failed to fetch balances:", e);
    }
  };

  // Handle deposit from KasWare to internal wallet
  const handleDeposit = async () => {
    if (!externalWallet?.internalAddress || !depositAmount) return;
    
    const amount = parseFloat(depositAmount);
    if (amount < 0.1) {
      toast.error("Minimum deposit is 0.1 KAS");
      return;
    }
    if (amount > parseFloat(externalBalance)) {
      toast.error("Insufficient balance");
      return;
    }
    
    setIsProcessing(true);
    try {
      // Use the appropriate wallet provider to send to internal address
      let result: { success: boolean; txId?: string; error?: string };
      
      if (externalWallet.provider === "kastle") {
        result = await kastle.sendKaspa(externalWallet.internalAddress, amount);
      } else {
        // Default to KasWare
        result = await kasware.sendKaspa(externalWallet.internalAddress, amount);
      }
      
      if (result.success) {
        toast.success(`Deposited ${amount} KAS to your KasShi wallet!`);
        setDepositAmount("");
        setShowDeposit(false);
        // Refresh balances after a delay for blockchain confirmation
        setTimeout(() => {
          fetchBothBalances();
          refreshBalance();
        }, 3000);
      } else {
        toast.error(result.error || "Deposit failed");
      }
    } catch (error) {
      console.error("Deposit error:", error);
      toast.error("Failed to process deposit");
    }
    setIsProcessing(false);
  };

  // Handle withdraw from internal wallet to KasWare
  const handleWithdraw = async () => {
    if (!externalWallet?.authToken || !withdrawAmount) return;
    
    const amount = parseFloat(withdrawAmount);
    if (amount < 0.1) {
      toast.error("Minimum withdrawal is 0.1 KAS");
      return;
    }
    if (amount > parseFloat(internalBalance)) {
      toast.error("Insufficient KasShi balance");
      return;
    }
    
    setIsProcessing(true);
    try {
      const res = await fetch("/api/kasshi/internal-withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${externalWallet.authToken}`
        },
        body: JSON.stringify({ amountKas: amount.toString() })
      });
      
      const data = await res.json();
      if (data.success) {
        const walletName = externalWallet?.provider === "kastle" ? "Kastle" : "KasWare";
        toast.success(`Withdrew ${amount} KAS to your ${walletName} wallet!`);
        setWithdrawAmount("");
        setShowWithdraw(false);
        // Refresh balances
        setTimeout(() => {
          fetchBothBalances();
          refreshBalance();
        }, 3000);
      } else {
        toast.error(data.error || "Withdrawal failed");
      }
    } catch (error) {
      console.error("Withdraw error:", error);
      toast.error("Failed to process withdrawal");
    }
    setIsProcessing(false);
  };

  // Try to load wallet when user becomes available
  useEffect(() => {
    if (user && !wallet && !walletLoading) {
      loadWalletFromAccount();
    }
  }, [user, wallet, walletLoading]);

  // Handle KasWare connection with server authentication
  const handleKaswareConnect = async () => {
    setIsAuthenticating(true);
    try {
      // Connect to KasWare
      const connectResult = await kasware.connect();
      if (!connectResult.success || !connectResult.address) {
        toast.error(connectResult.error || "Failed to connect to KasWare");
        setIsAuthenticating(false);
        return;
      }

      // Get a challenge message from the server
      const challengeRes = await fetch("/api/wallet-auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: connectResult.address }),
      });
      
      if (!challengeRes.ok) {
        toast.error("Failed to get authentication challenge");
        setIsAuthenticating(false);
        return;
      }
      
      const { challenge } = await challengeRes.json();

      // Sign the challenge message
      const signResult = await kasware.signMessage(challenge);
      if (!signResult.success || !signResult.signature) {
        toast.error(signResult.error || "Failed to sign message");
        setIsAuthenticating(false);
        return;
      }

      // Verify signature and authenticate
      const authResult = await connectExternalWallet(
        connectResult.address,
        signResult.signature,
        challenge,
        kasware.publicKey || undefined,
        "kasware"
      );

      if (!authResult.success) {
        toast.error(authResult.error || "Authentication failed");
      } else {
        toast.success("Wallet connected successfully!");
        onClose();
      }
    } catch (error) {
      console.error("KasWare auth error:", error);
      toast.error("Failed to connect wallet");
    }
    setIsAuthenticating(false);
  };

  // Handle Kastle connection with server authentication (same flow as KasWare)
  const handleKastleConnect = async () => {
    setIsAuthenticating(true);
    try {
      // Connect to Kastle
      const connectResult = await kastle.connect();
      if (!connectResult.success || !connectResult.address) {
        toast.error(connectResult.error || "Failed to connect to Kastle");
        setIsAuthenticating(false);
        return;
      }

      // Get a challenge message from the server
      const challengeRes = await fetch("/api/wallet-auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: connectResult.address }),
      });
      
      if (!challengeRes.ok) {
        toast.error("Failed to get authentication challenge");
        setIsAuthenticating(false);
        return;
      }
      
      const { challenge } = await challengeRes.json();

      // Sign the challenge message
      const signResult = await kastle.signMessage(challenge);
      if (!signResult.success || !signResult.signature) {
        // If signMessage fails (it's "under development" in Kastle SDK),
        // show a helpful message
        if (signResult.error?.includes("under development")) {
          toast.error("Kastle doesn't support message signing yet. Please use KasWare instead.", { duration: 5000 });
        } else {
          toast.error(signResult.error || "Failed to sign message");
        }
        setIsAuthenticating(false);
        return;
      }

      // Verify signature and authenticate
      const authResult = await connectExternalWallet(
        connectResult.address,
        signResult.signature,
        challenge,
        kastle.publicKey || undefined,
        "kastle"
      );

      if (!authResult.success) {
        toast.error(authResult.error || "Authentication failed");
      } else {
        toast.success("Kastle wallet connected successfully!");
        onClose();
      }
    } catch (error) {
      console.error("Kastle auth error:", error);
      toast.error("Failed to connect wallet");
    }
    setIsAuthenticating(false);
  };

  // Handle seed phrase import (for mobile users or existing Kastle/KasWare wallets)
  const handleSeedImport = async () => {
    if (!seedPhrase.trim()) {
      toast.error("Please enter your seed phrase");
      return;
    }
    
    setIsImporting(true);
    try {
      const res = await fetch("/api/wallet-auth/import-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedPhrase: seedPhrase.trim() }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        toast.error(data.error || "Failed to import wallet");
        setIsImporting(false);
        return;
      }
      
      // Store external wallet state (same as KasWare/Kastle connection)
      // IMPORTANT: Store both the external address (from seed) and internal address (custody wallet)
      // Channel may have been created with either, so we need both for lookups
      const extWallet = {
        address: data.internalWalletAddress || data.address,
        authToken: data.token,
        userId: data.userId,
        provider: "seed" as const,
        internalAddress: data.internalWalletAddress,
        externalAddress: data.address, // The actual Kastle/KasWare address derived from seed
      };
      localStorage.setItem("kasshi_external_wallet", JSON.stringify(extWallet));
      
      toast.success("Wallet imported successfully!");
      setSeedPhrase("");
      setShowSeedImport(false);
      // Reload to apply the new wallet state
      window.location.reload();
    } catch (error) {
      console.error("Seed import error:", error);
      toast.error("Failed to import wallet");
    }
    setIsImporting(false);
  };

  const handleSignIn = async () => {
    try {
      await redirectToLogin();
    } catch (error) {
      toast.error("Failed to start sign in");
    }
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    await refreshBalance();
    setIsRefreshing(false);
    toast.success("Balance updated");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 12)}...${addr.slice(-8)}`;
  };

  if (!isOpen) return null;

  const isLoggedIn = !!user;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#1a1a2e] border border-[#70c7ba]/30 rounded-2xl w-full max-w-md shadow-2xl shadow-[#70c7ba]/10 my-auto max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#70c7ba]/20">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#70c7ba]" />
            <span className="font-semibold text-white">
              {isConnected ? "Your Wallet" : "Connect Wallet"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#70c7ba]/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Not Logged In - Show Sign In Options */}
          {!isLoggedIn && !externalWallet && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm text-center mb-4">
                Connect to start watching, earning, and supporting creators with KAS
              </p>
              
              {/* Google Sign In Option */}
              <div className="space-y-3">
                <button
                  onClick={handleSignIn}
                  className="w-full p-4 bg-gradient-to-r from-[#70c7ba] to-[#49eacf] rounded-xl text-black font-semibold flex items-center justify-center gap-3 hover:opacity-90 transition-opacity"
                >
                  <LogIn className="w-5 h-5" />
                  Sign in with Google
                </button>
                
                <div className="bg-[#2a2a4a]/50 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-[#70c7ba]">✓</span>
                    <span>Wallet auto-created • Instant micropayments</span>
                  </div>
                  <p className="text-xs text-gray-500 pl-5">Best for newcomers to crypto</p>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-xs text-gray-500 uppercase">or</span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>

              {/* KasWare Wallet Option */}
              <div className="space-y-3">
                {kasware.isAvailable ? (
                  <button
                    onClick={handleKaswareConnect}
                    disabled={isAuthenticating}
                    className="w-full p-4 bg-[#2a2a4a] border border-[#70c7ba]/30 rounded-xl text-white font-semibold flex items-center justify-center gap-3 hover:bg-[#3a3a5a] hover:border-[#70c7ba]/50 transition-all disabled:opacity-50"
                  >
                    {isAuthenticating ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Link2 className="w-5 h-5 text-[#70c7ba]" />
                        Connect KasWare Wallet
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    href="https://kasware.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-4 bg-[#2a2a4a]/50 border border-gray-700 rounded-xl text-gray-400 font-semibold flex items-center justify-center gap-3 hover:bg-[#2a2a4a] hover:text-gray-300 transition-all"
                  >
                    <Link2 className="w-5 h-5" />
                    Install KasWare Wallet
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                
                {/* Kastle Wallet Option */}
                {kastle.isAvailable ? (
                  <button
                    onClick={handleKastleConnect}
                    disabled={isAuthenticating || kastle.isConnecting}
                    className="w-full p-4 bg-[#2a2a4a] border border-[#70c7ba]/30 rounded-xl text-white font-semibold flex items-center justify-center gap-3 hover:bg-[#3a3a5a] hover:border-[#70c7ba]/50 transition-all disabled:opacity-50"
                  >
                    {kastle.isConnecting || isAuthenticating ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Link2 className="w-5 h-5 text-[#49eacb]" />
                        Connect Kastle Wallet
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    href="https://chromewebstore.google.com/detail/kastle/oambclflhjfppdmkghokjmpppmaebego"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-4 bg-[#2a2a4a]/50 border border-gray-700 rounded-xl text-gray-400 font-semibold flex items-center justify-center gap-3 hover:bg-[#2a2a4a] hover:text-gray-300 transition-all"
                  >
                    <Link2 className="w-5 h-5" />
                    Install Kastle Wallet
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                
                <div className="bg-[#2a2a4a]/50 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-[#70c7ba]">✓</span>
                    <span>Use your own wallet • Full control</span>
                  </div>
                  <p className="text-xs text-gray-500 pl-5">Best for crypto-native users</p>
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#1a1a2e] px-3 text-gray-500">or</span>
                </div>
              </div>

              {/* Seed Phrase Import */}
              <div className="space-y-3">
                {!showSeedImport ? (
                  <button
                    onClick={() => setShowSeedImport(true)}
                    className="w-full p-3 bg-[#2a2a4a]/50 border border-gray-700 rounded-xl text-gray-400 font-medium flex items-center justify-center gap-2 hover:bg-[#2a2a4a] hover:text-gray-300 hover:border-[#70c7ba]/30 transition-all text-sm"
                  >
                    <Key className="w-4 h-4" />
                    Import with Seed Phrase
                  </button>
                ) : (
                  <div className="p-4 bg-[#2a2a4a] border border-[#70c7ba]/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Import Wallet</span>
                      <button
                        onClick={() => { setShowSeedImport(false); setSeedPhrase(""); }}
                        className="text-gray-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
                      Enter your 12 or 24-word seed phrase from Kastle, KasWare, or any Kaspa wallet.
                    </p>
                    <textarea
                      value={seedPhrase}
                      onChange={(e) => setSeedPhrase(e.target.value)}
                      placeholder="Enter your seed phrase..."
                      className="w-full h-20 px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#70c7ba]/50 resize-none"
                    />
                    <button
                      onClick={handleSeedImport}
                      disabled={isImporting || !seedPhrase.trim()}
                      className="w-full p-3 bg-gradient-to-r from-[#70c7ba] to-[#49eacb] rounded-lg text-black font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isImporting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          Import Wallet
                        </>
                      )}
                    </button>
                    <div className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <AlertCircle className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-400/80">
                        Never share your seed phrase. KasShi derives your wallet locally and never stores your phrase.
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500 text-center">
                  Perfect for mobile wallet users (Kastle, KasWare Mobile)
                </p>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 p-3 bg-[#70c7ba]/5 border border-[#70c7ba]/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-[#70c7ba] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">
                  All options let you earn and spend KAS on KasShi with frictionless micropayments.
                </p>
              </div>
            </div>
          )}

          {/* Loading wallet */}
          {isLoggedIn && walletLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <RefreshCw className="w-8 h-8 text-[#70c7ba] animate-spin" />
              <p className="text-gray-400 text-sm">Loading your wallet...</p>
            </div>
          )}

          {/* Connected View */}
          {isLoggedIn && !walletLoading && isConnected && wallet && (
            <div className="space-y-4">
              {/* Network Status Badge */}
              <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#70c7ba]/10 border border-[#70c7ba]/30 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#70c7ba] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#70c7ba]"></span>
                  </span>
                  <span className="text-xs font-medium text-[#70c7ba]">Kaspa Mainnet</span>
                  <Globe className="w-3 h-3 text-[#70c7ba]" />
                </div>
              </div>
              
              <div className="bg-[#2a2a4a] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Address</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyToClipboard(wallet.address)}
                      className="flex items-center gap-2 text-[#70c7ba] hover:text-[#49eacf] transition-colors"
                    >
                      <span className="text-sm font-mono">{formatAddress(wallet.address)}</span>
                      <Copy className="w-4 h-4" />
                    </button>
                    <a
                      href={`https://explorer.kaspa.org/addresses/${wallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-[#70c7ba]/20 rounded-lg transition-colors"
                      title="View on Kaspa Explorer"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-400 hover:text-[#70c7ba]" />
                    </a>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Balance</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{(parseFloat(balance) - (pendingBalance?.pendingDebitsKas || 0)).toFixed(4)} KAS</span>
                    <button
                      onClick={handleRefreshBalance}
                      disabled={isRefreshing}
                      className="p-1 hover:bg-[#70c7ba]/20 rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 text-[#70c7ba] ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* QR Code Section */}
              <div className="bg-[#2a2a4a] border border-[#70c7ba]/30 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="w-full p-4 flex items-center justify-between hover:bg-[#3a3a5a] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-[#70c7ba]" />
                    <span className="text-white font-semibold">Deposit via QR Code</span>
                  </div>
                  {showQR ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                
                {showQR && (
                  <div className="p-4 pt-0 flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-xl">
                      <QRCodeSVG
                        value={wallet.address}
                        size={180}
                        level="H"
                        includeMargin={false}
                        fgColor="#1a1a2e"
                        bgColor="#ffffff"
                      />
                    </div>
                    <p className="text-xs text-gray-400 text-center max-w-[200px]">
                      Scan with your Kaspa wallet app to send KAS to this address
                    </p>
                  </div>
                )}
              </div>
              
              {/* Mainnet Info */}
              <div className="bg-[#2a2a4a]/50 rounded-xl p-3">
                <p className="text-xs text-gray-400 text-center">
                  This is a real Kaspa mainnet wallet. All transactions use real KAS and are recorded on the blockchain.{" "}
                  <a 
                    href="https://kaspa.org" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#70c7ba] hover:underline"
                  >
                    Learn more about Kaspa →
                  </a>
                </p>
              </div>

            </div>
          )}

          {/* External Wallet Connected View (KasWare users) */}
          {!isLoggedIn && externalWallet && (
            <div className="space-y-4">
              {/* Network Status Badge */}
              <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#70c7ba]/10 border border-[#70c7ba]/30 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#70c7ba] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#70c7ba]"></span>
                  </span>
                  <span className="text-xs font-medium text-[#70c7ba]">Kaspa Mainnet</span>
                  <Globe className="w-3 h-3 text-[#70c7ba]" />
                </div>
              </div>
              
              {/* KasShi Wallet (Internal - for micropayments) */}
              <div className="bg-gradient-to-br from-[#70c7ba]/20 to-[#49eacf]/10 border border-[#70c7ba]/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[#70c7ba] text-sm font-medium">KasShi Wallet</span>
                  <span className="text-xs text-[#70c7ba]/70 bg-[#70c7ba]/10 px-2 py-1 rounded">Micropayments</span>
                </div>
                
                {externalWallet.internalAddress ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Address</span>
                      <button
                        onClick={() => copyToClipboard(externalWallet.internalAddress!)}
                        className="flex items-center gap-1 text-[#70c7ba] hover:text-[#49eacf] transition-colors text-xs font-mono"
                      >
                        {formatAddress(externalWallet.internalAddress)}
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Balance</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-lg">{(parseFloat(internalBalance) - (pendingBalance?.pendingDebitsKas || 0)).toFixed(4)} KAS</span>
                        <button
                          onClick={() => { fetchBothBalances(); refreshBalance(); refreshPendingBalance(); }}
                          disabled={isRefreshing}
                          className="p-1 hover:bg-[#70c7ba]/20 rounded-lg transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 text-[#70c7ba] ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Setting up wallet...</p>
                )}
              </div>

              {/* Deposit/Withdraw Buttons */}
              {externalWallet.internalAddress && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setShowDeposit(!showDeposit); setShowWithdraw(false); }}
                    className={`p-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                      showDeposit 
                        ? "bg-[#70c7ba] text-black" 
                        : "bg-[#2a2a4a] border border-[#70c7ba]/30 text-[#70c7ba] hover:bg-[#3a3a5a]"
                    }`}
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    Deposit
                  </button>
                  <button
                    onClick={() => { setShowWithdraw(!showWithdraw); setShowDeposit(false); }}
                    className={`p-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                      showWithdraw 
                        ? "bg-[#70c7ba] text-black" 
                        : "bg-[#2a2a4a] border border-[#70c7ba]/30 text-[#70c7ba] hover:bg-[#3a3a5a]"
                    }`}
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    Withdraw
                  </button>
                </div>
              )}

              {/* Deposit Form */}
              {showDeposit && externalWallet.internalAddress && (
                <div className="bg-[#2a2a4a] border border-[#70c7ba]/30 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>From: {externalWallet.provider === "kastle" ? "Kastle" : "KasWare"}</span>
                    <span>Available: {parseFloat(externalBalance).toFixed(4)} KAS</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Amount (min 0.1)"
                      min="0.1"
                      step="0.1"
                      className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#70c7ba]"
                    />
                    <button
                      onClick={() => setDepositAmount(Math.max(0, parseFloat(externalBalance) - 0.01).toFixed(4))}
                      className="px-3 py-2 text-xs text-[#70c7ba] hover:bg-[#70c7ba]/10 rounded-lg transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={isProcessing || !depositAmount || parseFloat(depositAmount) < 0.1}
                    className="w-full p-3 bg-gradient-to-r from-[#70c7ba] to-[#49eacf] text-black font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="w-4 h-4" />
                        Deposit to KasShi
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    Deposits enable frictionless micropayments on KasShi
                  </p>
                </div>
              )}

              {/* Withdraw Form */}
              {showWithdraw && externalWallet.internalAddress && (
                <div className="bg-[#2a2a4a] border border-[#70c7ba]/30 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>From: KasShi Wallet</span>
                    <span>Available: {parseFloat(internalBalance).toFixed(4)} KAS</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Amount (min 0.1)"
                      min="0.1"
                      step="0.1"
                      className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#70c7ba]"
                    />
                    <button
                      onClick={() => setWithdrawAmount(Math.max(0, parseFloat(internalBalance) - 0.01).toFixed(4))}
                      className="px-3 py-2 text-xs text-[#70c7ba] hover:bg-[#70c7ba]/10 rounded-lg transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={handleWithdraw}
                    disabled={isProcessing || !withdrawAmount || parseFloat(withdrawAmount) < 0.1}
                    className="w-full p-3 bg-gradient-to-r from-[#70c7ba] to-[#49eacf] text-black font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ArrowUpFromLine className="w-4 h-4" />
                        Withdraw to {externalWallet.provider === "kastle" ? "Kastle" : "KasWare"}
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    Withdraw your earnings to your {externalWallet.provider === "kastle" ? "Kastle" : "KasWare"} wallet
                  </p>
                </div>
              )}

              {/* External Wallet (KasWare/Kastle) */}
              <div className="bg-[#2a2a4a]/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">{externalWallet.provider === "kastle" ? "Kastle" : "KasWare"} Wallet</span>
                  <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded">External</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Address</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyToClipboard(externalWallet.address)}
                      className="flex items-center gap-1 text-gray-400 hover:text-[#70c7ba] transition-colors text-xs font-mono"
                    >
                      {formatAddress(externalWallet.address)}
                      <Copy className="w-3 h-3" />
                    </button>
                    <a
                      href={`https://explorer.kaspa.org/addresses/${externalWallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-[#70c7ba]/20 rounded transition-colors"
                    >
                      <ExternalLink className="w-3 h-3 text-gray-500 hover:text-[#70c7ba]" />
                    </a>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Balance</span>
                  <span className="text-gray-300 font-medium">{parseFloat(externalBalance).toFixed(4)} KAS</span>
                </div>
              </div>

              {/* Disconnect Button */}
              <button
                onClick={() => {
                  disconnectExternalWallet();
                  onClose();
                  toast.success("Wallet disconnected");
                }}
                className="w-full p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Disconnect Wallet
              </button>
              
              {/* Mainnet Info */}
              <div className="bg-[#2a2a4a]/50 rounded-xl p-3">
                <p className="text-xs text-gray-400 text-center">
                  Deposit KAS to your KasShi wallet for instant micropayments. Withdraw anytime to your KasWare wallet.
                </p>
              </div>
            </div>
          )}

          {/* Logged in but no wallet (edge case) */}
          {isLoggedIn && !walletLoading && !isConnected && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <p className="text-gray-400 text-sm text-center">
                Could not load wallet. Please try refreshing the page.
              </p>
              <button
                onClick={() => loadWalletFromAccount()}
                className="px-4 py-2 bg-[#70c7ba]/20 text-[#70c7ba] rounded-lg hover:bg-[#70c7ba]/30 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
