import { Zap } from 'lucide-react';

interface ConversionPreviewProps {
  amount: string;
  recipientName?: string;
  showFlow?: boolean;
}

export default function ConversionPreview({
  amount,
  recipientName = 'Recipient',
  showFlow = false,
}: ConversionPreviewProps) {
  const numAmount = parseFloat(amount) || 0;
  if (numAmount === 0) return null;

  // Simple view (no technical details)
  if (!showFlow) {
    return (
      <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#70C7BA]/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#70C7BA]" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold">{recipientName} will receive</p>
            <p className="text-2xl font-bold text-[#70C7BA]">{numAmount.toFixed(4)} KAS</p>
          </div>
        </div>
        <p className="text-xs text-white/40 mt-3 flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Direct L1 transfer • Instant • Pure crypto
        </p>
      </div>
    );
  }

  // Technical flow view
  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-r from-[#70C7BA]/10 to-[#49EACB]/10 border border-[#70C7BA]/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-white/60 font-medium">Transaction Flow:</p>
        </div>
        <div className="space-y-2">
          <FlowStep number={1} title={`Send ${numAmount.toFixed(4)} KAS directly`} subtitle="No conversion needed" />
          <FlowStep number={2} title="Broadcast to Kaspa network" subtitle="Ultra-fast L1 blockchain" />
          <FlowStep number={3} title={`${recipientName} receives ${numAmount.toFixed(4)} KAS`} subtitle="Pure crypto transfer" />
        </div>
      </div>
      <p className="text-xs text-white/40 text-center">
        Direct L1 transaction with no intermediary conversions
      </p>
    </div>
  );
}

function FlowStep({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#70C7BA]/20 flex items-center justify-center text-xs font-bold text-[#70C7BA]">
        {number}
      </div>
      <div className="flex-1">
        <p className="text-sm text-white">{title}</p>
        <p className="text-xs text-white/40">{subtitle}</p>
      </div>
    </div>
  );
}
