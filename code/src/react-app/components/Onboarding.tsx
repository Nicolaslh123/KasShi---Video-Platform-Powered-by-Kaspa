import { useState } from 'react';
import { ArrowRight, Send, Wallet, Zap, Shield, Key, AlertTriangle } from 'lucide-react';
import RecoveryPhraseSetup from './RecoveryPhraseSetup';

interface OnboardingProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: Wallet,
    title: 'Your Wallet is Ready',
    description: 'You already have a Kaspa wallet address. You can send and receive money right away.',
    highlight: 'No setup needed',
  },
  {
    icon: Key,
    title: 'Back Up Your Wallet',
    description: 'Write down your recovery phrase now. This is the ONLY way to recover your funds if you lose access to your Google account.',
    highlight: 'Required for security',
  },
  {
    icon: Send,
    title: 'Send KAS Instantly',
    description: 'Enter a .kas domain, @username, or wallet address and send. Pure crypto, no conversions.',
    highlight: 'Direct blockchain transfers',
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showRecoverySetup, setShowRecoverySetup] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);

  const handleNext = () => {
    // Step 1 (index 1) is the security step - go directly to recovery phrase setup
    if (currentStep === 1 && !recoveryComplete) {
      setShowRecoverySetup(true);
      return;
    }
    
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleRecoveryComplete = async (phrase: string) => {
    // Store the recovery phrase with the wallet
    try {
      await fetch('/api/wallet/recovery-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase }),
      });
    } catch (err) {
      console.error('Failed to store recovery phrase:', err);
    }
    
    setShowRecoverySetup(false);
    setRecoveryComplete(true);
    // Move to next step after recovery is complete
    setCurrentStep(currentStep + 1);
  };



  const step = STEPS[currentStep];
  const StepIcon = step.icon;

  // Show recovery phrase setup if triggered - NO SKIP OPTION
  if (showRecoverySetup) {
    return (
      <RecoveryPhraseSetup
        onComplete={handleRecoveryComplete}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-8 shadow-2xl relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#70C7BA]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#49EACB]/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        


        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8 relative z-10">
          {STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'w-8 bg-[#70C7BA]'
                  : index < currentStep
                  ? 'w-4 bg-[#70C7BA]/50'
                  : 'w-4 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="relative z-10 mb-6">
          <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center shadow-lg ${
            currentStep === 1 
              ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30'
              : 'bg-gradient-to-br from-[#70C7BA] to-[#49EACB] shadow-teal-500/30'
          }`}>
            <StepIcon className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-3">{step.title}</h2>
          <p className="text-white/60 mb-4 leading-relaxed">{step.description}</p>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
            currentStep === 1
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-[#70C7BA]/10 border-[#70C7BA]/30'
          }`}>
            {currentStep === 1 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <Zap className="w-4 h-4 text-[#70C7BA]" />
            )}
            <span className={`text-sm font-medium ${currentStep === 1 ? 'text-amber-400' : 'text-[#70C7BA]'}`}>
              {step.highlight}
            </span>
          </div>
        </div>

        {/* Security step extra warning */}
        {currentStep === 1 && !recoveryComplete && (
          <div className="relative z-10 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
            <p className="text-amber-300/90 text-sm text-center">
              ⚠️ Your recovery phrase is your only backup if you ever lose Google access. Take 2 minutes to write it down now.
            </p>
          </div>
        )}

        {/* Recovery complete badge */}
        {currentStep === 1 && recoveryComplete && (
          <div className="relative z-10 bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
            <p className="text-green-400 text-sm text-center flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" />
              Recovery phrase saved! Your wallet is secured.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="relative z-10 space-y-3">
          <button
            onClick={handleNext}
            className={`w-full py-3.5 font-semibold rounded-xl shadow-lg hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2 ${
              currentStep === 1
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/30 hover:shadow-amber-500/50'
                : 'bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white shadow-teal-500/30 hover:shadow-teal-500/50'
            }`}
          >
            {currentStep === 1 && !recoveryComplete ? (
              <>
                <Key className="w-5 h-5" />
                Create Recovery Phrase
              </>
            ) : currentStep < STEPS.length - 1 ? (
              <>
                Next
                <ArrowRight className="w-5 h-5" />
              </>
            ) : (
              <>
                Get Started
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
          
          {currentStep < STEPS.length - 1 && currentStep !== 1 && (
            <button
              onClick={() => {
                if (currentStep < STEPS.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else {
                  onComplete();
                }
              }}
              className="w-full py-3 text-white/40 hover:text-white/60 font-medium transition-colors text-sm"
            >
              Skip to next step
            </button>
          )}
        </div>

        {/* Security badge */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/10 flex items-center justify-center gap-2 text-white/40 text-xs">
          <Shield className="w-4 h-4" />
          <span>Secured by Kaspa blockchain</span>
        </div>
      </div>
    </div>
  );
}
