import { useState } from 'react';
import { 
  Key, Shield, AlertTriangle, Copy, Check, Eye, EyeOff, 
  Download, Lock, ChevronRight, X, FileWarning
} from 'lucide-react';

interface WalletBackupProps {
  walletAddress: string;
  onClose?: () => void;
}

export default function WalletBackup({ walletAddress, onClose }: WalletBackupProps) {
  const [step, setStep] = useState<'warning' | 'verify' | 'reveal'>('warning');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledgedRisks, setAcknowledgedRisks] = useState({
    neverShare: false,
    noRecovery: false,
    myResponsibility: false,
  });

  const allRisksAcknowledged = Object.values(acknowledgedRisks).every(Boolean);

  const handleVerifyPassword = async () => {
    if (password.length < 6) {
      setPasswordError('Please enter your app password');
      return;
    }

    setVerifying(true);
    setPasswordError('');

    try {
      // Verify app password and get private key
      const res = await fetch('/api/wallet/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.privateKey) {
        setPrivateKey(data.privateKey);
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
    if (privateKey) {
      navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleDownload = () => {
    if (privateKey) {
      const content = `KASPAY WALLET BACKUP
====================
Date: ${new Date().toISOString()}
Address: ${walletAddress}

PRIVATE KEY (KEEP SECRET):
${privateKey}

====================
WARNING: Anyone with this private key can access your funds.
Store this file securely and delete it from unsecured locations.
Never share this with anyone.`;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaspay-backup-${walletAddress.slice(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-white/10 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Private Key Backup</h2>
              <p className="text-sm text-white/60">Advanced backup for experts</p>
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
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-400 mb-1">What is a Private Key?</h3>
                  <p className="text-sm text-amber-300/80">
                    Your private key is the cryptographic key that controls your wallet. It's an alternative to the recovery phrase for advanced users who want to import their wallet into other software.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-300/80">
                    <strong className="text-blue-400">Most users don't need this.</strong> Your 12/24 word recovery phrase is the standard backup method and works with any Kaspa wallet. Use this only if you specifically need the raw private key.
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
                    Anyone with your private key can steal all your funds. Never share it with anyone.
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
                  <p className="text-white font-medium">I will NEVER share my private key</p>
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
                  <p className="text-sm text-white/50">If I lose my private key and can't access this device, my funds are gone forever</p>
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
                  <p className="text-sm text-white/50">I understand that Kaspay cannot help if my private key is lost or stolen</p>
                </div>
              </label>
            </div>

            <button
              onClick={() => setStep('verify')}
              disabled={!allRisksAcknowledged}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
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
              <p className="text-sm text-white/60">Verify your identity to view your private key</p>
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

        {/* Step 3: Reveal Key */}
        {step === 'reveal' && privateKey && (
          <div className="p-6 space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <FileWarning className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-300/90">
                  Store this in a secure location. Consider writing it down on paper and keeping it in a safe place.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Your Private Key</label>
              <div className="relative">
                <div className="bg-slate-800/80 border border-white/10 rounded-xl p-4 font-mono text-sm break-all">
                  {showKey ? (
                    <span className="text-white">{privateKey}</span>
                  ) : (
                    <span className="text-white/30">{'•'.repeat(64)}</span>
                  )}
                </div>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4 text-white/60" />
                  ) : (
                    <Eye className="w-4 h-4 text-white/60" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                className="py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
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
                className="py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
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
                <li>• Use a password manager with strong encryption</li>
                <li>• Consider splitting it across multiple secure locations</li>
                <li>• Never store it in plain text on your computer</li>
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
