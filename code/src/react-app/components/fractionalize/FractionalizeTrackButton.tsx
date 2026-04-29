// src/react-app/components/fractionalize/FractionalizeTrackButton.tsx
import { useState } from "react";
import { PieChart, Check } from "lucide-react";
import { FractionalizeModal } from "./FractionalizeModal";

interface FractionalizeTrackButtonProps {
  trackId: number;
  trackTitle?: string;
  trackArtist?: string;
  trackCover?: string | null;
  isFractionalized: boolean;
  ticker?: string | null;
}

export function FractionalizeTrackButton({ 
  trackId, 
  trackTitle,
  trackArtist,
  trackCover,
  isFractionalized,
  ticker
}: FractionalizeTrackButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (isFractionalized) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30">
        <Check className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-sm font-medium text-purple-300">
          Fractionalized{ticker ? ` • $${ticker}` : ''}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200 transition-colors text-sm font-medium"
      >
        <PieChart className="w-4 h-4" />
        Fractionalize this track
      </button>

      <FractionalizeModal
        trackId={trackId}
        trackTitle={trackTitle}
        trackArtist={trackArtist}
        trackCover={trackCover}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
