import { useState, useEffect } from 'react';
import { Star, CheckCircle } from 'lucide-react';
import { AudioTrack } from './AudioPlayer';
import ReviewModal from './ReviewModal';
import { useWallet } from '../contexts/WalletContext';
import LocalizedLink from './LocalizedLink';

interface ReviewButtonProps {
  track: AudioTrack;
  accent?: string;
  className?: string;
}

export default function ReviewButton({ track, accent = '#14b8a6', className = '' }: ReviewButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(track.isReviewed || false);
  const { refreshBalance } = useWallet();
  
  // Sync state when track.isReviewed prop changes (e.g., after reviewedTrackIds loads)
  useEffect(() => {
    setHasReviewed(track.isReviewed || false);
  }, [track.isReviewed]);

  // Show "Reviewed" indicator if already reviewed
  if (hasReviewed) {
    return (
      <LocalizedLink 
        to="/music/library/reviews"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className={`flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors ${className}`}
        title="View your reviews"
      >
        <CheckCircle className="w-3 h-3" />
        <span>Reviewed</span>
      </LocalizedLink>
    );
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all hover:scale-105 ${className}`}
        style={{ 
          backgroundColor: `${accent}20`,
          color: accent,
          border: `1px solid ${accent}40`
        }}
        title="Leave a review"
      >
        <Star className="w-3 h-3" />
        <span>Review</span>
      </button>

      {showModal && (
        <ReviewModal
          track={track}
          onClose={() => setShowModal(false)}
          onSubmitted={() => {
            setHasReviewed(true);
            refreshBalance();
          }}
        />
      )}
    </>
  );
}
