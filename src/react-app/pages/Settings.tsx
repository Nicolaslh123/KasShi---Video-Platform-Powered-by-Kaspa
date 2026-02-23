import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Moon, Sun, Sparkles, Check, Eye, EyeOff, Wallet, ThumbsUp, Upload, Send, Loader2, ExternalLink, KeyRound, AlertTriangle, Shield, Lock, Copy, Smartphone, CheckCircle2, LogOut, Clock, Zap, Crown, Calendar, User, CreditCard, Info, ScrollText, MessageCircle, Ban, Heart, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";
import { SecurityVerificationModal } from "../components/SecurityVerificationModal";
import { KaspaIcon } from "../components/KasShiLogo";

type Theme = "default" | "dark" | "light";
type SettingsTab = "account" | "wallet" | "security" | "memberships" | "rules" | "about";

const themes: { id: Theme; name: string; description: string; icon: typeof Sparkles }[] = [
  { id: "default", name: "Kaspa", description: "Teal-accented dark theme with Kaspa vibes", icon: Sparkles },
  { id: "dark", name: "Dark", description: "Pure dark mode for low-light environments", icon: Moon },
  { id: "light", name: "Light", description: "Clean light theme with Kaspa accent colors", icon: Sun },
];

const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "security", label: "Security", icon: Shield },
  { id: "memberships", label: "Memberships", icon: Crown },
  { id: "rules", label: "Rules", icon: ScrollText },
  { id: "about", label: "About", icon: Info },
];

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { isConnected, wallet, balance: balanceStr, micropay, externalWallet } = useWallet();
  const { user, logout } = useAuth();
  const balance = balanceStr !== null ? parseFloat(balanceStr) : null;
  
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [pendingWithdraw, setPendingWithdraw] = useState<{ address: string; amount: number } | null>(null);
  const [needsConsolidation, setNeedsConsolidation] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [utxoCount, setUtxoCount] = useState<number | null>(null);
  
  // Security settings state
  const [securityStatus, setSecurityStatus] = useState({
    is2FAEnabled: false,
    isExtraPasswordEnabled: false,
    hasViewedMnemonic: false
  });
  const [loadingSecurity, setLoadingSecurity] = useState(false);
  
  // 2FA setup state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  
  // Mnemonic state
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [isLoadingMnemonic, setIsLoadingMnemonic] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [showMnemonicPasswordPrompt, setShowMnemonicPasswordPrompt] = useState(false);
  const [mnemonicPassword, setMnemonicPassword] = useState("");
  
  // Extra password state
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [isDisablingPassword, setIsDisablingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [requireOnLogin, setRequireOnLogin] = useState(false);
  const [passwordRecoveryPhrase, setPasswordRecoveryPhrase] = useState("");
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState(false);
  const [recoveryPhraseCopied, setRecoveryPhraseCopied] = useState(false);
  
  // View password recovery phrase state
  const [showViewPasswordRecovery, setShowViewPasswordRecovery] = useState(false);
  const [viewPasswordRecoveryInput, setViewPasswordRecoveryInput] = useState("");
  const [isLoadingPasswordRecovery, setIsLoadingPasswordRecovery] = useState(false);
  const [viewedPasswordRecoveryPhrase, setViewedPasswordRecoveryPhrase] = useState("");
  const [viewedRecoveryPhraseCopied, setViewedRecoveryPhraseCopied] = useState(false);
  
  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  // Wallet mode state
  const [walletMode, setWalletMode] = useState<"demo" | "mainnet">("demo");
  const [mainnetBalance, setMainnetBalance] = useState("0.00");
  const [demoBalance, setDemoBalance] = useState("0.00");
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const [loadingMode, setLoadingMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Pending balance state
  const [pendingDebitsKas, setPendingDebitsKas] = useState(0);
  const [isSettling, setIsSettling] = useState(false);
  const [, setLoadingPendingBalance] = useState(false);
  
  // Memberships state
  interface Membership {
    id: number;
    channelHandle: string;
    channelName: string;
    channelAvatar: string | null;
    tierName: string;
    tierPrice: number;
    expiresAt: string;
    totalPaid: number;
  }
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  
  // Fetch security status
  useEffect(() => {
    const fetchSecurityStatus = async () => {
      if (!user || !isConnected) return;
      setLoadingSecurity(true);
      try {
        const res = await fetch("/api/security/status");
        if (res.ok) {
          const data = await res.json();
          setSecurityStatus(data);
        }
      } catch (err) {
        console.error("Failed to fetch security status:", err);
      } finally {
        setLoadingSecurity(false);
      }
    };
    fetchSecurityStatus();
  }, [user, isConnected]);
  
  // Fetch wallet mode status
  useEffect(() => {
    const fetchWalletMode = async () => {
      if (!user || !isConnected) return;
      setLoadingMode(true);
      try {
        const res = await fetch("/api/wallet/mode", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setWalletMode(data.mode);
          setMainnetBalance(data.mainnetBalance);
          setDemoBalance(data.demoBalance);
          setIsAdmin(data.isAdmin || false);
        }
      } catch (err) {
        console.error("Failed to fetch wallet mode:", err);
      } finally {
        setLoadingMode(false);
      }
    };
    fetchWalletMode();
  }, [user, isConnected]);
  
  // External wallets (KasWare, Kastle, imported seed) are always on mainnet
  useEffect(() => {
    if (externalWallet?.authToken) {
      setWalletMode("mainnet");
    }
  }, [externalWallet]);
  
  // Fetch pending balance
  useEffect(() => {
    const fetchPendingBalance = async () => {
      // Support both Google auth users and external wallet users (KasWare/Kastle)
      const hasGoogleAuth = user && isConnected;
      const hasExternalWallet = externalWallet?.authToken;
      
      if (!hasGoogleAuth && !hasExternalWallet) return;
      
      setLoadingPendingBalance(true);
      try {
        const headers: HeadersInit = {};
        if (hasExternalWallet) {
          headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        
        const res = await fetch("/api/kasshi/pending-balance", { 
          credentials: "include",
          headers 
        });
        if (res.ok) {
          const data = await res.json();
          setPendingDebitsKas(data.pendingDebitsKas || 0);
        }
      } catch (err) {
        console.error("Failed to fetch pending balance:", err);
      } finally {
        setLoadingPendingBalance(false);
      }
    };
    fetchPendingBalance();
  }, [user, isConnected, externalWallet]);
  
  // Fetch active memberships
  useEffect(() => {
    const fetchMemberships = async () => {
      if (!user || !isConnected) return;
      setLoadingMemberships(true);
      try {
        const res = await fetch("/api/kasshi/my-memberships", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setMemberships(data.memberships || []);
        }
      } catch (err) {
        console.error("Failed to fetch memberships:", err);
      } finally {
        setLoadingMemberships(false);
      }
    };
    fetchMemberships();
  }, [user, isConnected]);
  
  // Check UTXO status
  const checkUtxoStatus = async () => {
    const hasExternalWallet = externalWallet?.authToken;
    // External wallets are always on mainnet - don't wait for walletMode state
    const isMainnet = walletMode === "mainnet" || !!hasExternalWallet;
    if ((!user && !hasExternalWallet) || !isConnected || !isMainnet) {
      setNeedsConsolidation(false);
      setUtxoCount(null);
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (hasExternalWallet) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const res = await fetch("/api/kasshi/wallet/utxo-status", { 
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setNeedsConsolidation(data.needsConsolidation);
        setUtxoCount(data.utxoCount);
      }
    } catch (err) {
      console.error("Failed to check UTXO status:", err);
    }
  };

  useEffect(() => {
    checkUtxoStatus();
  }, [user, isConnected, walletMode, externalWallet]);
  
  // Toggle wallet mode
  const handleToggleWalletMode = async (newMode: "demo" | "mainnet") => {
    if (newMode === walletMode) return;
    
    if (newMode === "mainnet") {
      const confirmed = window.confirm(
        "⚠️ WARNING: Switching to mainnet mode will use REAL KAS from your wallet.\n\n" +
        "All transactions (likes, comments, tips, uploads) will cost real cryptocurrency.\n\n" +
        "Your mainnet balance: " + mainnetBalance + " KAS\n\n" +
        "Are you sure you want to continue?"
      );
      if (!confirmed) return;
    }
    
    setIsTogglingMode(true);
    try {
      const res = await fetch("/api/wallet/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setWalletMode(newMode);
      if (newMode === "demo") setDemoBalance(data.demoBalance);
      toast.success(data.message);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle mode");
    } finally {
      setIsTogglingMode(false);
    }
  };
  
  // 2FA handlers
  const handleStart2FASetup = async () => {
    setIsSettingUp2FA(true);
    try {
      const res = await fetch("/api/security/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTotpSecret(data.secret);
      setTotpUri(data.otpauthUrl);
      setShow2FASetup(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start 2FA setup");
    } finally {
      setIsSettingUp2FA(false);
    }
  };
  
  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode || verifyCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    setIsVerifying2FA(true);
    try {
      const res = await fetch("/api/security/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("2FA enabled successfully!");
      setSecurityStatus(prev => ({ ...prev, is2FAEnabled: true }));
      setShow2FASetup(false);
      setVerifyCode("");
      setTotpSecret("");
      setTotpUri("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to verify code");
    } finally {
      setIsVerifying2FA(false);
    }
  };
  
  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode || disableCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    setIsDisabling2FA(true);
    try {
      const res = await fetch("/api/security/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("2FA disabled");
      setSecurityStatus(prev => ({ ...prev, is2FAEnabled: false }));
      setDisableCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setIsDisabling2FA(false);
    }
  };
  
  // Mnemonic handlers
  const handleViewMnemonic = async (password?: string) => {
    setIsLoadingMnemonic(true);
    try {
      const res = await fetch("/api/security/mnemonic", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || mnemonicPassword })
      });
      const data = await res.json();
      
      if (!res.ok && data.requiresPassword) {
        setShowMnemonicPasswordPrompt(true);
        setIsLoadingMnemonic(false);
        return;
      }
      
      if (!res.ok) throw new Error(data.error);
      setMnemonic(data.mnemonic);
      setShowMnemonic(true);
      setShowMnemonicPasswordPrompt(false);
      setMnemonicPassword("");
      setSecurityStatus(prev => ({ ...prev, hasViewedMnemonic: true }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load recovery phrase");
    } finally {
      setIsLoadingMnemonic(false);
    }
  };
  
  const handleCopyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setMnemonicCopied(true);
    toast.success("Recovery phrase copied!");
    setTimeout(() => setMnemonicCopied(false), 2000);
  };
  
  // Extra password handlers
  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setIsSettingPassword(true);
    try {
      const res = await fetch("/api/security/password/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword, requireOnLogin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setPasswordRecoveryPhrase(data.recoveryPhrase);
      setShowRecoveryPhrase(true);
      setSecurityStatus(prev => ({ ...prev, isExtraPasswordEnabled: true }));
      setShowPasswordSetup(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setIsSettingPassword(false);
    }
  };
  
  const handleCopyRecoveryPhrase = () => {
    navigator.clipboard.writeText(passwordRecoveryPhrase);
    setRecoveryPhraseCopied(true);
    toast.success("Recovery phrase copied!");
    setTimeout(() => setRecoveryPhraseCopied(false), 2000);
  };
  
  const handleViewPasswordRecoveryPhrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewPasswordRecoveryInput) {
      toast.error("Please enter your password");
      return;
    }
    setIsLoadingPasswordRecovery(true);
    try {
      const res = await fetch("/api/security/password/recovery-phrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: viewPasswordRecoveryInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setViewedPasswordRecoveryPhrase(data.recoveryPhrase);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load recovery phrase");
    } finally {
      setIsLoadingPasswordRecovery(false);
    }
  };
  
  const handleCopyViewedRecoveryPhrase = () => {
    navigator.clipboard.writeText(viewedPasswordRecoveryPhrase);
    setViewedRecoveryPhraseCopied(true);
    toast.success("Recovery phrase copied!");
    setTimeout(() => setViewedRecoveryPhraseCopied(false), 2000);
  };
  
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryInput.trim()) {
      toast.error("Please enter your recovery phrase");
      return;
    }
    if (resetNewPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await fetch("/api/security/password/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryPhrase: recoveryInput, newPassword: resetNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Password has been reset!");
      setShowForgotPassword(false);
      setRecoveryInput("");
      setResetNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsResettingPassword(false);
    }
  };
  
  const handleDisablePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      toast.error("Please enter your password");
      return;
    }
    setIsDisablingPassword(true);
    try {
      const res = await fetch("/api/security/password/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Transaction password disabled");
      setSecurityStatus(prev => ({ ...prev, isExtraPasswordEnabled: false }));
      setDisablePassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable password");
    } finally {
      setIsDisablingPassword(false);
    }
  };
  
  // Settlement handler
  const handleSettlement = async (force = false) => {
    setIsSettling(true);
    try {
      const res = await fetch("/api/kasshi/settle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success(`Settled ${data.itemCount} micropayments (${data.totalAmountKas?.toFixed(4)} KAS)`);
        setPendingDebitsKas(0);
      } else {
        toast.error(data.error || "Settlement failed");
      }
    } catch (err) {
      console.error("Settlement failed:", err);
      toast.error("Settlement failed");
    } finally {
      setIsSettling(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !wallet) {
      toast.error("Please connect your wallet first");
      return;
    }
    
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    const availableBalance = balance !== null ? Math.max(0, balance - pendingDebitsKas) : 0;
    if (balance === null || amount > availableBalance) {
      toast.error(pendingDebitsKas > 0 
        ? `Insufficient balance. You have ${availableBalance.toFixed(4)} KAS available`
        : "Insufficient balance");
      return;
    }
    
    if (!withdrawAddress.startsWith("kaspa:")) {
      toast.error("Please enter a valid Kaspa address (starts with kaspa:)");
      return;
    }
    
    setPendingWithdraw({ address: withdrawAddress, amount });
    setShowSecurityModal(true);
  };

  const executeWithdraw = useCallback(async () => {
    if (!pendingWithdraw) return;
    
    setShowSecurityModal(false);
    setIsWithdrawing(true);
    
    try {
      const result = await micropay(pendingWithdraw.address, pendingWithdraw.amount, "", "withdrawal");
      
      if (result.success) {
        toast.success("Withdrawal successful!");
        setWithdrawAddress("");
        setWithdrawAmount("");
        checkUtxoStatus();
      } else if (result.needsConsolidation) {
        setNeedsConsolidation(true);
        setUtxoCount(result.utxoCount || null);
        toast.error("Your wallet has too many small transactions. Please consolidate first.");
      } else {
        toast.error(result.error || "Withdrawal failed");
      }
    } catch (error) {
      console.error("Withdrawal failed:", error);
      toast.error(error instanceof Error ? error.message : "Withdrawal failed");
    } finally {
      setIsWithdrawing(false);
      setPendingWithdraw(null);
    }
  }, [pendingWithdraw, micropay]);

  const handleConsolidate = async () => {
    setIsConsolidating(true);
    try {
      const hasExternalWallet = externalWallet?.authToken;
      const headers: Record<string, string> = {};
      if (hasExternalWallet) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const response = await fetch("/api/kasshi/consolidate", {
        method: "POST",
        credentials: "include",
        headers,
      });
      const data = await response.json();
      
      if (data.success) {
        if (data.consolidated && data.consolidated > 0) {
          toast.success(data.message || `Consolidated ${data.consolidated} UTXOs!`);
        } else {
          toast.success("No consolidation needed");
        }
        await checkUtxoStatus();
      } else {
        toast.error(data.error || "Consolidation failed");
      }
    } catch (error) {
      console.error("Consolidation failed:", error);
      toast.error("Consolidation failed");
    } finally {
      setIsConsolidating(false);
    }
  };

  // Tab content components
  const AccountTab = () => (
    <div className="space-y-6">
      {/* Theme Section */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
        <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Appearance</h2>
        <p className="text-white/60 text-sm mb-4">Choose how KasShi looks for you</p>
        
        <div className="grid gap-3">
          {themes.map((t) => {
            const Icon = t.icon;
            const isSelected = theme === t.id;
            
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                  isSelected
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isSelected ? "bg-teal-500/20" : "bg-white/10"
                }`}>
                  <Icon className={`w-6 h-6 ${isSelected ? "text-teal-400" : "text-white/60"}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{t.name}</p>
                  <p className="text-sm text-white/50">{t.description}</p>
                </div>
                {isSelected && (
                  <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Account Info */}
      {user && (
        <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Account</h2>
              <p className="text-white/50 text-sm mt-1">Signed in as {user.email}</p>
            </div>
            <button
              onClick={async () => {
                try {
                  sessionStorage.removeItem("kasshi_password_verified");
                  await logout();
                  window.location.href = "/";
                } catch (err) {
                  console.error("Logout failed:", err);
                  toast.error("Failed to log out");
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
          
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">User ID</p>
                <p className="text-white/70 text-sm font-mono">{user.id}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(user.id);
                  toast.success("User ID copied!");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-white/70 hover:text-white rounded-lg transition-colors text-sm"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const WalletTab = () => (
    <div className="space-y-6">
      {isConnected && wallet ? (
        <>
          {/* Current Balance */}
          <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center border border-teal-500/30">
                <Send className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Withdraw KAS</h2>
                <p className="text-white/50 text-sm">Send earnings to another wallet</p>
              </div>
            </div>
            
            <div className="mb-6 p-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Available Balance</span>
                <div className="flex items-center gap-2">
                  <KaspaIcon size={20} />
                  <span className="text-xl font-bold text-white">
                    {balance !== null ? Math.max(0, balance - pendingDebitsKas).toFixed(4) : "0.0000"}
                  </span>
                  <span className="text-teal-400">KAS</span>
                </div>
              </div>
              {pendingDebitsKas > 0 && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-white/40">Wallet balance: {balance?.toFixed(4)} KAS</span>
                  <span className="text-orange-400">-{pendingDebitsKas.toFixed(4)} KAS pending</span>
                </div>
              )}
              <div className="mt-2 text-xs text-white/40 truncate">
                Wallet: {wallet.address}
              </div>
            </div>

            {/* Off-Chain Balance Explanation */}
            {pendingDebitsKas > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-5 h-5 text-blue-400" />
                  <span className="text-white/80 font-medium">Balance Breakdown</span>
                </div>
                <p className="text-white/50 text-xs mb-3">
                  Small transactions are batched off-chain to save fees. This is why your balance here may differ from Kaspa explorers.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">On-chain balance</span>
                    <span className="text-white font-mono">{balance?.toFixed(4) || "0.0000"} KAS</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-orange-400/80">− Pending outgoing</span>
                    <span className="text-orange-400 font-mono">-{pendingDebitsKas.toFixed(4)} KAS</span>
                  </div>
                  <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                    <span className="text-white/80 font-medium">Available balance</span>
                    <span className="text-teal-400 font-mono font-bold">
                      {Math.max(0, (balance || 0) - pendingDebitsKas).toFixed(4)} KAS
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Pending Debits */}
            {pendingDebitsKas > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-400" />
                    <span className="text-white/80 font-medium">Pending Outgoing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <KaspaIcon size={16} />
                    <span className="text-lg font-bold text-white">{pendingDebitsKas.toFixed(4)}</span>
                    <span className="text-orange-400 text-sm">KAS</span>
                  </div>
                </div>
                <p className="text-white/50 text-xs mb-3">
                  Small fees are batched until 0.11 KAS threshold.
                </p>
                {pendingDebitsKas >= 0.11 ? (
                  <button
                    onClick={() => handleSettlement(false)}
                    disabled={isSettling}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                  >
                    {isSettling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {isSettling ? "Settling..." : "Settle Now"}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-white/40 text-xs">
                    <Clock className="w-3 h-3" />
                    {((pendingDebitsKas / 0.11) * 100).toFixed(0)}% to threshold
                  </div>
                )}
              </div>
            )}

            {/* Admin Dashboard Link */}
            {isAdmin && (
              <Link
                to="/admin"
                className="mb-6 p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-between group hover:border-purple-500/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-purple-400" />
                  <div>
                    <h3 className="font-medium text-white">Admin Dashboard</h3>
                    <p className="text-white/50 text-xs">Manage reports, moderate content</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-white/60 transition-colors" />
              </Link>
            )}

            {/* Wallet Mode Toggle - Admin Only */}
            {isAdmin && (
              <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-purple-400" />
                    <div>
                      <h3 className="font-medium text-white text-sm">Wallet Mode (Admin)</h3>
                      <p className="text-white/50 text-xs">Demo for testing, Mainnet for real</p>
                    </div>
                  </div>
                  {loadingMode ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white/50" />
                  ) : (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      walletMode === "mainnet" 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}>
                      {walletMode === "mainnet" ? "MAINNET" : "DEMO"}
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleToggleWalletMode("demo")}
                    disabled={isTogglingMode || walletMode === "demo"}
                    className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-all ${
                      walletMode === "demo"
                        ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                        : "bg-slate-700/50 border-slate-600 text-white/60 hover:bg-slate-700"
                    } disabled:opacity-50`}
                  >
                    <Sparkles className="w-5 h-5" />
                    <span className="text-sm font-medium">Demo</span>
                    <span className="text-xs opacity-60">{demoBalance} KAS</span>
                  </button>
                  <button
                    onClick={() => handleToggleWalletMode("mainnet")}
                    disabled={isTogglingMode || walletMode === "mainnet"}
                    className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-all ${
                      walletMode === "mainnet"
                        ? "bg-green-500/20 border-green-500/50 text-green-400"
                        : "bg-slate-700/50 border-slate-600 text-white/60 hover:bg-slate-700"
                    } disabled:opacity-50`}
                  >
                    <ExternalLink className="w-5 h-5" />
                    <span className="text-sm font-medium">Mainnet</span>
                    <span className="text-xs opacity-60">{mainnetBalance} KAS</span>
                  </button>
                </div>
              </div>
            )}

            {/* UTXO Consolidation */}
            {needsConsolidation && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg">
                    <Loader2 className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-amber-400 font-medium mb-1">Wallet Needs Consolidation</h4>
                    <p className="text-white/60 text-sm mb-3">
                      Your wallet has {utxoCount ? `${utxoCount}+` : 'many'} small transactions. Consolidate before withdrawing.
                    </p>
                    <button
                      onClick={handleConsolidate}
                      disabled={isConsolidating}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isConsolidating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {isConsolidating ? "Consolidating..." : "Consolidate Wallet"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* UTXO Status */}
            {walletMode === "mainnet" && !needsConsolidation && utxoCount !== null && (
              <div className="mb-4 p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Wallet UTXOs:</span>
                  <span className={`font-medium ${utxoCount > 30 ? 'text-amber-400' : 'text-teal-400'}`}>
                    {utxoCount} / 50
                  </span>
                </div>
              </div>
            )}

            {/* Withdraw Form */}
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Destination Address</label>
                <input
                  type="text"
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  placeholder="kaspa:qz..."
                  className="w-full bg-slate-800/50 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none transition-colors"
                  disabled={isWithdrawing}
                />
              </div>
              
              <div>
                <label className="block text-white/60 text-sm mb-2">Amount (KAS)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-800/50 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none transition-colors pr-20"
                    disabled={isWithdrawing}
                  />
                  <button
                    type="button"
                    onClick={() => balance !== null && setWithdrawAmount(Math.max(0, balance - pendingDebitsKas).toString())}
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isWithdrawing || !withdrawAddress || !withdrawAmount}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {isWithdrawing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {isWithdrawing ? "Sending..." : "Send KAS"}
              </button>
            </form>
          </div>
        </>
      ) : (
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
          <Wallet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-white/60 mb-4">Sign in to access your wallet</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-2 bg-teal-500 hover:bg-teal-400 text-white rounded-full font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Go to Home
          </Link>
        </div>
      )}
    </div>
  );

  const SecurityTab = () => (
    <div className="space-y-6">
      {isConnected && wallet ? (
        loadingSecurity ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : (
          <>
            {/* 2FA Section */}
            <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-purple-400" />
                  <div>
                    <h3 className="font-medium text-white">Two-Factor Authentication</h3>
                    <p className="text-white/50 text-sm">6-digit codes from authenticator app</p>
                  </div>
                </div>
                {securityStatus.is2FAEnabled && (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Enabled
                  </span>
                )}
              </div>
              
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg mb-4">
                <p className="text-purple-300/80 text-xs">
                  Adds 6-digit codes from an authenticator app for large transactions.
                </p>
              </div>
              
              {!securityStatus.is2FAEnabled ? (
                !show2FASetup ? (
                  <button
                    onClick={handleStart2FASetup}
                    disabled={isSettingUp2FA}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSettingUp2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Enable 2FA
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center p-4 bg-white rounded-xl">
                      <QRCodeSVG value={totpUri} size={180} />
                    </div>
                    <div className="text-center">
                      <p className="text-white/60 text-sm mb-2">Or enter manually:</p>
                      <div className="flex items-center justify-center gap-2">
                        <code className="px-3 py-1.5 bg-slate-700 rounded text-teal-400 text-sm font-mono">
                          {totpSecret}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(totpSecret);
                            toast.success("Code copied!");
                          }}
                          className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        >
                          <Copy className="w-4 h-4 text-white/60" />
                        </button>
                      </div>
                    </div>
                    <form onSubmit={handleVerify2FA} className="space-y-3">
                      <input
                        type="text"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Enter 6-digit code"
                        className="w-full bg-slate-700/50 border border-slate-600 focus:border-purple-500 rounded-lg px-4 py-2.5 text-white text-center text-lg tracking-widest placeholder-slate-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShow2FASetup(false);
                            setTotpSecret("");
                            setTotpUri("");
                            setVerifyCode("");
                          }}
                          className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isVerifying2FA || verifyCode.length !== 6}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-400 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isVerifying2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Verify & Enable
                        </button>
                      </div>
                    </form>
                  </div>
                )
              ) : (
                <form onSubmit={handleDisable2FA} className="space-y-3">
                  <p className="text-white/50 text-sm">Enter 2FA code to disable:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      className="flex-1 bg-slate-700/50 border border-slate-600 focus:border-red-500 rounded-lg px-4 py-2.5 text-white text-center tracking-widest placeholder-slate-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isDisabling2FA || disableCode.length !== 6}
                      className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isDisabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disable"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Recovery Phrase Section */}
            <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-medium text-white">Wallet Recovery Phrase</h3>
                    <p className="text-white/50 text-sm">Your Kaspa wallet's master key</p>
                  </div>
                </div>
                {securityStatus.hasViewedMnemonic && (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Backed Up
                  </span>
                )}
              </div>
              
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
                <p className="text-amber-300/80 text-xs">
                  24 words that control your KAS funds. Keep them secret!
                </p>
              </div>
              
              {!showMnemonic ? (
                showMnemonicPasswordPrompt ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleViewMnemonic(); }} className="space-y-3">
                    <input
                      type="password"
                      value={mnemonicPassword}
                      onChange={(e) => setMnemonicPassword(e.target.value)}
                      placeholder="Transaction password"
                      className="w-full bg-slate-700/50 border border-slate-600 focus:border-[#70C7BA] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMnemonicPasswordPrompt(false);
                          setMnemonicPassword("");
                        }}
                        className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoadingMnemonic || !mnemonicPassword}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isLoadingMnemonic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        View
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => handleViewMnemonic()}
                    disabled={isLoadingMnemonic}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoadingMnemonic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    View Recovery Phrase
                  </button>
                )
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-amber-200 font-mono text-sm leading-relaxed break-words">
                      {mnemonic}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-amber-400/80 text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    Never share with anyone
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyMnemonic}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors"
                    >
                      {mnemonicCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {mnemonicCopied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        setShowMnemonic(false);
                        setMnemonic("");
                      }}
                      className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Transaction Password Section */}
            <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="font-medium text-white">Transaction Password</h3>
                    <p className="text-white/50 text-sm">Optional extra security layer</p>
                  </div>
                </div>
                {securityStatus.isExtraPasswordEnabled && (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Enabled
                  </span>
                )}
              </div>
              
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg mb-4">
                <p className="text-cyan-300/80 text-xs">
                  Protects large transactions. Small actions stay frictionless.
                </p>
              </div>
              
              {!securityStatus.isExtraPasswordEnabled ? (
                !showPasswordSetup ? (
                  <button
                    onClick={() => setShowPasswordSetup(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#70C7BA]/20 hover:bg-[#70C7BA]/30 text-[#70C7BA] rounded-lg transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    Set Transaction Password
                  </button>
                ) : (
                  <form onSubmit={handleSetupPassword} className="space-y-3">
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password (8+ characters)"
                        className="w-full bg-slate-700/50 border border-slate-600 focus:border-[#70C7BA] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full bg-slate-700/50 border border-slate-600 focus:border-[#70C7BA] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                    />
                    <label className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requireOnLogin}
                        onChange={(e) => setRequireOnLogin(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-[#70C7BA] focus:ring-[#70C7BA]"
                      />
                      <span className="text-white/70 text-sm">Require on login</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordSetup(false);
                          setNewPassword("");
                          setConfirmPassword("");
                          setRequireOnLogin(false);
                        }}
                        className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSettingPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#70C7BA] hover:bg-[#49EACB] text-black font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Enable
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <div className="space-y-3">
                  {!showForgotPassword && !showViewPasswordRecovery ? (
                    <>
                      <form onSubmit={handleDisablePassword} className="space-y-3">
                        <p className="text-white/50 text-sm">Enter password to disable:</p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={disablePassword}
                            onChange={(e) => setDisablePassword(e.target.value)}
                            placeholder="Current password"
                            className="flex-1 bg-slate-700/50 border border-slate-600 focus:border-red-500 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isDisablingPassword || !disablePassword}
                            className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isDisablingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disable"}
                          </button>
                        </div>
                      </form>
                      <div className="flex gap-4 text-sm">
                        <button onClick={() => setShowViewPasswordRecovery(true)} className="text-[#70C7BA] hover:underline">
                          View recovery phrase
                        </button>
                        <button onClick={() => setShowForgotPassword(true)} className="text-[#70C7BA] hover:underline">
                          Forgot password?
                        </button>
                      </div>
                    </>
                  ) : showViewPasswordRecovery ? (
                    !viewedPasswordRecoveryPhrase ? (
                      <form onSubmit={handleViewPasswordRecoveryPhrase} className="space-y-3">
                        <p className="text-white/70 text-sm">Enter password to view recovery phrase:</p>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={viewPasswordRecoveryInput}
                            onChange={(e) => setViewPasswordRecoveryInput(e.target.value)}
                            placeholder="Current password"
                            className="flex-1 bg-slate-700/50 border border-slate-600 focus:border-[#70C7BA] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isLoadingPasswordRecovery || !viewPasswordRecoveryInput}
                            className="px-4 py-2.5 bg-[#70C7BA]/20 hover:bg-[#70C7BA]/30 text-[#70C7BA] rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isLoadingPasswordRecovery ? <Loader2 className="w-4 h-4 animate-spin" /> : "View"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowViewPasswordRecovery(false);
                            setViewPasswordRecoveryInput("");
                          }}
                          className="text-white/50 text-sm hover:text-white/70"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-[#70C7BA]/10 border border-[#70C7BA]/20 rounded-lg">
                          <p className="text-[#70C7BA]/80 text-xs mb-2">Password Recovery Phrase</p>
                          <p className="text-white font-mono text-sm break-words">{viewedPasswordRecoveryPhrase}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCopyViewedRecoveryPhrase}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#70C7BA]/20 hover:bg-[#70C7BA]/30 text-[#70C7BA] rounded-lg transition-colors"
                          >
                            {viewedRecoveryPhraseCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {viewedRecoveryPhraseCopied ? "Copied!" : "Copy"}
                          </button>
                          <button
                            onClick={() => {
                              setShowViewPasswordRecovery(false);
                              setViewPasswordRecoveryInput("");
                              setViewedPasswordRecoveryPhrase("");
                            }}
                            className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-3">
                      <p className="text-white/70 text-sm">Enter recovery phrase to reset:</p>
                      <textarea
                        value={recoveryInput}
                        onChange={(e) => setRecoveryInput(e.target.value)}
                        placeholder="24-word recovery phrase..."
                        rows={3}
                        className="w-full bg-slate-700/50 border border-slate-600 focus:border-[#70C7BA] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none resize-none"
                      />
                      <input
                        type="password"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="New password (8+ characters)"
                        className="w-full bg-slate-700/50 border border-slate-600 focus:border-[#70C7BA] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setRecoveryInput("");
                            setResetNewPassword("");
                          }}
                          className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isResettingPassword || !recoveryInput.trim() || resetNewPassword.length < 8}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#70C7BA] hover:bg-[#49EACB] text-black font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isResettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Reset
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </>
        )
      ) : (
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
          <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-white/60">Sign in to manage security settings</p>
        </div>
      )}
    </div>
  );

  const MembershipsTab = () => (
    <div className="space-y-6">
      {loadingMemberships ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      ) : memberships.length > 0 ? (
        <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="font-medium text-white">Your Memberships</h3>
            <span className="ml-auto text-xs text-white/40">{memberships.length} active</span>
          </div>
          
          <div className="space-y-3">
            {memberships.map((membership) => (
              <div key={membership.id} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-start gap-3">
                  {membership.channelAvatar ? (
                    <img
                      src={membership.channelAvatar}
                      alt={membership.channelName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-bold">
                      {membership.channelName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/channel/${membership.channelHandle}`}
                        className="font-medium text-white hover:text-primary transition-colors truncate"
                      >
                        {membership.channelName}
                      </Link>
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                        {membership.tierName}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                      <span className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {membership.tierPrice} KAS/month
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Expires {new Date(membership.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                
                {membership.totalPaid > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 text-xs text-white/40">
                    Total paid: {membership.totalPaid.toFixed(2)} KAS
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
          <Crown className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-white/60 mb-2">No active memberships</p>
          <p className="text-white/40 text-sm">Join channel memberships to access exclusive content</p>
        </div>
      )}
    </div>
  );

  const RulesTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-500/10 to-slate-800/50 border border-teal-500/20">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/20 flex items-center justify-center">
            <ScrollText className="w-7 h-7 text-teal-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Community Guidelines</h2>
            <p className="text-white/50 text-sm">What you need to know before posting</p>
          </div>
        </div>
        <p className="text-white/60 text-sm leading-relaxed">
          KasShi is built on the principle that everyone deserves a platform to share their voice. 
          These guidelines ensure our community remains a safe and respectful space for all creators and viewers.
        </p>
      </div>

      {/* Free Speech */}
      <div className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-teal-500/30 transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-6 h-6 text-teal-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-white">Free Speech is Encouraged</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-teal-500/20 text-teal-400 rounded-full">Core Value</span>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">
              Everyone has a voice on KasShi. We believe in open discourse and the free exchange of ideas. 
              Share your thoughts, express your creativity, and engage in meaningful conversations. 
              Your perspective matters.
            </p>
          </div>
        </div>
      </div>

      {/* Prohibited Content Section */}
      <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Ban className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Prohibited Content</h3>
            <p className="text-white/40 text-sm">The following content is strictly not allowed</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Sexual Content */}
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Ban className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h4 className="font-medium text-white mb-1">Hypersexual Content</h4>
                <p className="text-white/50 text-sm leading-relaxed">
                  Pornographic material, explicit sexual content, or any form of hypersexualized media is strictly prohibited. 
                  This includes nudity intended to sexually gratify.
                </p>
              </div>
            </div>
          </div>

          {/* Violence */}
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Ban className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h4 className="font-medium text-white mb-1">Violence & Abuse</h4>
                <p className="text-white/50 text-sm leading-relaxed">
                  Content depicting murder, torture, abuse, or rape is absolutely not permitted. 
                  This includes graphic violence, harmful acts against individuals or animals, and any content that glorifies or promotes such behavior.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legal Notices */}
      <div className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Scale className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-white">Legal Notices & Copyright</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">Important</span>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">
              Videos are subject to removal in response to valid legal notices, including copyright infringement claims. 
              We comply with applicable laws and will remove content when legally required to do so.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
        <div className="flex items-start gap-3">
          <Heart className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
          <p className="text-white/50 text-sm leading-relaxed">
            Violations of these guidelines may result in content removal and account suspension. 
            Help us keep KasShi safe by reporting content that breaks these rules.
          </p>
        </div>
      </div>
    </div>
  );

  const AboutTab = () => (
    <div className="space-y-6">
      {/* How KasShi Works */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">How does KasShi work?</h2>
        <p className="text-white/60 text-sm mb-6">Every interaction has real value through Kaspa micropayments.</p>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <Eye className="w-5 h-5 text-teal-400" />
              <h3 className="font-medium text-white">Watch Videos</h3>
            </div>
            <p className="text-white/50 text-sm">0.11-0.25 KAS based on length. 95% to creator.</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <Upload className="w-5 h-5 text-teal-400" />
              <h3 className="font-medium text-white">Upload Videos</h3>
            </div>
            <p className="text-white/50 text-sm">5-15 KAS based on file size.</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <Crown className="w-5 h-5 text-teal-400" />
              <h3 className="font-medium text-white">Subscribe</h3>
            </div>
            <p className="text-white/50 text-sm">0.5 KAS, 100% to creator.</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <ThumbsUp className="w-5 h-5 text-teal-400" />
              <h3 className="font-medium text-white">Engagement</h3>
            </div>
            <p className="text-white/50 text-sm">Likes, comments, dislikes: 0.02 KAS to platform.</p>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
          <div className="flex items-center gap-3">
            <KaspaIcon size={24} />
            <p className="text-white/60 text-sm">
              <span className="text-teal-400 font-medium">Kaspa</span> confirms in seconds.{" "}
              <a href="https://kaspa.org" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">
                Learn more →
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Legal */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">Legal & Policies</h2>
        <Link 
          to="/legal"
          className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-teal-400" />
            <div>
              <p className="font-medium text-white">Privacy Policy, Terms & More</p>
              <p className="text-white/50 text-sm">View all legal documents</p>
            </div>
          </div>
          <ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-white/60 rotate-180 transition-colors" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/5 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
          <Link to="/" className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <h1 className="text-lg sm:text-xl font-bold text-white">Settings</h1>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="sticky top-[57px] sm:top-[65px] z-30 backdrop-blur-xl bg-slate-950/80 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-2 sm:px-4">
          <div className="flex overflow-x-auto scrollbar-hide gap-1 py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8 w-full">
        {activeTab === "account" && <AccountTab />}
        {activeTab === "wallet" && <WalletTab />}
        {activeTab === "security" && <SecurityTab />}
        {activeTab === "memberships" && <MembershipsTab />}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "about" && <AboutTab />}
      </main>

      {/* Security Verification Modal */}
      <SecurityVerificationModal
        isOpen={showSecurityModal}
        onClose={() => {
          setShowSecurityModal(false);
          setPendingWithdraw(null);
        }}
        onVerified={executeWithdraw}
        transactionType="withdrawal"
        amount={pendingWithdraw?.amount}
      />

      {/* Recovery Phrase Modal */}
      {showRecoveryPhrase && passwordRecoveryPhrase && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-[#70C7BA]/30 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#70C7BA]/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#70C7BA]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Save Your Password Recovery Phrase</h3>
                <p className="text-white/50 text-sm">For resetting transaction password only</p>
              </div>
            </div>
            
            <div className="p-4 bg-[#70C7BA]/10 border border-[#70C7BA]/20 rounded-xl mb-4">
              <p className="text-[#70C7BA] text-sm font-medium mb-2">⚠️ This is NOT your wallet phrase</p>
              <p className="text-[#70C7BA]/80 text-xs">
                Separate 24 words for password reset only. Store both safely.
              </p>
            </div>
            
            <div className="p-4 bg-slate-800 rounded-xl mb-4 font-mono text-sm text-white/90 leading-relaxed">
              {passwordRecoveryPhrase}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleCopyRecoveryPhrase}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                {recoveryPhraseCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {recoveryPhraseCopied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={() => {
                  setShowRecoveryPhrase(false);
                  setPasswordRecoveryPhrase("");
                  toast.success("Transaction password enabled!");
                }}
                className="flex-1 px-4 py-2.5 bg-[#70C7BA] hover:bg-[#49EACB] text-black font-medium rounded-lg transition-colors"
              >
                I've Saved It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
