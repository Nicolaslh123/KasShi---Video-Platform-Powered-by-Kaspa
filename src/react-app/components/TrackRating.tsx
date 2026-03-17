import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMusicTheme } from '../contexts/MusicThemeContext';

interface TrackRatingProps {
  trackId: number;
  averageRating?: number | null;
  reviewCount?: number;
  size?: 'sm' | 'md';
}

export function TrackRating({ trackId, averageRating, reviewCount = 0, size = 'sm' }: TrackRatingProps) {
  const navigate = useNavigate();
  const { theme } = useMusicTheme();
  
  // Don't show if no reviews
  if (!reviewCount || reviewCount === 0) return null;
  
  const rating = averageRating || 0;
  const starSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/music/track/${trackId}/reviews`);
  };
  
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
      title={`${rating.toFixed(1)} rating from ${reviewCount} review${reviewCount !== 1 ? 's' : ''}`}
    >
      <Star 
        className={starSize} 
        fill={theme.accent} 
        color={theme.accent}
      />
      <span className={`${textSize} text-white/70`}>
        {rating.toFixed(1)}
      </span>
    </button>
  );
}
