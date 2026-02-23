import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crown, Eye } from "lucide-react";
import { 
  type Video, 
  formatViews, 
  formatDuration, 
  formatTimeAgo,
  DEFAULT_AVATAR,
  DEFAULT_THUMBNAIL 
} from "../hooks/useKasShi";

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
    navigate(`/watch/${video.publicId || video.id}`);
  };

  return (
    <div onClick={handleCardClick} className="group cursor-pointer">
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

        {/* Members-only badge */}
        {video.isMembersOnly && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-purple-500/90 to-pink-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Crown className="w-3 h-3" />
            Members
          </div>
        )}
        
        {/* Watched badge */}
        {video.hasWatched && (
          <div className="absolute top-2 right-2 bg-slate-800/90 text-slate-300 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Eye className="w-3 h-3" />
            Watched
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
        <Link 
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
        </Link>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white line-clamp-2 leading-snug group-hover:text-teal-400 transition-colors">
            {video.title}
          </h3>
          <Link 
            to={`/channel/${video.channel.handle}`}
            className="text-sm text-slate-400 hover:text-white transition-colors mt-1 block"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {video.channel.name}
          </Link>
          <p className="text-sm text-slate-500 mt-0.5">
            {views} views • {timeAgo}
          </p>
        </div>
      </div>
    </div>
  );
}
