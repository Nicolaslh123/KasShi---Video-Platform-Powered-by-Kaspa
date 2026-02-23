import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, KeyRound } from 'lucide-react';

interface AppLockScreenProps {
  onUnlock: () => void;
  onSetupPassword?: () => void;
  needsSetup?: boolean;
}

export default function AppLockScreen({ onUnlock, onSetupPassword, needsSetup = false }: AppLockScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingUp] = useState(needsSetup);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  // Clear error when password changes
  useEffect(() => {
    setError(null);
  }, [password, confirmPassword]);

  const handleUnlock = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/verify-app-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        onUnlock();
      } else {
        setError(data.error || 'Invalid password');
        setPassword('');
      }
    } catch {
      setError('Failed to verify password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPassword = async () => {
    if (step === 'enter') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      setStep('confirm');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setConfirmPassword('');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/app-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        onUnlock();
      } else {
        setError(data.error || 'Failed to set password');
      }
    } catch {
      setError('Failed to set password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isSettingUp) {
        handleSetupPassword();
      } else {
        handleUnlock();
      }
    }
  };

  if (isSettingUp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 flex items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-[#70C7BA] to-[#49EACB] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {step === 'enter' ? 'Set Up App Password' : 'Confirm Password'}
            </h1>
            <p className="text-white/60 text-sm">
              {step === 'enter' 
                ? 'Add an extra layer of security. You\'ll need this password every time you open Kaspay.'
                : 'Enter your password again to confirm'
              }
            </p>
          </div>

          {/* Progress */}
          <div className="flex gap-2 mb-6">
            <div className={`h-1 flex-1 rounded-full ${step === 'enter' ? 'bg-[#70C7BA]' : 'bg-[#70C7BA]'}`} />
            <div className={`h-1 flex-1 rounded-full ${step === 'confirm' ? 'bg-[#70C7BA]' : 'bg-white/20'}`} />
          </div>

          {/* Password Input */}
          <div className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={step === 'enter' ? password : confirmPassword}
                onChange={(e) => step === 'enter' ? setPassword(e.target.value) : setConfirmPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={step === 'enter' ? 'Create a strong password' : 'Confirm your password'}
                className="w-full px-4 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all pr-12"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {step === 'enter' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-amber-400 text-xs">
                  <strong>Important:</strong> This password cannot be recovered. If you forget it, you'll need to sign out and create a new wallet. Make sure to back up your wallet first!
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              onClick={handleSetupPassword}
              disabled={isLoading || (step === 'enter' ? !password : !confirmPassword)}
              className="w-full py-4 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up...
                </>
              ) : (
                step === 'enter' ? 'Continue' : 'Set Password'
              )}
            </button>

            {step === 'confirm' && (
              <button
                onClick={() => {
                  setStep('enter');
                  setConfirmPassword('');
                }}
                className="w-full py-3 text-white/60 hover:text-white transition-colors text-sm"
              >
                Go back
              </button>
            )}

            {step === 'enter' && onSetupPassword && (
              <button
                onClick={onSetupPassword}
                className="w-full py-3 text-white/60 hover:text-white transition-colors text-sm"
              >
                Skip for now
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 flex items-center justify-center p-4">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-xl">
            <Lock className="w-10 h-10 text-[#70C7BA]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Kaspay is Locked</h1>
          <p className="text-white/60 text-sm">
            Enter your app password to continue
          </p>
        </div>

        {/* Password Input */}
        <div className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your password"
              className="w-full px-4 py-4 pl-12 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all pr-12"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleUnlock}
            disabled={isLoading || !password}
            className="w-full py-4 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Unlocking...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Unlock
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-white/40 text-xs">
            Forgot your password? You'll need to sign out and restore your wallet using your recovery phrase.
          </p>
        </div>
      </div>
    </div>
  );
}
