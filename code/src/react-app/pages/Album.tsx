import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Clock, ThumbsUp, Share2, MoreHorizontal, ArrowLeft, Shuffle, Loader2, Check, Copy, ListPlus } from 'lucide-react';
import PriceBadge from '../components/PriceBadge';
import { TrackRating } from '../components/TrackRating';
import ReviewButton from '../components/ReviewButton';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useWallet } from '../contexts/WalletContext';
import { useAlbum, apiTrackToAudioTrack } from '../hooks/useMusic';
import AnimatedBackground from '../components/AnimatedBackground';
import LocalizedLink from '../components/LocalizedLink';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getTotalDuration(tracks: { durationSeconds?: number }[]): string {
  const totalSeconds = tracks.reduce((sum, t) => sum + (t.durationSeconds || 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} hr ${mins} min`;
  return `${mins} min`;
}

export default function Album() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const { theme } = useMusicTheme();
  const { playPlaylist, currentTrack, isPlaying, isPlayerVisible, addToQueue, setIsPlaying, hasFullyListened } = useAudioPlayer();
  const { wallet, externalWallet } = useWallet();
  const { titleBarPadding } = useElectronTitleBar();

  const { album, loading, error } = useAlbum(albumId ? parseInt(albumId) : undefined);
  
  const [isLiked, setIsLiked] = useState(false);
  const [likingInProgress, setLikingInProgress] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLoggedIn = wallet?.address || externalWallet?.address || externalWallet?.internalAddress;

  // Fetch like status on mount
  useEffect(() => {
    const checkLikeStatus = async () => {
      if (!albumId || !isLoggedIn) return;
      
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch(`/api/music/user/liked-albums`, {
          credentials: 'include',
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          const likedIds = new Set(data.albums?.map((a: { id: number }) => a.id) || []);
          setIsLiked(likedIds.has(parseInt(albumId)));
        }
      } catch (err) {
        console.error('Failed to fetch like status:', err);
      }
    };
    checkLikeStatus();
  }, [albumId, isLoggedIn, externalWallet?.authToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#70C7BA]" />
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Album Not Found</h1>
          <p className="text-white/60 mb-4">{error || "The album you're looking for doesn't exist."}</p>
          <LocalizedLink to="/music" className="text-[#70C7BA] hover:underline">
            ← Back to Music
          </LocalizedLink>
        </div>
      </div>
    );
  }

  // Convert API tracks to AudioTrack format
  const audioTracks = (album.tracks || []).map(t => apiTrackToAudioTrack(t, album.title));

  // Check if this album is currently playing
  const albumTrackIds = new Set(audioTracks.map(t => t.id));
  const isAlbumPlaying = currentTrack && albumTrackIds.has(currentTrack.id) && isPlaying;

  const handlePlayAll = () => {
    if (audioTracks.length === 0) return;
    
    if (isAlbumPlaying) {
      // Already playing this album, pause it
      setIsPlaying(false);
    } else if (currentTrack && albumTrackIds.has(currentTrack.id)) {
      // Album track is loaded but paused, resume
      setIsPlaying(true);
    } else {
      // Start playing the album from the beginning
      playPlaylist(audioTracks, 0);
    }
  };

  const handlePlayTrack = (index: number) => {
    playPlaylist(audioTracks, index);
  };

  const handleShuffle = () => {
    const shuffled = [...audioTracks].sort(() => Math.random() - 0.5);
    playPlaylist(shuffled, 0);
  };

  const handleLike = async () => {
    if (!albumId || likingInProgress || !isLoggedIn) return;
    
    setLikingInProgress(true);
    const wasLiked = isLiked;
    setIsLiked(!wasLiked); // Optimistic update
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (externalWallet?.authToken) {
        headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/music/albums/${albumId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
        credentials: 'include',
        headers,
      });
      
      if (!res.ok) {
        setIsLiked(wasLiked); // Revert on failure
        console.error('Failed to toggle like');
      }
    } catch (err) {
      setIsLiked(wasLiked); // Revert on error
      console.error('Failed to toggle like:', err);
    } finally {
      setLikingInProgress(false);
    }
  };

  const handleShare = () => {
    setShowShareMenu(!showShareMenu);
    setShowMoreMenu(false);
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/music/album/${albumId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShowShareMenu(false);
    }, 1500);
  };

  const handleMoreMenu = () => {
    setShowMoreMenu(!showMoreMenu);
    setShowShareMenu(false);
  };

  const handleAddAllToQueue = () => {
    if (audioTracks.length > 0) {
      audioTracks.forEach(track => addToQueue(track));
      setShowMoreMenu(false);
    }
  };

  return (
    <div className={`min-h-screen relative w-full overflow-x-hidden ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />

      <div className={`relative z-10 w-full overflow-x-hidden ${isPlayerVisible ? 'pb-32' : 'pb-8'}`}>
        {/* Header */}
        <header className="pt-16 sm:pt-20 px-3 sm:px-4 md:px-8">
          <button 
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 sm:gap-2 text-white/60 hover:text-white transition-colors mb-4 sm:mb-6 text-sm sm:text-base"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Album Hero */}
          <div className="max-w-6xl mx-auto">
            <div className="p-[1px] rounded-lg sm:rounded-xl" style={{ background: `linear-gradient(135deg, ${theme.accent}40, transparent 50%, ${theme.accent}20)` }}>
              <div className="bg-black/40 backdrop-blur-sm rounded-lg sm:rounded-xl p-4 sm:p-6 md:p-8">
                <div className="flex flex-col items-center md:flex-row gap-6 sm:gap-8 md:items-end">
                  {/* Cover Art */}
                  <div className="w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-2xl flex-shrink-0">
                    <img
                      src={album.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80'}
                      alt={album.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Album Info */}
                  <div className="flex-1 text-center md:text-left">
                    <span className="text-xs sm:text-sm font-medium text-white/60 uppercase tracking-wider">Album</span>
                    <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold text-white mt-1 sm:mt-2 mb-2 sm:mb-4">{album.title}</h1>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2 text-white/70 text-xs sm:text-sm">
                      <span className="font-semibold text-white">{album.artist.name}</span>
                      <span>•</span>
                      <span>{album.releaseDate ? new Date(album.releaseDate).getFullYear() : 'Unknown'}</span>
                      <span>•</span>
                      <span>{album.tracks?.length || 0} songs</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{getTotalDuration(album.tracks || [])}</span>
                    </div>
                    {album.description && (
                      <p className="mt-3 sm:mt-4 text-white/60 max-w-xl text-sm sm:text-base">{album.description}</p>
                    )}
                    {album.genre && (
                      <div className="flex items-center justify-center md:justify-start gap-3 mt-4 sm:mt-6">
                        <span 
                          className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
                        >
                          {album.genre}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Actions Bar */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-2 sm:gap-4 relative">
            <button
              onClick={handlePlayAll}
              disabled={audioTracks.length === 0}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.accent }}
            >
              {isAlbumPlaying ? (
                <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-black" />
              ) : (
                <Play className="w-5 h-5 sm:w-6 sm:h-6 text-black ml-0.5" />
              )}
            </button>
            <button
              onClick={handleShuffle}
              disabled={audioTracks.length === 0}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            <button 
              onClick={handleLike}
              disabled={!isLoggedIn}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${isLiked ? 'bg-pink-500/30' : 'bg-white/10 hover:bg-white/20'}`}
              title={isLiked ? 'Unlike album' : 'Like album'}
            >
              <ThumbsUp className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? 'text-pink-500 fill-pink-500' : 'text-white'}`} />
            </button>
            
            {/* Share Button with Menu */}
            <div className="relative">
              <button 
                onClick={handleShare}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${showShareMenu ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
                title="Share album"
              >
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              {showShareMenu && (
                <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-20 min-w-[140px] sm:min-w-[160px]">
                  <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>
            
            {/* More Options Button with Menu */}
            <div className="relative">
              <button 
                onClick={handleMoreMenu}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${showMoreMenu ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
                title="More options"
              >
                <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              {showMoreMenu && (
                <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-20 min-w-[160px] sm:min-w-[180px]">
                  <button
                    onClick={handleAddAllToQueue}
                    disabled={audioTracks.length === 0}
                    className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    <ListPlus className="w-4 h-4" />
                    Add all to queue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8">
          {audioTracks.length === 0 ? (
            <div className="p-[1px] rounded-lg sm:rounded-xl" style={{ background: `linear-gradient(135deg, ${theme.accent}40, transparent 50%, ${theme.accent}20)` }}>
              <div className="bg-black/40 backdrop-blur-sm rounded-lg sm:rounded-xl p-6 sm:p-8 text-center">
                <p className="text-white/60 text-sm sm:text-base">No tracks in this album yet.</p>
              </div>
            </div>
          ) : (
            <div className="p-[1px] rounded-lg sm:rounded-xl" style={{ background: `linear-gradient(135deg, ${theme.accent}40, transparent 50%, ${theme.accent}20)` }}>
              <div className="bg-black/40 backdrop-blur-sm rounded-lg sm:rounded-xl overflow-hidden">
                {/* Header Row - hidden on mobile */}
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 border-b border-white/10 text-white/50 text-sm">
                  <span className="w-8 text-center">#</span>
                  <span>Title</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                  </span>
                </div>

                {/* Tracks */}
                {audioTracks.map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrentTrack && isPlaying;

                  return (
                    <div
                      key={track.id}
                      onClick={() => handlePlayTrack(index)}
                      className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer transition-colors ${
                        isCurrentTrack ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      {/* Track Number / Playing Indicator */}
                      <div className="w-6 sm:w-8 text-center flex-shrink-0">
                        {isThisPlaying ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="w-0.5 sm:w-1 h-2 sm:h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                            <span className="w-0.5 sm:w-1 h-3 sm:h-4 rounded-full animate-pulse delay-75" style={{ backgroundColor: theme.accent }} />
                            <span className="w-0.5 sm:w-1 h-1.5 sm:h-2 rounded-full animate-pulse delay-150" style={{ backgroundColor: theme.accent }} />
                          </div>
                        ) : (
                          <span className="text-white/50 text-sm">{index + 1}</span>
                        )}
                      </div>

                      {/* Track Info */}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <img
                          src={track.coverArtUrl}
                          alt={track.title}
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className={`font-medium truncate text-sm sm:text-base ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>
                            {track.title}
                          </p>
                          <p className="text-xs sm:text-sm text-white/60 truncate">{track.artist}</p>
                        </div>
                      </div>

                      {/* Price Badge */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <PriceBadge priceKas={track.priceKas} size="sm" />
                        <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                      </div>

                      {/* Duration */}
                      <div className="text-white/50 text-xs sm:text-sm text-right flex-shrink-0">
                        {formatDuration(track.durationSeconds)}
                      </div>
                      
                      {/* Review Button */}
                      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                        {hasFullyListened(track.id) && <ReviewButton track={track} accent={theme.accent} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* More by Artist */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-8 sm:py-12">
          <div className="p-[1px] rounded-lg sm:rounded-xl" style={{ background: `linear-gradient(135deg, ${theme.accent}40, transparent 50%, ${theme.accent}20)` }}>
            <div className="bg-black/40 backdrop-blur-sm rounded-lg sm:rounded-xl p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">More by {album.artist.name}</h2>
              <p className="text-white/50 text-sm sm:text-base">More albums coming soon...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
