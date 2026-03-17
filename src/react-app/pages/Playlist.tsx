import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Clock, ThumbsUp, Share2, MoreHorizontal, ArrowLeft, Shuffle, ListMusic, Loader2, X, Trash2, Check, Copy, Camera } from 'lucide-react';
import PriceBadge from '../components/PriceBadge';
import { TrackRating } from '../components/TrackRating';
import ReviewButton from '../components/ReviewButton';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { usePlaylist, apiPlaylistTrackToAudioTrack, usePlaylistActions, ApiPlaylistTrack } from '../hooks/useMusic';
import { useWallet } from '../contexts/WalletContext';
import AnimatedBackground from '../components/AnimatedBackground';
import LocalizedLink from '../components/LocalizedLink';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getTotalDuration(tracks: { durationSeconds: number }[]): string {
  const totalSeconds = tracks.reduce((sum, t) => sum + (t.durationSeconds || 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
}

export default function Playlist() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { theme } = useMusicTheme();
  const { playPlaylist, currentTrack, isPlaying, isPlayerVisible, hasFullyListened } = useAudioPlayer();
  const { playlist, loading, error, refetch } = usePlaylist(playlistId);
  const { removeTrackFromPlaylist, deletePlaylist } = usePlaylistActions();
  const { wallet, externalWallet } = useWallet();
  const { titleBarPadding } = useElectronTitleBar();
  
  const [isLiked, setIsLiked] = useState(false);
  const [likingInProgress, setLikingInProgress] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [reviewedTrackIds, setReviewedTrackIds] = useState<Set<number>>(new Set());
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch reviewed tracks
  useEffect(() => {
    const fetchReviewedTracks = async () => {
      const isLoggedIn = wallet?.address || externalWallet?.address || externalWallet?.internalAddress;
      if (!isLoggedIn) return;
      
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch('/api/music/user/reviewed-tracks', {
          credentials: 'include',
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          setReviewedTrackIds(new Set(data.trackIds || []));
        }
      } catch (err) {
        console.error('Failed to fetch reviewed tracks:', err);
      }
    };
    fetchReviewedTracks();
  }, [wallet?.address, externalWallet?.address, externalWallet?.internalAddress, externalWallet?.authToken]);

  // Fetch like status on mount
  useEffect(() => {
    const checkLikeStatus = async () => {
      if (!playlistId) return;
      const isLoggedIn = wallet?.address || externalWallet?.address || externalWallet?.internalAddress;
      if (!isLoggedIn) return;
      
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch(`/api/music/user/liked-playlists`, {
          credentials: 'include',
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          const likedIds = new Set(data.playlists?.map((p: { id: number }) => p.id) || []);
          setIsLiked(likedIds.has(parseInt(playlistId)));
        }
      } catch (err) {
        console.error('Failed to fetch like status:', err);
      }
    };
    checkLikeStatus();
  }, [playlistId, wallet?.address, externalWallet?.address, externalWallet?.internalAddress, externalWallet?.authToken]);

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <AnimatedBackground themeId={theme.id} accent={theme.accent} />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-white/60" />
        </div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="min-h-screen relative">
        <AnimatedBackground themeId={theme.id} accent={theme.accent} />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Playlist Not Found</h1>
            <p className="text-white/60 mb-4">The playlist you're looking for doesn't exist.</p>
            <LocalizedLink to="/music" className="text-[#70C7BA] hover:underline">
              ← Back to Music
            </LocalizedLink>
          </div>
        </div>
      </div>
    );
  }

  const tracks = (playlist.tracks || []).map((t: ApiPlaylistTrack) => ({
    ...apiPlaylistTrackToAudioTrack(t),
    isReviewed: reviewedTrackIds.has(t.id),
  }));

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playPlaylist(tracks, 0);
    }
  };

  const handlePlayTrack = (index: number) => {
    playPlaylist(tracks, index);
  };

  const handleShuffle = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playPlaylist(shuffled, 0);
    }
  };

  const handleRemoveTrack = async (e: React.MouseEvent, trackId: number) => {
    e.stopPropagation();
    if (!playlistId) return;
    const success = await removeTrackFromPlaylist(parseInt(playlistId), trackId);
    if (success) {
      refetch();
    }
  };

  const handleLike = async () => {
    if (!playlistId || likingInProgress) return;
    const isLoggedIn = wallet?.address || externalWallet?.address || externalWallet?.internalAddress;
    if (!isLoggedIn) return;
    
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
      
      const res = await fetch(`/api/music/playlists/${playlistId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
        credentials: 'include',
        headers,
      });
      
      if (!res.ok) {
        // Revert on failure
        setIsLiked(wasLiked);
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
    const url = `${window.location.origin}/music/playlist/${playlistId}`;
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

  const handleDeletePlaylist = async () => {
    if (!playlistId || !confirm('Are you sure you want to delete this playlist? This cannot be undone.')) return;
    setDeleting(true);
    const success = await deletePlaylist(parseInt(playlistId));
    if (success) {
      navigate('/music/library');
    } else {
      alert('Failed to delete playlist');
      setDeleting(false);
    }
  };

  // Check if current user owns this playlist
  const currentWalletAddress = wallet?.address || externalWallet?.address || externalWallet?.internalAddress;
  const isOwner = playlist?.creatorWalletAddress === currentWalletAddress;

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playlistId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('cover', file);

      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
      }

      const response = await fetch(`/api/music/playlists/${playlistId}/cover`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      if (response.ok) {
        refetch();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to upload cover image');
      }
    } catch (err) {
      console.error('Failed to upload cover:', err);
      alert('Failed to upload cover image');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) {
        coverInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={`min-h-screen relative w-full overflow-x-hidden ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />

      <div className={`relative z-10 w-full overflow-x-hidden ${isPlayerVisible ? 'pb-32' : 'pb-8'}`}>
        {/* Hero Section */}
        <div className="relative">
          <header className="pt-16 sm:pt-20 px-3 sm:px-4 md:px-8 pb-6 sm:pb-8">
            <button 
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 sm:gap-2 text-white/60 hover:text-white transition-colors mb-4 sm:mb-6 text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {/* Playlist Hero */}
            <div className="flex flex-col items-center md:flex-row gap-6 sm:gap-8 md:items-end max-w-6xl mx-auto bg-black/20 backdrop-blur-sm rounded-xl p-4 sm:p-6">
              {/* Cover Art / Mosaic */}
              <div className="w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 relative group">
                {playlist.coverArtUrl ? (
                  <img
                    src={playlist.coverArtUrl}
                    alt={playlist.title}
                    className="w-full h-full object-cover"
                  />
                ) : tracks.length >= 4 ? (
                  <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                    {tracks.slice(0, 4).map((track, i) => (
                      <img
                        key={i}
                        src={track.coverArtUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center">
                    <ListMusic className="w-16 h-16 sm:w-20 sm:h-20 text-white/30" />
                  </div>
                )}
                
                {/* Cover Upload Button (owners only) */}
                {isOwner && (
                  <>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    >
                      {uploadingCover ? (
                        <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-spin" />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-white">
                          <Camera className="w-8 h-8 sm:w-10 sm:h-10" />
                          <span className="text-xs sm:text-sm font-medium">Change Cover</span>
                        </div>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Playlist Info */}
              <div className="flex-1 text-center md:text-left">
                <span className="text-xs sm:text-sm font-medium text-white/60 uppercase tracking-wider">
                  {playlist.isPublic ? 'Public Playlist' : 'Private Playlist'}
                </span>
                <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold text-white mt-1 sm:mt-2 mb-2 sm:mb-4">{playlist.title}</h1>
                {playlist.description && (
                  <p className="text-white/70 mb-3 sm:mb-4 max-w-xl text-sm sm:text-base">{playlist.description}</p>
                )}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2 text-white/70 text-xs sm:text-sm">
                  <span className="font-semibold text-white">{playlist.creatorName}</span>
                  <span>•</span>
                  <span>{playlist.trackCount} songs</span>
                  {tracks.length > 0 && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{getTotalDuration(tracks)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>
        </div>

        {/* Actions Bar */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-2 sm:gap-4 relative">
            <button
              onClick={handlePlayAll}
              disabled={tracks.length === 0}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.accent }}
            >
              <Play className="w-5 h-5 sm:w-6 sm:h-6 text-black ml-0.5" />
            </button>
            <button
              onClick={handleShuffle}
              disabled={tracks.length === 0}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            <button 
              onClick={handleLike}
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${isLiked ? 'bg-pink-500/30' : 'bg-white/10 hover:bg-white/20'}`}
              title={isLiked ? 'Unlike playlist' : 'Like playlist'}
            >
              <ThumbsUp className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? 'text-pink-500 fill-pink-500' : 'text-white'}`} />
            </button>
            
            {/* Share Button with Menu */}
            <div className="relative">
              <button 
                onClick={handleShare}
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${showShareMenu ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
                title="Share playlist"
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
            {isOwner && (
              <div className="relative">
                <button 
                  onClick={handleMoreMenu}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${showMoreMenu ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
                  title="More options"
                >
                  <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
                {showMoreMenu && (
                  <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-20 min-w-[140px] sm:min-w-[160px]">
                    <button
                      onClick={handleDeletePlaylist}
                      disabled={deleting}
                      className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-red-400 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {deleting ? 'Deleting...' : 'Delete playlist'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Track List */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8">
          <div className="bg-black/20 backdrop-blur-sm rounded-lg sm:rounded-xl overflow-hidden">
            {tracks.length === 0 ? (
              <div className="py-8 sm:py-12 text-center">
                <ListMusic className="w-10 h-10 sm:w-12 sm:h-12 text-white/30 mx-auto mb-3 sm:mb-4" />
                <p className="text-white/60 text-sm sm:text-base">This playlist is empty</p>
              </div>
            ) : (
              <>
                {/* Header Row - hidden on mobile */}
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_1fr_1fr_auto_auto] gap-4 px-4 py-3 border-b border-white/10 text-white/50 text-sm">
                  <span className="w-8 text-center">#</span>
                  <span>Title</span>
                  <span className="hidden md:block">Album</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                  </span>
                  <span className="w-8"></span>
                </div>

                {/* Tracks */}
                {tracks.map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrentTrack && isPlaying;

                  return (
                    <div
                      key={`${track.id}-${index}`}
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
                          {track.artistId ? (
                            <LocalizedLink 
                              to={`/music/artist/${track.artistId}`} 
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs sm:text-sm text-white/60 hover:text-white hover:underline truncate block"
                            >
                              {track.artist}
                            </LocalizedLink>
                          ) : (
                            <p className="text-xs sm:text-sm text-white/60 truncate">{track.artist}</p>
                          )}
                        </div>
                      </div>

                      {/* Album - hidden on mobile */}
                      <div className="hidden md:block text-white/50 text-sm truncate flex-shrink-0 w-32">
                        {track.albumId ? (
                          <LocalizedLink
                            to={`/music/album/${track.albumId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-white hover:underline transition-colors"
                          >
                            {track.albumTitle}
                          </LocalizedLink>
                        ) : (track.albumTitle || '—')}
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

                      {/* Remove */}
                      <button
                        onClick={(e) => handleRemoveTrack(e, track.id)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full opacity-0 group-hover:opacity-100 sm:opacity-100 hover:bg-white/20 flex items-center justify-center transition-all flex-shrink-0"
                        title="Remove from playlist"
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 hover:text-white" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Recommended */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-8 sm:py-12">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">Recommended</h2>
          <p className="text-white/50 text-sm sm:text-base">More tracks based on this playlist coming soon...</p>
        </div>
      </div>
    </div>
  );
}
