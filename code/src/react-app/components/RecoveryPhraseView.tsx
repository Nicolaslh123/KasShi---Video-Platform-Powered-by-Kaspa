import { useState } from 'react';
import { 
  Shield, AlertTriangle, Copy, Check, Eye, EyeOff, 
  Lock, ChevronRight, X, Download
} from 'lucide-react';

interface RecoveryPhraseViewProps {
  walletAddress: string;
  onClose?: () => void;
}

export default function RecoveryPhraseView({ walletAddress, onClose }: RecoveryPhraseViewProps) {
  const [step, setStep] = useState<'warning' | 'verify' | 'reveal'>('warning');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[] | null>(null);
  const [showPhrase, setShowPhrase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledgedRisks, setAcknowledgedRisks] = useState({
    neverShare: false,
    noRecovery: false,
    myResponsibility: false,
  });

  const allRisksAcknowledged = Object.values(acknowledgedRisks).every(Boolean);
  const wordCount = recoveryPhrase?.length || 0;

  const handleVerifyPassword = async () => {
    if (password.length < 6) {
      setPasswordError('Please enter your app password');
      return;
    }

    setVerifying(true);
    setPasswordError('');

    try {
      const res = await fetch('/api/wallet/export-recovery-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.mnemonic) {
        setRecoveryPhrase(data.mnemonic.split(' '));
        setStep('reveal');
      } else {
        setPasswordError(data.error || 'Invalid password');
      }
    } catch (err) {
      setPasswordError('Failed to verify password');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopy = () => {
    if (recoveryPhrase) {
      navigator.clipboard.writeText(recoveryPhrase.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownload = () => {
    if (recoveryPhrase) {
      const content = `KASPAY WALLET RECOVERY PHRASE
=============================
Date: ${new Date().toISOString()}
Address: ${walletAddress}
Word Count: ${wordCount} words

RECOVERY PHRASE (KEEP SECRET):
${recoveryPhrase.map((word, i) => `${i + 1}. ${word}`).join('\n')}

=============================
WARNING: Anyone with these words can access your funds.
Store this securely OFFLINE and delete it from unsecured locations.
Never share this with anyone - not even Kaspay support.`;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaspay-recovery-phrase-${walletAddress.slice(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-white/10 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#70C7BA] to-[#49EACB] flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Recovery Phrase</h2>
              <p className="text-sm text-white/60">Your wallet backup words</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          )}
        </div>

        {/* Step 1: Warning */}
        {step === 'warning' && (
          <div className="p-6 space-y-6">
            <div className="bg-[#70C7BA]/10 border border-[#70C7BA]/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#70C7BA] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-[#70C7BA] mb-1">What is a Recovery Phrase?</h3>
                  <p className="text-sm text-[#70C7BA]/80">
                    Your recovery phrase (also called seed phrase or mnemonic) is a series of {wordCount || '12 or 24'} words 
                    that can restore your wallet on any device. It's the master key to your funds.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-400 mb-1">Critical Security Warning</h3>
                  <p className="text-sm text-red-300/80">
                    Anyone with your recovery phrase can steal all your funds. Never share it with anyone, 
                    never enter it on any website, and never store it digitally.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={acknowledgedRisks.neverShare}
                  onChange={(e) => setAcknowledgedRisks(prev => ({ ...prev, neverShare: e.target.checked }))}
                  className="mt-1 w-4 h-4 rounded border-white/30 bg-white/10 text-[#70C7BA] focus:ring-[#70C7BA]"
                />
                <div>
                  <p className="text-white font-medium">I will NEVER share my recovery phrase</p>
                  <p className="text-sm text-white/50">Not with support, not with friends, not with anyone</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={acknowledgedRisks.noRecovery}
                  onChange={(e) => setAcknowledgedRisks(prev => ({ ...prev, noRecovery: e.target.checked }))}
                  className="mt-1 w-4 h-4 rounded border-white/30 bg-white/10 text-[#70C7BA] focus:ring-[#70C7BA]"
                />
                <div>
                  <p className="text-white font-medium">I understand there's no recovery</p>
                  <p className="text-sm text-white/50">If I lose my recovery phrase and can't access this device, my funds are gone forever</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={acknowledgedRisks.myResponsibility}
                  onChange={(e) => setAcknowledgedRisks(prev => ({ ...prev, myResponsibility: e.target.checked }))}
                  className="mt-1 w-4 h-4 rounded border-white/30 bg-white/10 text-[#70C7BA] focus:ring-[#70C7BA]"
                />
                <div>
                  <p className="text-white font-medium">I take full responsibility</p>
                  <p className="text-sm text-white/50">I understand that Kaspay cannot help if my recovery phrase is lost or stolen</p>
                </div>
              </label>
            </div>

            <button
              onClick={() => setStep('verify')}
              disabled={!allRisksAcknowledged}
              className="w-full py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
            >
              I Understand, Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step 2: Verify Password */}
        {step === 'verify' && (
          <div className="p-6 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#70C7BA] to-[#49EACB] flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Enter Your App Password</h3>
              <p className="text-sm text-white/60">Verify your identity to view your recovery phrase</p>
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your app password"
                className="w-full py-4 px-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVerifyPassword();
                  }
                }}
              />
              {passwordError && (
                <p className="text-red-400 text-sm text-center mt-2">{passwordError}</p>
              )}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-white/60 text-sm text-center">
                This is the password you set up after logging in with Google. It's different from your Google password.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('warning')}
                className="flex-1 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleVerifyPassword}
                disabled={password.length < 6 || verifying}
                className="flex-1 py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
              >
                {verifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Reveal Phrase */}
        {step === 'reveal' && recoveryPhrase && (
          <div className="p-6 space-y-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300/90">
                  <strong>Write these words down on paper NOW.</strong> Never screenshot, email, or store digitally. 
                  Anyone with these words can steal your funds.
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-white/60">
                  Your {wordCount}-Word Recovery Phrase
                </label>
                <button
                  onClick={() => setShowPhrase(!showPhrase)}
                  className="text-sm text-[#70C7BA] hover:text-[#49EACB] transition-colors flex items-center gap-1"
                >
                  {showPhrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showPhrase ? 'Hide' : 'Show'}
                </button>
              </div>
              
              <div className="bg-slate-800/80 border border-white/10 rounded-xl p-4">
                {showPhrase ? (
                  <div className={`grid ${wordCount === 24 ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                    {recoveryPhrase.map((word, index) => (
                      <div
                        key={index}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 flex items-center gap-1.5"
                      >
                        <span className="text-xs text-white/40 w-5">{index + 1}.</span>
                        <span className="text-white font-mono text-sm">{word}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Eye className="w-8 h-8 text-white/40" />
                    <span className="text-white/60">Click "Show" to reveal your phrase</span>
                    <span className="text-white/40 text-sm">Make sure no one is watching</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                disabled={!showPhrase}
                className="py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                disabled={!showPhrase}
                className="py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#70C7BA]" />
                Backup Tips
              </h4>
              <ul className="text-sm text-white/60 space-y-1">
                <li>• Write it down on paper and store in a safe</li>
                <li>• Consider a metal backup for fire/water resistance</li>
                <li>• Keep multiple copies in different secure locations</li>
                <li>• Never store it digitally or in the cloud</li>
                <li>• Never take a screenshot or photo</li>
              </ul>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="w-full py-3 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] transition-all"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
