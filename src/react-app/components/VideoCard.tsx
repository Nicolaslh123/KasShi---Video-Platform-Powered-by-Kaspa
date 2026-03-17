import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Eye, Coins } from "lucide-react";
import LocalizedLink, { useLocalizedPath } from "./LocalizedLink";
import { 
  type Video, 
  formatViews, 
  formatDuration,
  DEFAULT_AVATAR,
  DEFAULT_THUMBNAIL 
} from "../hooks/useKasShi";
import { useLanguage } from "../contexts/LanguageContext";
import { useFormatTimeAgo } from "../hooks/useFormatTime";

interface ProgressInfo {
  progressSeconds: number;
  durationSeconds: number;
}

interface VideoCardProps {
  video: Video;
  progress?: ProgressInfo;
}

export default function VideoCard({ video, progress }: VideoCardProps) {
  const navigate = useNavigate();
  const localizedPath = useLocalizedPath();
  const { t } = useLanguage();
  const formatTimeAgo = useFormatTimeAgo();
  const [thumbnailSrc, setThumbnailSrc] = useState(video.thumbnailUrl || DEFAULT_THUMBNAIL);
  const [avatarSrc, setAvatarSrc] = useState(video.channel.avatarUrl || DEFAULT_AVATAR);
  const duration = formatDuration(video.durationSeconds);
  const views = formatViews(video.viewCount);
  const timeAgo = formatTimeAgo(video.createdAt);

  const handleThumbnailError = () => {
    if (thumbnailSrc !== DEFAULT_THUMBNAIL) {
      setThumbnailSrc(DEFAULT_THUMBNAIL);
    }
  };

  const handleAvatarError = () => {
    if (avatarSrc !== DEFAULT_AVATAR) {
      setAvatarSrc(DEFAULT_AVATAR);
    }
  };

  const handleCardClick = () => {
    navigate(localizedPath(`/watch/${video.publicId || video.id}`));
  };

  // Middle-click (scroll wheel) to open in new tab
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) { // Middle mouse button
      e.preventDefault();
      const url = localizedPath(`/watch/${video.publicId || video.id}`);
      window.open(url, '_blank');
    }
  };

  return (
    <div onClick={handleCardClick} onMouseDown={handleMouseDown} className="group cursor-pointer">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-800">
        <img
          src={thumbnailSrc}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={handleThumbnailError}
        />
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
          {duration}
        </div>

        {/* Price badge */}
        {parseFloat(video.priceKas || '0') > 0 ? (
          <div className="absolute top-2 left-2 bg-green-600/90 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Coins className="w-3 h-3" />
            {parseFloat(video.priceKas).toFixed(2)} KAS
          </div>
        ) : (
          <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-xs font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
            {t.video.free || 'Free'}
          </div>
        )}
        
        {/* Members-only badge */}
        {video.isMembersOnly && (
          <div className="absolute top-2 left-20 bg-gradient-to-r from-purple-500/90 to-pink-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Crown className="w-3 h-3" />
            {t.video.membersOnly}
          </div>
        )}
        
        {/* Watched badge */}
        {video.hasWatched && (
          <div className="absolute top-2 right-2 bg-slate-800/90 text-slate-300 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Eye className="w-3 h-3" />
            {t.video.watched}
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Watch progress bar */}
        {progress && progress.progressSeconds > 0 && progress.durationSeconds > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-600/50">
            <div 
              className="h-full bg-teal-500" 
              style={{ width: `${Math.min(100, (progress.progressSeconds / progress.durationSeconds) * 100)}%` }}
            />
          </div>
        )}
      </div>
      
      <div className="flex gap-3 mt-3">
        <LocalizedLink 
          to={`/channel/${video.channel.handle}`}
          className="flex-shrink-0"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <img
            src={avatarSrc}
            alt={video.channel.name}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-transparent hover:ring-teal-500/50 transition-all"
            onError={handleAvatarError}
          />
        </LocalizedLink>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white line-clamp-2 leading-snug group-hover:text-teal-400 transition-colors">
            {video.title}
          </h3>
          <LocalizedLink 
            to={`/channel/${video.channel.handle}`}
            className="text-sm text-slate-400 hover:text-white transition-colors mt-1 block"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {video.channel.name}
          </LocalizedLink>
          <p className="text-sm text-slate-500 mt-0.5">
            {views} {t.video.views} • {timeAgo}
          </p>
        </div>
      </div>
    </div>
  );
}
