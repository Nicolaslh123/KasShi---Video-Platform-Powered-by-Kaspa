import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, Coins, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { AudioTrack } from './AudioPlayer';
import { useWallet } from '../contexts/WalletContext';

interface ReviewModalProps {
  track: AudioTrack;
  onClose: () => void;
  onSubmitted?: () => void;
}

interface EligibilityResponse {
  eligible: boolean;
  reason?: string;
  reviewsToday: number;
  maxReviewsPerDay: number;
  nextRewardKas: number;
  alreadyReviewed?: boolean;
}

export default function ReviewModal({ track, onClose, onSubmitted }: ReviewModalProps) {
  const { externalWallet } = useWallet();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [earnedReward, setEarnedReward] = useState<number>(0);

  // Get auth token for API calls
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (externalWallet?.authToken) {
      headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
    }
    return headers;
  }, [externalWallet]);

  // Check eligibility on mount
  useEffect(() => {
    const checkEligibility = async () => {
      setIsCheckingEligibility(true);
      try {
        const res = await fetch('/api/music/reviews/eligibility', {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setEligibility(data);
          
          // Also check if already reviewed this track
          const checkRes = await fetch(`/api/music/reviews/check/${track.id}`, {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.hasReviewed) {
              setEligibility(prev => prev ? { ...prev, alreadyReviewed: true, eligible: false, reason: 'You already reviewed this track' } : null);
            }
          }
        } else {
          setError('Unable to check review eligibility');
        }
      } catch (err) {
        console.error('Error checking eligibility:', err);
        setError('Unable to check review eligibility');
      } finally {
        setIsCheckingEligibility(false);
      }
    };
    
    checkEligibility();
  }, [track.id, getAuthHeaders]);

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    
    if (!comment.trim()) {
      setError('Please write a comment');
      return;
    }
    
    if (comment.trim().length < 10) {
      setError('Comment must be at least 10 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/music/tracks/${track.id}/review`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          rating,
          comment: comment.trim() || null,
        }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        setSuccess(true);
        setEarnedReward(data.rewardKas || 0);
        onSubmitted?.();
        // Auto close after 3 seconds
        setTimeout(() => onClose(), 3000);
      } else {
        setError(data.error || 'Failed to submit review');
      }
    } catch (err) {
      console.error('Error submitting review:', err);
      setError('Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoveredRating || rating;

  // Use portal to render at document body level, avoiding parent overflow/z-index issues
  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div 
        className="relative w-full max-w-md bg-gradient-to-b from-zinc-900 to-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-4">
            {track.coverArtUrl ? (
              <img
                src={track.coverArtUrl}
                alt={track.title}
                className="w-16 h-16 rounded-lg object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center">
                <Star className="w-8 h-8 text-white/30" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white truncate">{track.title}</h3>
              <p className="text-sm text-white/60 truncate">{track.artist}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {isCheckingEligibility ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
              <p className="mt-3 text-white/60">Checking eligibility...</p>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-teal-400" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">Review Submitted!</h4>
              {earnedReward > 0 && (
                <div className="flex items-center gap-2 text-teal-400">
                  <Coins className="w-5 h-5" />
                  <span className="font-medium">+{earnedReward} KAS earned</span>
                </div>
              )}
            </div>
          ) : !eligibility?.eligible ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
                <AlertCircle className="w-10 h-10 text-amber-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">
                {eligibility?.alreadyReviewed ? 'Already Reviewed' : 'Review Limit Reached'}
              </h4>
              <p className="text-center text-white/60">
                {eligibility?.reason || 'You cannot submit a review at this time.'}
              </p>
              {eligibility && !eligibility.alreadyReviewed && (
                <p className="mt-2 text-sm text-white/40">
                  Reviews today: {eligibility.reviewsToday}/{eligibility.maxReviewsPerDay}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Reward banner */}
              <div className="mb-6 p-3 rounded-xl bg-gradient-to-r from-teal-500/20 to-emerald-500/20 border border-teal-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-teal-400" />
                    <span className="text-white/80">Earn for this review:</span>
                  </div>
                  <span className="font-semibold text-teal-400">{eligibility.nextRewardKas} KAS</span>
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Reviews today: {eligibility.reviewsToday}/{eligibility.maxReviewsPerDay}
                </p>
              </div>

              {/* Star rating */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-white/70 mb-3">Your Rating</label>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-10 h-10 transition-colors ${
                          star <= displayRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-white/20'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Comment <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your thoughts about this track..."
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 resize-none focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50"
                />
                <p className="mt-1 text-xs text-white/40 text-right">{comment.length}/500</p>
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || rating === 0 || comment.trim().length < 10}
                className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Star className="w-5 h-5" />
                    Submit Review
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
