import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, User, Music2 } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import AnimatedBackground from '../components/AnimatedBackground';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import LocalizedLink from '../components/LocalizedLink';

interface Review {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: {
    profileId: number | null;
    name: string;
    handle: string | null;
    avatarUrl: string | null;
  };
}

interface TrackInfo {
  id: number;
  title: string;
  artist: string;
  coverArtUrl: string | null;
}

export default function TrackReviews() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const { theme } = useMusicTheme();
  const { titleBarPadding } = useElectronTitleBar();
  
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trackInfo, setTrackInfo] = useState<TrackInfo | null>(null);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch track info
        const trackRes = await fetch(`/api/music/tracks/${trackId}`);
        if (trackRes.ok) {
          const trackData = await trackRes.json();
          setTrackInfo({
            id: trackData.id,
            title: trackData.title,
            artist: trackData.artist,
            coverArtUrl: trackData.coverArtUrl
          });
        }
        
        // Fetch reviews
        const reviewsRes = await fetch(`/api/music/tracks/${trackId}/reviews`);
        if (reviewsRes.ok) {
          const reviewsData = await reviewsRes.json();
          setReviews(reviewsData.reviews);
          setAverageRating(reviewsData.averageRating);
          setTotalReviews(reviewsData.totalReviews);
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [trackId]);
  
  const renderStars = (rating: number, size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={sizeClass}
            fill={star <= rating ? theme.accent : 'transparent'}
            color={star <= rating ? theme.accent : 'rgba(255,255,255,0.3)'}
          />
        ))}
      </div>
    );
  };
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  return (
    <div className="min-h-screen relative" style={{ paddingTop: titleBarPadding }}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/70 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Track Info */}
            {trackInfo && (
              <div className="flex items-center gap-4 mb-8 p-4 rounded-xl bg-black/30 backdrop-blur-sm border border-white/10">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
                  {trackInfo.coverArtUrl ? (
                    <img src={trackInfo.coverArtUrl} alt={trackInfo.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music2 className="w-8 h-8 text-white/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-white truncate">{trackInfo.title}</h1>
                  <p className="text-white/60 truncate">{trackInfo.artist}</p>
                </div>
              </div>
            )}
            
            {/* Rating Summary */}
            <div className="flex items-center gap-4 mb-8 p-6 rounded-xl bg-black/30 backdrop-blur-sm border border-white/10">
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-1">
                  {averageRating > 0 ? averageRating.toFixed(1) : '—'}
                </div>
                {renderStars(Math.round(averageRating), 'lg')}
              </div>
              <div className="h-12 w-px bg-white/10" />
              <div className="text-white/70">
                <span className="text-white font-semibold">{totalReviews}</span> {totalReviews === 1 ? 'review' : 'reviews'}
              </div>
            </div>
            
            {/* Reviews List */}
            {reviews.length === 0 ? (
              <div className="text-center py-12 text-white/50">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No reviews yet</p>
                <p className="text-sm mt-1">Be the first to review this track!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="p-4 rounded-xl bg-black/30 backdrop-blur-sm border border-white/10"
                  >
                    <div className="flex items-start gap-3">
                      {review.reviewer.profileId ? (
                        <LocalizedLink to={`/music/artist/${review.reviewer.profileId}`} className="w-10 h-10 rounded-full overflow-hidden bg-black/40 flex-shrink-0 hover:ring-2 hover:ring-white/30 transition-all">
                          {review.reviewer.avatarUrl ? (
                            <img src={review.reviewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="w-5 h-5 text-white/30" />
                            </div>
                          )}
                        </LocalizedLink>
                      ) : (
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-black/40 flex-shrink-0">
                          {review.reviewer.avatarUrl ? (
                            <img src={review.reviewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="w-5 h-5 text-white/30" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {review.reviewer.profileId ? (
                            <LocalizedLink to={`/music/artist/${review.reviewer.profileId}`} className="font-medium text-white hover:underline">
                              {review.reviewer.name}
                            </LocalizedLink>
                          ) : (
                            <span className="font-medium text-white">{review.reviewer.name}</span>
                          )}
                          {review.reviewer.handle && (
                            review.reviewer.profileId ? (
                              <LocalizedLink to={`/music/artist/${review.reviewer.profileId}`} className="text-white/40 text-sm hover:text-white/60">
                                @{review.reviewer.handle}
                              </LocalizedLink>
                            ) : (
                              <span className="text-white/40 text-sm">@{review.reviewer.handle}</span>
                            )
                          )}
                          <span className="text-white/30 text-sm">•</span>
                          <span className="text-white/40 text-sm">{formatDate(review.createdAt)}</span>
                        </div>
                        <div className="mt-1">
                          {renderStars(review.rating)}
                        </div>
                        {review.comment && (
                          <p className="mt-2 text-white/80 text-sm whitespace-pre-wrap">{review.comment}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
