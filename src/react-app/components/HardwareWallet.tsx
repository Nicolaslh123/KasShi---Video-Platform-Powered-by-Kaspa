import { useState } from 'react';
import { X, Usb, Bluetooth, Shield, Check, AlertTriangle, Loader2, ExternalLink, RefreshCw, ChevronRight, Unplug } from 'lucide-react';

interface HardwareWalletProps {
  onClose: () => void;
}

type WalletBrand = 'ledger' | 'trezor';
type ConnectionStep = 'select' | 'connect' | 'verify' | 'success';
type ConnectionMethod = 'usb' | 'bluetooth';

interface ConnectedDevice {
  brand: WalletBrand;
  model: string;
  address: string;
  connected: boolean;
}

export default function HardwareWallet({ onClose }: HardwareWalletProps) {
  const [step, setStep] = useState<ConnectionStep>('select');
  const [selectedBrand, setSelectedBrand] = useState<WalletBrand | null>(null);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>('usb');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<ConnectedDevice | null>(null);

  const walletOptions = [
    {
      id: 'ledger' as WalletBrand,
      name: 'Ledger',
      logo: '🔵',
      models: ['Nano S', 'Nano S Plus', 'Nano X', 'Stax'],
      supportsBluetooth: true,
      description: 'Industry-leading security with Secure Element chip',
      status: 'coming-soon' as const,
    },
    {
      id: 'trezor' as WalletBrand,
      name: 'Trezor',
      logo: '⬛',
      models: ['Model One', 'Model T', 'Safe 3'],
      supportsBluetooth: false,
      description: 'Open-source hardware wallet pioneer',
      status: 'coming-soon' as const,
    },
  ];

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    // Simulate connection attempt
    await new Promise(resolve => setTimeout(resolve, 2000));

    // For now, show that this feature is coming soon
    setError('Hardware wallet support is coming soon. This preview shows how the connection flow will work.');
    setConnecting(false);
  };

  const handleDisconnect = () => {
    setConnectedDevice(null);
    setStep('select');
    setSelectedBrand(null);
  };

  const selectedWallet = walletOptions.find(w => w.id === selectedBrand);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Hardware Wallet</h2>
              <p className="text-white/50 text-sm">Enhanced security for your assets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Select Wallet */}
        {step === 'select' && (
          <>
            {/* Connected Device */}
            {connectedDevice && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{connectedDevice.model} Connected</p>
                      <p className="text-emerald-400 text-sm font-mono">{connectedDevice.address}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Unplug className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Info Banner */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Why use a hardware wallet?</p>
                  <p className="text-white/60 text-xs mt-1">
                    Hardware wallets keep your private keys offline, protecting them from hackers, malware, and phishing attacks. Your keys never leave the device.
                  </p>
                </div>
              </div>
            </div>

            {/* Wallet Options */}
            <div className="space-y-3 mb-6">
              <p className="text-sm font-medium text-white/80">Select your hardware wallet</p>
              {walletOptions.map((wallet) => (
                <div
                  key={wallet.id}
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-xl opacity-60 cursor-not-allowed text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-2xl">
                      {wallet.logo}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold">{wallet.name}</p>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-white/50 text-sm mt-0.5">{wallet.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-white/40">Supports:</span>
                        {wallet.models.slice(0, 3).map((model, i) => (
                          <span key={i} className="text-xs text-white/60 bg-white/5 px-2 py-0.5 rounded">
                            {model}
                          </span>
                        ))}
                        {wallet.models.length > 3 && (
                          <span className="text-xs text-white/40">+{wallet.models.length - 3} more</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-white/20" />
                  </div>
                </div>
              ))}
            </div>

            {/* Coming Soon Notice */}
            <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 mb-4">
              <p className="text-white/70 text-sm text-center">
                Hardware wallet integration requires the Kaspa app to be installed on your device. 
                We're working with Ledger and Trezor to bring this feature soon.
              </p>
            </div>

            {/* Help Link */}
            <a
              href="https://kaspa.org/hardware-wallets"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Learn more about hardware wallets for Kaspa
            </a>
          </>
        )}

        {/* Step: Connect */}
        {step === 'connect' && selectedWallet && (
          <>
            <button
              onClick={() => {
                setStep('select');
                setError(null);
              }}
              className="text-white/60 hover:text-white text-sm mb-4 flex items-center gap-1"
            >
              ← Back to wallet selection
            </button>

            {/* Selected Wallet */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xl">
                  {selectedWallet.logo}
                </div>
                <div>
                  <p className="text-white font-semibold">{selectedWallet.name}</p>
                  <p className="text-white/50 text-sm">{selectedWallet.models.join(', ')}</p>
                </div>
              </div>
            </div>

            {/* Connection Method */}
            <div className="mb-6">
              <p className="text-sm font-medium text-white/80 mb-3">Connection method</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConnectionMethod('usb')}
                  className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                    connectionMethod === 'usb'
                      ? 'bg-purple-500/20 border-purple-500'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  <Usb className={`w-6 h-6 ${connectionMethod === 'usb' ? 'text-purple-400' : 'text-white/60'}`} />
                  <div className="text-center">
                    <p className={`font-medium text-sm ${connectionMethod === 'usb' ? 'text-purple-400' : 'text-white'}`}>USB</p>
                    <p className="text-xs text-white/40">Direct connection</p>
                  </div>
                </button>
                <button
                  onClick={() => setConnectionMethod('bluetooth')}
                  disabled={!selectedWallet.supportsBluetooth}
                  className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                    connectionMethod === 'bluetooth'
                      ? 'bg-purple-500/20 border-purple-500'
                      : selectedWallet.supportsBluetooth
                        ? 'bg-white/5 border-white/10 hover:border-white/20'
                        : 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <Bluetooth className={`w-6 h-6 ${connectionMethod === 'bluetooth' ? 'text-purple-400' : 'text-white/60'}`} />
                  <div className="text-center">
                    <p className={`font-medium text-sm ${connectionMethod === 'bluetooth' ? 'text-purple-400' : 'text-white'}`}>Bluetooth</p>
                    <p className="text-xs text-white/40">
                      {selectedWallet.supportsBluetooth ? 'Wireless' : 'Not supported'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 mb-6">
              <p className="text-sm font-medium text-white mb-3">Before connecting:</p>
              <ul className="space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">1.</span>
                  <span>Connect your {selectedWallet.name} to your computer via {connectionMethod === 'usb' ? 'USB cable' : 'Bluetooth'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">2.</span>
                  <span>Unlock your device with your PIN</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-1">3.</span>
                  <span>Open the Kaspa app on your {selectedWallet.name}</span>
                </li>
              </ul>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-200">{error}</p>
                </div>
              </div>
            )}

            {/* Connect Button */}
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Searching for device...
                </>
              ) : (
                <>
                  {connectionMethod === 'usb' ? <Usb className="w-5 h-5" /> : <Bluetooth className="w-5 h-5" />}
                  Connect {selectedWallet.name}
                </>
              )}
            </button>

            {/* Retry hint */}
            {error && (
              <button
                onClick={() => setError(null)}
                className="w-full mt-3 py-2 text-white/60 hover:text-white text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            )}
          </>
        )}

        {/* Step: Success */}
        {step === 'success' && connectedDevice && (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Connected!</h3>
            <p className="text-white/60 mb-6">
              Your {connectedDevice.model} is now linked to Kaspay
            </p>
            
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs text-white/50 mb-1">Hardware wallet address</p>
              <p className="text-[#70C7BA] font-mono text-sm break-all">{connectedDevice.address}</p>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6">
              <p className="text-sm text-emerald-200">
                All transactions will require physical confirmation on your device for maximum security.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] transition-all"
            >
              Done
            </button>
          </div>
        )}

        {/* Security Note */}
        {step !== 'success' && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-xs text-white/40 text-center">
              🔒 Kaspay never has access to your hardware wallet's private keys. All signing happens on-device.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
