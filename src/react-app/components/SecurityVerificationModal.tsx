import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Shield, Lock, Loader2, Smartphone, AlertCircle } from "lucide-react";
import { useWallet } from "@/react-app/contexts/WalletContext";

interface SecurityStatus {
  is2FAEnabled: boolean;
  isExtraPasswordEnabled: boolean;
  hasViewedMnemonic: boolean;
  isExternalWallet?: boolean;
}

interface SecurityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  transactionType: string; // e.g., "withdrawal", "tip", "membership purchase"
  amount?: number;
}

export function SecurityVerificationModal({
  isOpen,
  onClose,
  onVerified,
  transactionType,
  amount,
}: SecurityVerificationModalProps) {
  const { externalWallet } = useWallet();
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  
  // Input states
  const [totpCode, setTotpCode] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchSecurityStatus();
    }
  }, [isOpen]);

  const fetchSecurityStatus = async () => {
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch("/api/security/status", {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch security status");
      const data = await res.json();
      setSecurityStatus(data);
      
      // If no security features enabled (or external wallet), auto-verify
      if (!data.is2FAEnabled && !data.isExtraPasswordEnabled) {
        onVerified();
      }
    } catch (err) {
      setError("Failed to check security status");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying(true);

    try {
      const res = await fetch("/api/security/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: securityStatus?.is2FAEnabled ? totpCode : undefined,
          extraPassword: securityStatus?.isExtraPasswordEnabled ? password : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      // Success - clear inputs and notify parent
      setTotpCode("");
      setPassword("");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => {
    setTotpCode("");
    setPassword("");
    setError("");
    onClose();
  };

  if (!isOpen) return null;

  const requiresVerification = securityStatus?.is2FAEnabled || securityStatus?.isExtraPasswordEnabled;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Security Verification</h2>
              <p className="text-white/50 text-sm">Confirm your identity</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-3" />
              <p className="text-white/60 text-sm">Checking security settings...</p>
            </div>
          ) : !requiresVerification ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-3" />
              <p className="text-white/60 text-sm">Proceeding...</p>
            </div>
          ) : (
            <>
              {/* Transaction Info */}
              <div className="mb-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                <p className="text-white/70 text-sm">
                  You're about to make a <span className="text-white font-medium">{transactionType}</span>
                  {amount !== undefined && (
                    <span className="text-teal-400 font-medium"> of {amount} KAS</span>
                  )}
                </p>
                <p className="text-white/50 text-xs mt-1">
                  Please verify your identity to continue.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                {/* 2FA Code Input */}
                {securityStatus?.is2FAEnabled && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-white/80 text-sm font-medium">
                      <Smartphone className="w-4 h-4 text-purple-400" />
                      Two-Factor Authentication Code
                    </label>
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      className="w-full bg-slate-800/50 border border-slate-600 focus:border-purple-500 rounded-xl px-4 py-3 text-white text-center text-lg tracking-[0.3em] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      autoFocus={securityStatus.is2FAEnabled}
                      autoComplete="one-time-code"
                    />
                    <p className="text-white/40 text-xs">
                      Enter the code from your authenticator app
                    </p>
                  </div>
                )}

                {/* Password Input */}
                {securityStatus?.isExtraPasswordEnabled && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-white/80 text-sm font-medium">
                      <Lock className="w-4 h-4 text-cyan-400" />
                      Transaction Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your transaction password"
                      className="w-full bg-slate-800/50 border border-slate-600 focus:border-cyan-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                      autoFocus={!securityStatus?.is2FAEnabled}
                      autoComplete="current-password"
                    />
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      verifying ||
                      (securityStatus?.is2FAEnabled && totpCode.length !== 6) ||
                      (securityStatus?.isExtraPasswordEnabled && !password)
                    }
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        Verify & Continue
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// Hook to check if security verification is required
export function useSecurityCheck() {
  const [securityRequired, setSecurityRequired] = useState<boolean | null>(null);
  
  const checkSecurityRequired = async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/security/status");
      if (!res.ok) return false;
      const data = await res.json();
      const required = data.is2FAEnabled || data.isExtraPasswordEnabled;
      setSecurityRequired(required);
      return required;
    } catch {
      return false;
    }
  };

  return { securityRequired, checkSecurityRequired };
}
