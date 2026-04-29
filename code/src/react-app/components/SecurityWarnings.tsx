import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, X, Key, ChevronRight } from 'lucide-react';

interface BackupReminderProps {
  onBackupClick: () => void;
  onDismiss: () => void;
}

export function BackupReminder({ onBackupClick, onDismiss }: BackupReminderProps) {
  return (
    <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-xl p-4 mb-6 animate-in slide-in-from-top duration-300">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Key className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="font-semibold text-amber-200">Back Up Your Wallet</h4>
              <p className="text-sm text-amber-200/70 mt-1">
                Your wallet isn't backed up yet. If you lose access to this device, your funds will be lost forever.
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 text-amber-400/60 hover:text-amber-400 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={onBackupClick}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-200 text-sm font-medium transition-all"
          >
            <Shield className="w-4 h-4" />
            Back Up Now
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface TransactionWarningProps {
  amount: string;
  currency: string;
  recipient: string;
  onProceed: () => void;
  onCancel: () => void;
}

export function TransactionWarning({ amount, currency, recipient, onProceed, onCancel }: TransactionWarningProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Confirm Transaction</h3>
            <p className="text-sm text-white/60">Please review carefully</p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/60">Amount</span>
              <span className="text-white font-semibold">{amount} {currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">To</span>
              <span className="text-white font-mono text-xs truncate max-w-[200px]">{recipient}</span>
            </div>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300 font-medium">This transaction is irreversible</p>
              <ul className="text-xs text-red-300/70 mt-2 space-y-1">
                <li>• Double-check the recipient address</li>
                <li>• Funds sent to a wrong address cannot be recovered</li>
                <li>• We cannot reverse or cancel transactions</li>
              </ul>
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-white/30 bg-white/10 text-[#70C7BA] focus:ring-[#70C7BA] focus:ring-offset-0 focus:ring-offset-slate-900"
          />
          <span className="text-sm text-white/70">
            I have verified the recipient address and understand this transaction cannot be undone
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-white/5 border border-white/10 text-white rounded-lg font-medium hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            disabled={!acknowledged}
            className="flex-1 py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal-500/30 transition-all"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

interface FirstTimeWarningProps {
  onContinue: () => void;
}

export function FirstTimeWarning({ onContinue }: FirstTimeWarningProps) {
  const [step, setStep] = useState(0);
  const [acknowledged, setAcknowledged] = useState([false, false, false]);

  const warnings = [
    {
      icon: Key,
      title: "You Control Your Keys",
      description: "This is a self-custody wallet. You—and only you—have access to your private keys and funds. We cannot recover your wallet if you lose access.",
      highlight: "No one can help you recover lost keys",
    },
    {
      icon: AlertTriangle,
      title: "Transactions Are Permanent",
      description: "Blockchain transactions cannot be reversed, cancelled, or refunded. Always double-check addresses before sending.",
      highlight: "Wrong address = Lost funds forever",
    },
    {
      icon: Shield,
      title: "Security Is Your Responsibility",
      description: "Never share your private key or recovery phrase. We will never ask for them. Anyone who does is trying to steal your funds.",
      highlight: "Never share your private key with anyone",
    },
  ];

  const handleAcknowledge = (index: number) => {
    const newAck = [...acknowledged];
    newAck[index] = !newAck[index];
    setAcknowledged(newAck);
  };

  const canProceed = acknowledged[step];
  const isLastStep = step === warnings.length - 1;
  const allAcknowledged = acknowledged.every(a => a);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {warnings.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-[#70C7BA]' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-red-500/20 flex items-center justify-center mb-4">
            {(() => {
              const Icon = warnings[step].icon;
              return <Icon className="w-8 h-8 text-amber-400" />;
            })()}
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{warnings[step].title}</h2>
          <p className="text-white/60 text-sm leading-relaxed">{warnings[step].description}</p>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-300 text-sm font-medium text-center">
            ⚠️ {warnings[step].highlight}
          </p>
        </div>

        <label className="flex items-center gap-3 mb-6 cursor-pointer justify-center">
          <input
            type="checkbox"
            checked={acknowledged[step]}
            onChange={() => handleAcknowledge(step)}
            className="w-5 h-5 rounded border-white/30 bg-white/10 text-[#70C7BA] focus:ring-[#70C7BA]"
          />
          <span className="text-sm text-white/70">I understand and accept this risk</span>
        </label>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-lg font-medium hover:bg-white/10 transition-all"
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (isLastStep && allAcknowledged) {
                onContinue();
              } else if (canProceed) {
                setStep(step + 1);
              }
            }}
            disabled={!canProceed}
            className="flex-1 py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal-500/30 transition-all"
          >
            {isLastStep ? 'Get Started' : 'Continue'}
          </button>
        </div>

        <p className="text-xs text-white/40 text-center mt-4">
          Step {step + 1} of {warnings.length}
        </p>
      </div>
    </div>
  );
}

interface PhishingWarningBannerProps {
  onDismiss: () => void;
}

export function PhishingWarningBanner({ onDismiss }: PhishingWarningBannerProps) {
  return (
    <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border-b border-red-500/30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-200">
            <span className="font-semibold">Security reminder:</span> We will never ask for your private key or PIN. 
            <a href="#" className="underline ml-1 hover:text-red-100">Learn about phishing</a>
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Hook to manage security warning states
export function useSecurityWarnings() {
  const [hasBackedUp, setHasBackedUp] = useState(true);
  const [showFirstTimeWarning, setShowFirstTimeWarning] = useState(false);
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [phishingDismissed, setPhishingDismissed] = useState(false);

  useEffect(() => {
    // Check if user has seen first-time security warning
    const hasSeenSecurityWarning = localStorage.getItem('kaspay_security_warning_seen');
    if (!hasSeenSecurityWarning) {
      // Only show after onboarding is complete
      const hasSeenOnboarding = localStorage.getItem('kaspay_onboarding_complete');
      if (hasSeenOnboarding) {
        setShowFirstTimeWarning(true);
      }
    }

    // Check backup status from API
    const checkBackupStatus = async () => {
      try {
        const res = await fetch('/api/wallet/has-pin');
        if (res.ok) {
          const data = await res.json();
          setHasBackedUp(data.hasPin);
        }
      } catch {
        // Assume backed up if we can't check
      }
    };
    checkBackupStatus();

    // Check if phishing banner was dismissed today
    const phishingDismissedAt = localStorage.getItem('kaspay_phishing_dismissed');
    if (phishingDismissedAt) {
      const dismissedDate = new Date(phishingDismissedAt);
      const now = new Date();
      // Show again after 7 days
      if (now.getTime() - dismissedDate.getTime() < 7 * 24 * 60 * 60 * 1000) {
        setPhishingDismissed(true);
      }
    }
  }, []);

  const dismissFirstTimeWarning = () => {
    localStorage.setItem('kaspay_security_warning_seen', 'true');
    setShowFirstTimeWarning(false);
  };

  const dismissBackupReminder = () => {
    setBackupDismissed(true);
    // Re-show after 24 hours
    setTimeout(() => setBackupDismissed(false), 24 * 60 * 60 * 1000);
  };

  const dismissPhishing = () => {
    localStorage.setItem('kaspay_phishing_dismissed', new Date().toISOString());
    setPhishingDismissed(true);
  };

  return {
    hasBackedUp,
    showBackupReminder: !hasBackedUp && !backupDismissed,
    showFirstTimeWarning,
    showPhishingBanner: !phishingDismissed,
    dismissFirstTimeWarning,
    dismissBackupReminder,
    dismissPhishing,
    refreshBackupStatus: async () => {
      try {
        const res = await fetch('/api/wallet/has-pin');
        if (res.ok) {
          const data = await res.json();
          setHasBackedUp(data.hasPin);
        }
      } catch {}
    },
  };
}
