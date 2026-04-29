import { useState } from "react";
import { X, Flame, Loader2 } from "lucide-react";
import { useWallet } from "../../contexts/WalletContext";
import { usePayment } from "../../hooks/usePayment";
import toast from "react-hot-toast";

interface SuperReactModalProps {
  clipId: number;
  clipTitle?: string;
  artistAddress: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SuperReactModal({
  clipId,
  clipTitle,
  artistAddress,
  isOpen,
  onClose,
  onSuccess,
}: SuperReactModalProps) {
  const { wallet, externalWallet } = useWallet();
  const { pay, canPay } = usePayment();
  const isLoggedIn = !!(wallet?.address || externalWallet?.address);
  
  const [amount, setAmount] = useState(0.5);
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [customAmountInput, setCustomAmountInput] = useState("");

  const amountOptions = [0.11, 0.5, 1, 2, 5, 10];
  
  const handleCustomAmountChange = (value: string) => {
    setCustomAmountInput(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0.11) {
      setAmount(parsed);
    }
  };
  
  const handlePresetClick = (v: number) => {
    setAmount(v);
    setIsCustomAmount(false);
    setCustomAmountInput("");
  };
  
  const handleCustomClick = () => {
    setIsCustomAmount(true);
    setCustomAmountInput(amount.toString());
  };

  const handleSuperReact = async () => {
    if (amount < 0.11) {
      toast.error("Minimum Super React amount is 0.11 KAS");
      return;
    }

    if (!isLoggedIn) {
      toast.error("Please connect your wallet to send a Super React");
      return;
    }

    if (!canPay) {
      toast.error("Wallet not ready for payments");
      return;
    }

    setIsLoading(true);
    try {
      // Process the payment using unified payment system (works with both internal and external wallets)
      const paymentResult = await pay(artistAddress, amount, {
        paymentType: "super-react",
        silent: false,
      });
      
      if (!paymentResult?.success) {
        throw new Error(paymentResult?.error || "Payment failed");
      }

      const txId = paymentResult.transactionId || `super-react-${Date.now()}`;

      // Then record the super react using clip endpoint
      const res = await fetch(`/api/kasshi/clips/${clipId}/super-react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amountKAS: amount,
          commentText: comment.trim() || null,
          isAnonymous,
          transactionId: txId,
        }),
      });

      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to record super react");
      }

      toast.success("🔥 Super React sent! Your comment is now pinned at the top.");

      // Reset form
      setComment("");
      setAmount(0.5);
      setIsAnonymous(false);
      
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Flame className="w-6 h-6 text-orange-500" />
            Super React
          </h2>
          {clipTitle && (
            <p className="text-sm text-slate-400 mt-1">
              On: {clipTitle}
            </p>
          )}
        </div>

        <div className="space-y-5">
          {/* Amount Selection */}
          <div>
            <label className="text-slate-300 text-sm font-medium mb-2 block">
              Amount (min 0.11 KAS)
            </label>
            <div className="flex flex-wrap gap-2">
              {amountOptions.map((v) => (
                <button
                  key={v}
                  onClick={() => handlePresetClick(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    amount === v && !isCustomAmount
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                      : "bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {v} KAS
                </button>
              ))}
              <button
                onClick={handleCustomClick}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isCustomAmount
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                    : "bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Custom
              </button>
            </div>
            {isCustomAmount && (
              <div className="mt-3">
                <div className="relative">
                  <input
                    type="number"
                    value={customAmountInput}
                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                    placeholder="Enter amount"
                    min="0.11"
                    step="0.01"
                    className="w-full bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 rounded-lg px-3 py-2 pr-14 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    KAS
                  </span>
                </div>
                {customAmountInput && parseFloat(customAmountInput) < 0.11 && (
                  <p className="text-xs text-red-400 mt-1">Minimum amount is 0.11 KAS</p>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Higher amounts = higher visibility in the comments
            </p>
          </div>

          {/* Comment Input */}
          <div>
            <label className="text-slate-300 text-sm font-medium mb-2 block">
              Add a comment <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment or just send your support!"
              className="w-full bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 rounded-lg p-3 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              maxLength={500}
            />
            <p className="text-xs text-slate-500 mt-1 text-right">
              {comment.length}/500
            </p>
          </div>

          {/* Anonymous Option */}
          <label className="flex items-center space-x-3 bg-slate-800/50 p-3 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-orange-500 focus:ring-orange-500/50"
            />
            <span className="text-slate-300 text-sm">
              Stay anonymous (your wallet address won't be shown)
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSuperReact}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Flame className="w-4 h-4" />
                Super React {amount} KAS
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
