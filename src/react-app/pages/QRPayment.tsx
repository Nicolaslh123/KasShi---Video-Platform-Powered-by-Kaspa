import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, QrCode, Camera, Download, Copy, CheckCircle, X } from 'lucide-react';

interface QRPaymentProps {
  onBack: () => void;
  onScanComplete?: (recipient: string, amount: string, currency: string) => void;
}

export default function QRPayment({ onBack, onScanComplete }: QRPaymentProps) {
  const [mode, setMode] = useState<'receive' | 'scan'>('receive');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveCurrency, setReceiveCurrency] = useState('USD');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const userDomain = 'yourname.kas';
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'KAS'];
  
  // Generate QR code data
  const qrData = JSON.stringify({
    recipient: userDomain,
    amount: receiveAmount || '0',
    currency: receiveCurrency,
    type: 'kaspay-payment'
  });
  
  useEffect(() => {
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);
  
  const startScanning = async () => {
    try {
      setScanError(null);
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          try {
            const data = JSON.parse(decodedText);
            if (data.type === 'kaspay-payment' && data.recipient) {
              stopScanning();
              if (onScanComplete) {
                onScanComplete(data.recipient, data.amount, data.currency);
                onBack();
              }
            }
          } catch {
            setScanError('Invalid QR code format');
          }
        },
        () => {
          // Ignore scanning errors (happens constantly while scanning)
        }
      );
      
      setIsScanning(true);
    } catch (error) {
      setScanError('Unable to access camera. Please check permissions.');
      console.error('Scanner error:', error);
    }
  };
  
  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    setIsScanning(false);
  };
  
  const downloadQR = () => {
    const svg = document.getElementById('payment-qr-code');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `kaspay-qr-${userDomain}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };
  
  const copyQRData = async () => {
    await navigator.clipboard.writeText(qrData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#70C7BA] to-[#49EACB] flex items-center justify-center shadow-lg shadow-teal-500/50">
                  <QrCode className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">QR Payments</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Mode Toggle */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => {
              setMode('receive');
              if (isScanning) stopScanning();
            }}
            className={`flex-1 py-4 rounded-lg font-semibold transition-all ${
              mode === 'receive'
                ? 'bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white shadow-lg shadow-teal-500/30'
                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5" />
              Receive Payment
            </div>
          </button>
          <button
            onClick={() => {
              setMode('scan');
              setScanError(null);
            }}
            className={`flex-1 py-4 rounded-lg font-semibold transition-all ${
              mode === 'scan'
                ? 'bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white shadow-lg shadow-teal-500/30'
                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Camera className="w-5 h-5" />
              Scan to Pay
            </div>
          </button>
        </div>

        {/* Receive Mode */}
        {mode === 'receive' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
              <h2 className="text-xl font-bold text-white mb-6">Generate Payment QR Code</h2>
              
              <div className="space-y-6">
                {/* Amount Input */}
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Amount (Optional)
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={receiveAmount}
                      onChange={(e) => setReceiveAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all"
                    />
                    <select
                      value={receiveCurrency}
                      onChange={(e) => setReceiveCurrency(e.target.value)}
                      className="px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#70C7BA] focus:border-transparent transition-all cursor-pointer"
                    >
                      {CURRENCIES.map(curr => (
                        <option key={curr} value={curr} className="bg-slate-900">{curr}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-white/40 mt-2">
                    Leave blank for flexible amount
                  </p>
                </div>
                
                {/* QR Code Display */}
                <div className="bg-white p-8 rounded-2xl flex flex-col items-center">
                  <QRCodeSVG
                    id="payment-qr-code"
                    value={qrData}
                    size={280}
                    level="H"
                    includeMargin={true}
                  />
                  <div className="mt-6 text-center">
                    <p className="text-slate-900 font-bold text-lg mb-1">{userDomain}</p>
                    {receiveAmount && (
                      <p className="text-slate-600 font-semibold">
                        {receiveAmount} {receiveCurrency}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    onClick={downloadQR}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white font-medium rounded-lg hover:bg-white/20 transition-all"
                  >
                    <Download className="w-5 h-5" />
                    Download QR Code
                  </button>
                  <button
                    onClick={copyQRData}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white font-medium rounded-lg hover:bg-white/20 transition-all"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        Copy Data
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-3">How to Use</h3>
              <ul className="space-y-2 text-white/60 text-sm">
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#70C7BA]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#70C7BA] text-xs font-bold">1</span>
                  </div>
                  <span>Set the amount you want to receive (or leave blank for flexible amount)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#70C7BA]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#70C7BA] text-xs font-bold">2</span>
                  </div>
                  <span>Show the QR code to the person who wants to pay you</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#70C7BA]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#70C7BA] text-xs font-bold">3</span>
                  </div>
                  <span>They scan it with Kaspay and the payment details auto-fill</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Scan Mode */}
        {mode === 'scan' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
              <h2 className="text-xl font-bold text-white mb-6">Scan Payment QR Code</h2>
              
              {!isScanning ? (
                <div className="space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-12 text-center">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#70C7BA] to-[#49EACB] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-teal-500/50">
                      <Camera className="w-12 h-12 text-white" />
                    </div>
                    <p className="text-white/60 mb-6">
                      Point your camera at a Kaspay QR code to instantly fill in payment details
                    </p>
                    <button
                      onClick={startScanning}
                      className="px-8 py-4 bg-gradient-to-r from-[#70C7BA] to-[#49EACB] text-white font-semibold rounded-lg shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] transition-all duration-200"
                    >
                      Start Scanning
                    </button>
                  </div>
                  
                  {scanError && (
                    <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-4">
                      <p className="text-red-400 text-sm">{scanError}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
                    <div id="qr-reader" ref={videoContainerRef} className="w-full"></div>
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-0 border-2 border-[#70C7BA]/50 rounded-lg m-8"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="w-64 h-64 border-4 border-[#70C7BA] rounded-lg animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={stopScanning}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500/20 border border-red-400/30 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-all"
                  >
                    <X className="w-5 h-5" />
                    Stop Scanning
                  </button>
                  
                  <p className="text-white/40 text-sm text-center">
                    Position the QR code within the frame to scan
                  </p>
                </div>
              )}
            </div>
            
            {/* Instructions */}
            <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-3">Quick Payment</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Scanning a QR code instantly fills in the recipient's payment address and amount. 
                All you need to do is review and confirm the payment. It's the fastest way to send money on Kaspay.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
