import { useState } from 'react';
import { X, Users, Plus, Trash2, Check, AlertTriangle, Loader2, Shield, ChevronRight, UserPlus, Key, Clock, CheckCircle2, XCircle, Settings, ExternalLink } from 'lucide-react';

interface MultiSigWalletProps {
  onClose: () => void;
}

type Step = 'overview' | 'create' | 'manage' | 'pending';
type SignerStatus = 'pending' | 'signed' | 'rejected';

interface Signer {
  id: string;
  name: string;
  address: string;
  isOwner: boolean;
}

interface PendingTransaction {
  id: string;
  type: 'send' | 'add_signer' | 'remove_signer' | 'change_threshold';
  amount?: string;
  recipient?: string;
  description: string;
  requiredSignatures: number;
  currentSignatures: number;
  signers: { address: string; status: SignerStatus }[];
  createdAt: string;
  expiresAt: string;
}

interface MultiSigConfig {
  id: string;
  name: string;
  address: string;
  threshold: number;
  signers: Signer[];
  balance: string;
}

export default function MultiSigWallet({ onClose }: MultiSigWalletProps) {
  const [step, setStep] = useState<Step>('overview');
  const [creating, setCreating] = useState(false);
  
  // Create wallet state
  const [walletName, setWalletName] = useState('');
  const [threshold, setThreshold] = useState(2);
  const [signers, setSigners] = useState<{ name: string; address: string }[]>([
    { name: 'Me', address: 'kaspa:qz...' },
    { name: '', address: '' },
  ]);
  
  // Demo multi-sig wallets
  const [multiSigWallets] = useState<MultiSigConfig[]>([]);
  
  // Demo pending transactions
  const [pendingTransactions] = useState<PendingTransaction[]>([]);

  const addSigner = () => {
    if (signers.length < 10) {
      setSigners([...signers, { name: '', address: '' }]);
    }
  };

  const removeSigner = (index: number) => {
    if (index > 0 && signers.length > 2) {
      setSigners(signers.filter((_, i) => i !== index));
    }
  };

  const updateSigner = (index: number, field: 'name' | 'address', value: string) => {
    const updated = [...signers];
    updated[index][field] = value;
    setSigners(updated);
  };

  const handleCreate = async () => {
    setCreating(true);
    
    // Simulate creation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Show coming soon message
    setCreating(false);
    alert('Multi-signature wallet support is coming soon. This preview shows how the setup flow will work.');
  };

  const validSigners = signers.filter(s => s.address.startsWith('kaspa:'));
  const canCreate = walletName.length > 0 && validSigners.length >= 2 && threshold >= 2 && threshold <= validSigners.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Multi-Signature Wallet</h2>
              <p className="text-white/50 text-sm">Shared control for enhanced security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Step */}
        {step === 'overview' && (
          <>
            {/* Info Banner */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">What is a multi-signature wallet?</p>
                  <p className="text-white/60 text-xs mt-1">
                    A multi-sig wallet requires multiple people to approve transactions before they execute. 
                    Perfect for business accounts, shared savings, or added personal security. For example, 
                    a "2-of-3" wallet needs any 2 out of 3 signers to approve each transaction.
                  </p>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-3">
                  <Shield className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-white font-medium text-sm">Enhanced Security</p>
                <p className="text-white/50 text-xs mt-1">No single point of failure. Multiple keys required.</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3">
                  <Users className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-white font-medium text-sm">Shared Control</p>
                <p className="text-white/50 text-xs mt-1">Perfect for teams, families, or organizations.</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mb-3">
                  <Key className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-white font-medium text-sm">Recovery Options</p>
                <p className="text-white/50 text-xs mt-1">Lost one key? Others can still access funds.</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3">
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-white font-medium text-sm">Approval Flow</p>
                <p className="text-white/50 text-xs mt-1">Review and approve transactions before execution.</p>
              </div>
            </div>

            {/* Existing Wallets */}
            {multiSigWallets.length > 0 ? (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-white/80 mb-3">Your Multi-Sig Wallets</h3>
                <div className="space-y-3">
                  {multiSigWallets.map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={() => setStep('manage')}
                      className="w-full p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                            <Users className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{wallet.name}</p>
                            <p className="text-white/50 text-sm">
                              {wallet.threshold} of {wallet.signers.length} signers • {wallet.balance} KAS
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 border-dashed rounded-xl p-8 mb-6 text-center">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-white/40" />
                </div>
                <p className="text-white/60 mb-1">No multi-sig wallets yet</p>
                <p className="text-white/40 text-sm">Create one to get started with shared control</p>
              </div>
            )}

            {/* Pending Transactions */}
            {pendingTransactions.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white/80">Pending Approvals</h3>
                  <button
                    onClick={() => setStep('pending')}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View all
                  </button>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">
                        {pendingTransactions.length} transaction{pendingTransactions.length > 1 ? 's' : ''} awaiting approval
                      </p>
                      <p className="text-white/50 text-xs">Review and sign to proceed</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Create Button */}
            <button
              onClick={() => setStep('create')}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Multi-Sig Wallet
            </button>

            {/* Coming Soon Note */}
            <div className="mt-4 text-center">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs">
                Coming Soon
              </span>
              <p className="text-white/40 text-xs mt-2">
                Multi-signature support is in development. Preview the setup flow now.
              </p>
            </div>
          </>
        )}

        {/* Create Step */}
        {step === 'create' && (
          <>
            <button
              onClick={() => setStep('overview')}
              className="text-white/60 hover:text-white text-sm mb-4 flex items-center gap-1"
            >
              ← Back
            </button>

            <h3 className="text-lg font-semibold text-white mb-4">Create Multi-Sig Wallet</h3>

            {/* Wallet Name */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white/80 mb-2">Wallet Name</label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="e.g., Business Account, Family Savings"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Signers */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white/80">Signers</label>
                <span className="text-xs text-white/50">{signers.length} of 10 max</span>
              </div>
              <div className="space-y-3">
                {signers.map((signer, index) => (
                  <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={signer.name}
                          onChange={(e) => updateSigner(index, 'name', e.target.value)}
                          placeholder="Signer name"
                          disabled={index === 0}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                      </div>
                      {index > 0 && signers.length > 2 && (
                        <button
                          onClick={() => removeSigner(index)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={signer.address}
                      onChange={(e) => updateSigner(index, 'address', e.target.value)}
                      placeholder="kaspa:qz..."
                      disabled={index === 0}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    {index === 0 && (
                      <p className="text-xs text-white/40 mt-2">Your wallet (owner)</p>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                onClick={addSigner}
                disabled={signers.length >= 10}
                className="w-full mt-3 py-3 border border-dashed border-white/20 rounded-xl text-white/60 hover:text-white hover:border-white/40 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Another Signer
              </button>
            </div>

            {/* Threshold */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-white/80 mb-2">
                Required Signatures
              </label>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white/60">Signatures needed to approve</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setThreshold(Math.max(2, threshold - 1))}
                      disabled={threshold <= 2}
                      className="w-8 h-8 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      -
                    </button>
                    <span className="w-16 text-center text-xl font-bold text-white">
                      {threshold} of {validSigners.length || signers.length}
                    </span>
                    <button
                      onClick={() => setThreshold(Math.min(validSigners.length || signers.length, threshold + 1))}
                      disabled={threshold >= (validSigners.length || signers.length)}
                      className="w-8 h-8 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
                
                {/* Visual representation */}
                <div className="flex items-center justify-center gap-2">
                  {Array.from({ length: validSigners.length || signers.length }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        i < threshold
                          ? 'bg-blue-500 text-white'
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {i < threshold ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                  ))}
                </div>
                
                <p className="text-center text-white/50 text-xs mt-3">
                  {threshold} signature{threshold > 1 ? 's' : ''} required out of {validSigners.length || signers.length} signers
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Important</p>
                  <p className="text-white/60 text-xs mt-1">
                    Make sure all signer addresses are correct. Once created, signers can only be changed through a multi-sig transaction approved by existing signers.
                  </p>
                </div>
              </div>
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreate}
              disabled={!canCreate || creating}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Wallet...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create Multi-Sig Wallet
                </>
              )}
            </button>

            {!canCreate && (
              <p className="text-center text-red-400 text-xs mt-2">
                {!walletName ? 'Enter a wallet name' : validSigners.length < 2 ? 'Add at least 2 valid signer addresses' : 'Threshold must be at least 2'}
              </p>
            )}
          </>
        )}

        {/* Manage Step */}
        {step === 'manage' && (
          <>
            <button
              onClick={() => setStep('overview')}
              className="text-white/60 hover:text-white text-sm mb-4 flex items-center gap-1"
            >
              ← Back
            </button>

            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white/60 mb-2">Wallet Management</p>
              <p className="text-white/40 text-sm">Select a wallet from the overview to manage it</p>
            </div>
          </>
        )}

        {/* Pending Transactions Step */}
        {step === 'pending' && (
          <>
            <button
              onClick={() => setStep('overview')}
              className="text-white/60 hover:text-white text-sm mb-4 flex items-center gap-1"
            >
              ← Back
            </button>

            <h3 className="text-lg font-semibold text-white mb-4">Pending Approvals</h3>

            {pendingTransactions.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-white/60 mb-2">All caught up!</p>
                <p className="text-white/40 text-sm">No pending transactions to approve</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-white font-medium">{tx.description}</p>
                        {tx.amount && (
                          <p className="text-xl font-bold text-white mt-1">{tx.amount} KAS</p>
                        )}
                        {tx.recipient && (
                          <p className="text-white/50 text-sm font-mono">{tx.recipient}</p>
                        )}
                      </div>
                      <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                        {tx.currentSignatures}/{tx.requiredSignatures} signed
                      </span>
                    </div>

                    {/* Signer Status */}
                    <div className="flex items-center gap-2 mb-4">
                      {tx.signers.map((signer, i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            signer.status === 'signed'
                              ? 'bg-emerald-500'
                              : signer.status === 'rejected'
                              ? 'bg-red-500'
                              : 'bg-white/10'
                          }`}
                        >
                          {signer.status === 'signed' ? (
                            <Check className="w-4 h-4 text-white" />
                          ) : signer.status === 'rejected' ? (
                            <XCircle className="w-4 h-4 text-white" />
                          ) : (
                            <Clock className="w-4 h-4 text-white/40" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button className="flex-1 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button className="flex-1 py-2 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>

                    <p className="text-xs text-white/40 text-center mt-3">
                      Expires {new Date(tx.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <a
            href="https://kaspa.org/multisig"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Learn more about Kaspa multi-signature wallets
          </a>
        </div>
      </div>
    </div>
  );
}
