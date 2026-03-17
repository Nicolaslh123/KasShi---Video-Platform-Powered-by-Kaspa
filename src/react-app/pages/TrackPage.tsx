import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Clock, ThumbsUp, Share2, ArrowLeft, Loader2, Check, Copy, User } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useWallet } from '../contexts/WalletContext';
import AnimatedBackground from '../components/AnimatedBackground';
import LocalizedLink from '../components/LocalizedLink';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import PriceBadge from '../components/PriceBadge';
import type { AudioTrack } from '../components/AudioPlayer';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface TrackData {
  id: number;
  title: string;
  description?: string;
  audioUrl: string;
  coverArtUrl?: string;
  durationSeconds?: number;
  genre?: string;
  lyrics?: string;
  priceKas?: string;
  playCount?: number;
  isExplicit?: boolean;
  artist?: string;
  artistId?: number;
  albumTitle?: string;
  creatorWallet?: string;
  chapters?: { id: number; title: string; startTimeSeconds: number; description?: string }[];
  createdAt?: string;
}

export default function TrackPage() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const { theme } = useMusicTheme();
  const { playTrack, currentTrack, isPlaying, isPlayerVisible, setIsPlaying } = useAudioPlayer();
  const { wallet, externalWallet } = useWallet();
  const { titleBarPadding } = useElectronTitleBar();

  const [track, setTrack] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likingInProgress, setLikingInProgress] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);

  const isLoggedIn = wallet?.address || externalWallet?.address || externalWallet?.internalAddress;

  // Fetch track data
  useEffect(() => {
    const fetchTrack = async () => {
      if (!trackId) return;
      
      setLoading(true);
      try {
        const res = await fetch(`/api/music/tracks/${trackId}`);
        if (!res.ok) {
          throw new Error('Track not found');
        }
        const data = await res.json();
        setTrack(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load track');
      } finally {
        setLoading(false);
      }
    };
    fetchTrack();
  }, [trackId]);

  // Check like status
  useEffect(() => {
    const checkLikeStatus = async () => {
      if (!trackId || !isLoggedIn) return;
      
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch(`/api/music/user/liked`, {
          credentials: 'include',
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          const likedIds = new Set(data.tracks?.map((t: { id: number }) => t.id) || []);
          setIsLiked(likedIds.has(parseInt(trackId)));
        }
      } catch (err) {
        console.error('Failed to fetch like status:', err);
      }
    };
    checkLikeStatus();
  }, [trackId, isLoggedIn, externalWallet?.authToken]);

  // Auto-play track when loaded
  useEffect(() => {
    if (track && !hasAutoPlayed && track.audioUrl) {
      const audioTrack: AudioTrack = {
        id: track.id,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        artistId: track.artistId,
        audioUrl: track.audioUrl,
        coverArtUrl: track.coverArtUrl || '',
        durationSeconds: track.durationSeconds || 0,
        priceKas: track.priceKas,
        creatorWallet: track.creatorWallet,
        contentType: 'track',
        chapters: track.chapters,
        albumTitle: track.albumTitle,
        isLiked,
      };
      playTrack(audioTrack);
      setHasAutoPlayed(true);
    }
  }, [track, hasAutoPlayed, isLiked, playTrack]);

  const handleLike = async () => {
    if (!trackId || !isLoggedIn || likingInProgress) return;
    
    setLikingInProgress(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (externalWallet?.authToken) {
        headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
      }
      
      const res = await fetch(`/api/music/tracks/${trackId}/like`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
      
      if (res.ok) {
        const data = await res.json();
        setIsLiked(data.liked);
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
    } finally {
      setLikingInProgress(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShowShareMenu(false);
    }, 1500);
  };

  const isThisTrackPlaying = currentTrack?.id === track?.id && isPlaying;

  const handlePlayPause = () => {
    if (!track) return;
    
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      const audioTrack: AudioTrack = {
        id: track.id,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        artistId: track.artistId,
        audioUrl: track.audioUrl,
        coverArtUrl: track.coverArtUrl || '',
        durationSeconds: track.durationSeconds || 0,
        priceKas: track.priceKas,
        creatorWallet: track.creatorWallet,
        contentType: 'track',
        chapters: track.chapters,
        albumTitle: track.albumTitle,
        isLiked,
      };
      playTrack(audioTrack);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#70C7BA]" />
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/70 text-lg mb-4">{error || 'Track not found'}</p>
          <button
            onClick={() => navigate('/music')}
            className="px-4 py-2 bg-[#70C7BA] text-black rounded-lg hover:bg-[#5eb3a7] transition-colors"
          >
            Back to Music
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen relative ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      <div className={`relative z-10 max-w-4xl mx-auto px-4 py-8 ${isPlayerVisible ? 'pb-32' : ''}`}>
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/70 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        {/* Track header - with gradient border */}
        <div className="relative p-[2px] rounded-2xl bg-gradient-to-br from-white/30 via-white/10 to-white/30">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 via-transparent to-white/20 blur-sm" />
          <div className="relative bg-black/40 backdrop-blur-xl rounded-2xl p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          {/* Cover art */}
          <div className="w-64 h-64 md:w-72 md:h-72 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl">
            {track.coverArtUrl ? (
              <img
                src={track.coverArtUrl}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#70C7BA]/30 to-[#70C7BA]/10 flex items-center justify-center">
                <User className="w-24 h-24 text-white/30" />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 text-center md:text-left">
            <p className="text-white/60 text-sm uppercase tracking-wider mb-2">Song</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{track.title}</h1>
            
            <div className="flex items-center justify-center md:justify-start gap-3 text-white/80 mb-4">
              {track.artistId ? (
                <LocalizedLink
                  to={`/music/artist/${track.artistId}`}
                  className="hover:text-white hover:underline transition-colors"
                >
                  {track.artist}
                </LocalizedLink>
              ) : (
                <span>{track.artist}</span>
              )}
              {track.albumTitle && (
                <>
                  <span className="text-white/40">•</span>
                  <span>{track.albumTitle}</span>
                </>
              )}
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3 text-white/60 text-sm mb-6">
              {track.durationSeconds && track.durationSeconds > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatDuration(track.durationSeconds)}</span>
                </div>
              )}
              {track.playCount !== undefined && track.playCount > 0 && (
                <span>{track.playCount.toLocaleString()} plays</span>
              )}
              <PriceBadge priceKas={track.priceKas} />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center md:justify-start gap-4">
              <button
                onClick={handlePlayPause}
                className="w-14 h-14 rounded-full bg-[#70C7BA] hover:bg-[#5eb3a7] flex items-center justify-center transition-colors shadow-lg"
              >
                {isThisTrackPlaying ? (
                  <Pause className="w-6 h-6 text-black" />
                ) : (
                  <Play className="w-6 h-6 text-black ml-1" />
                )}
              </button>

              <button
                onClick={handleLike}
                disabled={!isLoggedIn || likingInProgress}
                className={`p-3 rounded-full transition-colors ${
                  isLiked 
                    ? 'text-orange-500 bg-orange-500/10' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ThumbsUp className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="p-3 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Share2 className="w-6 h-6" />
                </button>
                {showShareMenu && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    <button
                      onClick={handleCopyLink}
                      className="w-full px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-3 transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          <span className="text-green-500">Link copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy link</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
          </div>
        </div>

        {/* Description - with gradient border */}
        {track.description && (
          <div className="mt-10 relative p-[2px] rounded-2xl bg-gradient-to-br from-white/30 via-white/10 to-white/30">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 via-transparent to-white/20 blur-sm" />
            <div className="relative bg-black/40 backdrop-blur-xl rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-3">About this track</h2>
              <p className="text-white/70 leading-relaxed">{track.description}</p>
            </div>
          </div>
        )}

        {/* Lyrics */}
        {track.lyrics && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-white mb-3">Lyrics</h2>
            <pre className="text-white/70 leading-relaxed whitespace-pre-wrap font-sans">{track.lyrics}</pre>
          </div>
        )}

        {/* Chapters */}
        {track.chapters && track.chapters.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-white mb-3">Chapters</h2>
            <div className="space-y-2">
              {track.chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <span className="text-white/50 text-sm w-12">{formatDuration(chapter.startTimeSeconds)}</span>
                  <span className="text-white">{chapter.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
