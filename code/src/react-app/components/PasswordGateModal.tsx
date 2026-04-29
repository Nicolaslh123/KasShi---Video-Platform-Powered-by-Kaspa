import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Lock, Eye, EyeOff, Loader2, KeyRound, AlertCircle, Smartphone, ArrowLeft } from "lucide-react";
import { usePasswordGate } from "../contexts/PasswordGateContext";
import { useAuth } from "@getmocha/users-service/react";

type ViewMode = "login" | "recover";

export default function PasswordGateModal() {
  const { user, logout } = useAuth();
  const { isPasswordVerified, requiresPasswordOnLogin, isCheckingRequirement } = usePasswordGate();
  
  // Security status
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("login");
  
  // Login inputs
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  
  // Recovery inputs
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // Check if 2FA is also enabled
  useEffect(() => {
    if (!user) return;
    
    const checkStatus = async () => {
      setCheckingStatus(true);
      try {
        const res = await fetch("/api/security/status");
        if (res.ok) {
          const data = await res.json();
          setIs2FAEnabled(!!data.is2FAEnabled);
        }
      } catch (err) {
        console.error("Failed to check 2FA status:", err);
      } finally {
        setCheckingStatus(false);
      }
    };
    
    checkStatus();
  }, [user]);

  // Don't show if no user, checking, already verified, or not required
  if (!user || isCheckingRequirement || checkingStatus || isPasswordVerified || !requiresPasswordOnLogin) {
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your password");
      return;
    }
    if (is2FAEnabled && totpCode.length !== 6) {
      setError("Please enter your 6-digit 2FA code");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/security/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraPassword: password,
          totpCode: is2FAEnabled ? totpCode : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.verified) {
        // Store verification in localStorage with user ID to prevent cross-user issues
        localStorage.setItem("kasshi_password_verified", "true");
        if (user) {
          localStorage.setItem("kasshi_verified_user_id", user.id);
        }
        window.location.reload(); // Reload to update context
      } else {
        setError(data.error || "Verification failed");
      }
    } catch (err) {
      setError("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!recoveryPhrase.trim()) {
      setError("Please enter your 24-word recovery phrase");
      return;
    }
    if (!newPassword.trim()) {
      setError("Please enter a new password");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsRecovering(true);
    setError("");

    try {
      const res = await fetch("/api/security/password/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recoveryPhrase: recoveryPhrase.trim(),
          newPassword: newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setRecoverySuccess(true);
        setRecoveryPhrase("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError(data.error || "Recovery failed");
      }
    } catch (err) {
      setError("Recovery failed");
    } finally {
      setIsRecovering(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
  };

  const switchToRecover = () => {
    setViewMode("recover");
    setError("");
  };

  const switchToLogin = () => {
    setViewMode("login");
    setError("");
    setRecoverySuccess(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-[#70C7BA]/30 rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {viewMode === "login" ? (
          <>
            {/* Logo/Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-[#70C7BA]/10 rounded-full flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-[#70C7BA]" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              {is2FAEnabled ? "Security Verification" : "Password Required"}
            </h2>
            <p className="text-white/60 text-center text-sm mb-6">
              {is2FAEnabled 
                ? "Enter your password and 2FA code to continue" 
                : "Enter your security password to continue to KasShi"}
            </p>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Password Input */}
              <div>
                <label className="text-sm text-white/70 block mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 pr-10 text-white placeholder:text-white/40 focus:outline-none focus:border-[#70C7BA]/50"
                    autoFocus
                    disabled={isVerifying}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 2FA Input - only show if 2FA is enabled */}
              {is2FAEnabled && (
                <div>
                  <label className="text-sm text-white/70 block mb-2 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Two-Factor Authentication Code
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-center text-lg tracking-[0.3em] placeholder:text-white/40 focus:outline-none focus:border-[#70C7BA]/50"
                    disabled={isVerifying}
                    autoComplete="one-time-code"
                  />
                  <p className="text-white/40 text-xs mt-1">
                    Enter the code from your authenticator app
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isVerifying || !password.trim() || (is2FAEnabled && totpCode.length !== 6)}
                className="w-full bg-[#70C7BA] hover:bg-[#49EACB] text-black font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            {/* Forgot password link */}
            <p className="text-center text-white/40 text-sm mt-4">
              Forgot your password?{" "}
              <button
                type="button"
                onClick={switchToRecover}
                className="text-[#70C7BA] hover:underline"
              >
                Recover with phrase
              </button>
            </p>

            {/* Sign out option */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <button
                onClick={handleSignOut}
                className="w-full text-white/50 hover:text-white/70 text-sm transition-colors"
              >
                Sign out and use a different account
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Recovery View */}
            <button
              onClick={switchToLogin}
              className="flex items-center gap-2 text-white/60 hover:text-white mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </button>

            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-[#70C7BA]/10 rounded-full flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-[#70C7BA]" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Recover Password
            </h2>
            <p className="text-white/60 text-center text-sm mb-6">
              Enter your 24-word recovery phrase to reset your password
            </p>

            {recoverySuccess ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Password Reset!</h3>
                <p className="text-white/60 text-sm mb-4">
                  Your password has been successfully reset. You can now log in with your new password.
                </p>
                <button
                  onClick={switchToLogin}
                  className="w-full bg-[#70C7BA] hover:bg-[#49EACB] text-black font-semibold py-3 rounded-lg transition-colors"
                >
                  Log in with new password
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecover} className="space-y-4">
                {/* Recovery Phrase */}
                <div>
                  <label className="text-sm text-white/70 block mb-2">
                    Recovery Phrase (24 words)
                  </label>
                  <textarea
                    value={recoveryPhrase}
                    onChange={(e) => setRecoveryPhrase(e.target.value)}
                    placeholder="Enter your 24-word recovery phrase..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#70C7BA]/50 resize-none"
                    disabled={isRecovering}
                  />
                  <p className="text-white/40 text-xs mt-1">
                    This is the phrase you saved when setting up your password
                  </p>
                </div>

                {/* New Password */}
                <div>
                  <label className="text-sm text-white/70 block mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#70C7BA]/50"
                    disabled={isRecovering}
                  />
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="text-sm text-white/70 block mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#70C7BA]/50"
                    disabled={isRecovering}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isRecovering || !recoveryPhrase.trim() || !newPassword || !confirmPassword}
                  className="w-full bg-[#70C7BA] hover:bg-[#49EACB] text-black font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRecovering ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Recovering...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </form>
            )}

            {/* Sign out option */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <button
                onClick={handleSignOut}
                className="w-full text-white/50 hover:text-white/70 text-sm transition-colors"
              >
                Sign out and use a different account
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
