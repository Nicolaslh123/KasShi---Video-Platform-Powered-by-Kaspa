import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThumbsUp, ListMusic, Radio, Clock, Music2, Play, ArrowLeft, Loader2, Plus, Trash2, Shuffle, MessageSquare } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { AudioTrack } from '../components/AudioPlayer';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackActionsMenu from '../components/TrackActionsMenu';
import ReviewButton from '../components/ReviewButton';
import { PriceBadge } from '../components/PriceBadge';
import { TrackRating } from '../components/TrackRating';
import CreatePlaylistModal from '../components/CreatePlaylistModal';
import { useWallet } from '../contexts/WalletContext';
import { apiTrackToAudioTrack, ApiTrack, useMusicProfile, useMusicActions } from '../hooks/useMusic';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

interface Playlist {
  id: number;
  title: string;
  description: string;
  coverArtUrl: string | null;
  isPublic: boolean;
  trackCount: number;
  createdAt: string;
}

interface Review {
  id: number;
  trackId: number;
  trackTitle: string;
  trackCover: string | null;
  artistName: string;
  rating: number;
  comment: string;
  rewardKas: string;
  createdAt: string;
}

type TabType = 'liked' | 'library' | 'radio' | 'history' | 'reviews';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function MusicLibrary() {
  const { tab } = useParams<{ tab?: string }>();
  const { theme } = useMusicTheme();
  const navigate = useNavigate();
  const { playPlaylist, currentTrack, isPlaying, hasFullyListened } = useAudioPlayer();
  const { externalWallet, isConnected, wallet } = useWallet();
  const { hasProfile, loading: profileLoading } = useMusicProfile();
  useMusicActions(); // Keep hook active for context
  const { titleBarPadding } = useElectronTitleBar();
  
  // Get initial tab from URL or default to 'liked'
  const getInitialTab = (): TabType => {
    if (tab === 'liked' || tab === 'library' || tab === 'radio' || tab === 'history' || tab === 'reviews') {
      return tab;
    }
    return 'liked';
  };
  
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  
  // Sync tab with URL param changes
  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [tab]);
  
  // Trigger pending payment processing on page load (background task)
  useEffect(() => {
    const processPendingPayments = async () => {
      try {
        await fetch('/api/music/reviews/process-pending', { 
          method: 'POST',
          credentials: 'include'
        });
      } catch (err) {
        // Silently fail - this is a background optimization
        console.log('Background payment processing check completed');
      }
    };
    processPendingPayments();
  }, []);
  
  const [likedTracks, setLikedTracks] = useState<AudioTrack[]>([]);
  const [historyTracks, setHistoryTracks] = useState<AudioTrack[]>([]);
  const [radioTracks, setRadioTracks] = useState<AudioTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedPlaylists, setLikedPlaylists] = useState<Playlist[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [totalEarnedKas, setTotalEarnedKas] = useState<string>('0');
  const [_reviewedTrackIds, setReviewedTrackIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);

  const refetchPlaylists = () => setRefreshKey(k => k + 1);

  // Get auth header for API calls
  const getAuthHeader = (): Record<string, string> => {
    if (externalWallet?.authToken) {
      return { 'Authorization': `Bearer ${externalWallet.authToken}` };
    }
    return {};
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const headers = getAuthHeader();
        
        // Fetch all data in parallel for faster loading with timing
        const startTime = performance.now();
        
        const timedFetch = async (url: string, options?: RequestInit) => {
          const t0 = performance.now();
          const res = await fetch(url, options);
          const t1 = performance.now();
          console.log(`[LIBRARY TIMING] ${url}: ${Math.round(t1 - t0)}ms`);
          return res;
        };
        
        const [likedRes, historyRes, radioRes, playlistsRes, likedPlaylistsRes, reviewsRes, reviewedTracksRes] = await Promise.all([
          timedFetch('/api/music/user/liked', { headers, credentials: 'include' }),
          timedFetch('/api/music/user/history', { headers, credentials: 'include' }),
          timedFetch('/api/music/radio'),
          timedFetch('/api/music/playlists?ownOnly=true', { headers, credentials: 'include' }),
          timedFetch('/api/music/user/liked-playlists', { headers, credentials: 'include' }),
          timedFetch('/api/music/user/reviews', { headers, credentials: 'include' }),
          timedFetch('/api/music/user/reviewed-tracks', { headers, credentials: 'include' }),
        ]);
        
        console.log(`[LIBRARY TIMING] All fetches completed in ${Math.round(performance.now() - startTime)}ms`);
        
        // Process reviewed track IDs first (needed for other track mappings)
        let reviewedIds = new Set<number>();
        if (reviewedTracksRes.ok) {
          const data = await reviewedTracksRes.json();
          reviewedIds = new Set(data.trackIds || []);
          setReviewedTrackIds(reviewedIds);
        }
        
        // Process liked tracks
        if (likedRes.ok) {
          const data = await likedRes.json();
          setLikedTracks(data.tracks?.map((t: ApiTrack) => ({ 
            ...apiTrackToAudioTrack(t), 
            isLiked: true,
            isReviewed: reviewedIds.has(t.id)
          })) || []);
        }
        
        // Process history
        if (historyRes.ok) {
          const data = await historyRes.json();
          setHistoryTracks(data.tracks?.map((t: ApiTrack) => ({
            ...apiTrackToAudioTrack(t),
            isReviewed: reviewedIds.has(t.id)
          })) || []);
        }
        
        // Process radio
        if (radioRes.ok) {
          const data = await radioRes.json();
          setRadioTracks(data.tracks?.map((t: ApiTrack) => ({
            ...apiTrackToAudioTrack(t),
            isReviewed: reviewedIds.has(t.id)
          })) || []);
        }
        
        // Process playlists
        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data.playlists || []);
        }
        
        // Process liked playlists
        if (likedPlaylistsRes.ok) {
          const data = await likedPlaylistsRes.json();
          setLikedPlaylists(data.playlists || []);
        }
        
        // Process reviews
        if (reviewsRes.ok) {
          const data = await reviewsRes.json();
          setReviews(data.reviews || []);
          setTotalEarnedKas(data.totalEarnedKas || '0');
        }
      } catch (err) {
        console.error('Failed to fetch library data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [externalWallet?.authToken, refreshKey]);

  const handlePlayTrack = (tracks: AudioTrack[], index: number) => {
    playPlaylist(tracks, index);
  };

  const tabs: { id: TabType; label: string; icon: typeof ThumbsUp }[] = [
    { id: 'liked', label: 'Liked Songs', icon: ThumbsUp },
    { id: 'library', label: 'Your Library', icon: ListMusic },
    { id: 'radio', label: 'Radio', icon: Radio },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'reviews', label: 'My Reviews', icon: MessageSquare },
  ];

  const getCurrentTracks = (): AudioTrack[] => {
    switch (activeTab) {
      case 'liked': return likedTracks;
      case 'history': return historyTracks;
      case 'radio': return radioTracks;
      default: return [];
    }
  };

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'liked': return "No liked songs yet. Like tracks while listening to add them here.";
      case 'library': return "Your playlists and saved albums will appear here.";
      case 'radio': return "Discover new music based on your listening habits.";
      case 'history': return "Your recently played tracks will appear here.";
      case 'reviews': return "Your song reviews will appear here. Listen to songs fully to leave reviews and earn rewards.";
      default: return "";
    }
  };

  const tracks = getCurrentTracks();

  return (
    <div className={`min-h-screen relative w-full overflow-x-hidden ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      <div className={`absolute inset-0 ${theme.overlay} opacity-30`} />

      <div className="relative z-10 w-full overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <button 
                onClick={() => navigate(-1)}
                className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-white">Your Music</h1>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          {/* Tabs */}
          <div className="flex gap-1.5 sm:gap-2 mb-6 sm:mb-8 overflow-x-auto pb-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full whitespace-nowrap transition-all text-sm sm:text-base ${
                    activeTab === tab.id
                      ? 'text-black'
                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                  }`}
                  style={activeTab === tab.id ? { backgroundColor: theme.accent } : {}}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.id === 'liked' ? 'Liked' : tab.id === 'library' ? 'Library' : tab.id === 'radio' ? 'Radio' : tab.id === 'history' ? 'History' : 'Reviews'}</span>
                </button>
              );
            })}
          </div>

          {profileLoading || loading ? (
            <div className="flex items-center justify-center py-12 sm:py-20">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" style={{ color: theme.accent }} />
              <span className="ml-3 text-white/70 text-sm sm:text-base">Loading...</span>
            </div>
          ) : !hasProfile && (isConnected || wallet?.address || externalWallet?.authToken) ? (
            <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
              <div className="bg-black/70 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                <Music2 className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-white/30" />
                <h2 className="text-lg sm:text-xl font-bold text-white mb-2">Create Your Music Profile</h2>
                <p className="text-white/60 mb-4 sm:mb-6 text-sm sm:text-base">You need a music profile to like songs, create playlists, and save your listening history.</p>
                <LocalizedLink
                  to="/music"
                  className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-black font-semibold transition-all hover:opacity-90 text-sm sm:text-base"
                  style={{ backgroundColor: theme.accent }}
                >
                  Create Profile
                </LocalizedLink>
              </div>
            </div>
          ) : activeTab === 'library' ? (
            // Library shows playlists with create button
            <div className="space-y-4 sm:space-y-6">
              {/* Create playlist button */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <button
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-black font-semibold transition-all hover:opacity-90 text-sm sm:text-base"
                  style={{ backgroundColor: theme.accent }}
                  onClick={() => setShowCreatePlaylistModal(true)}
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Create New Playlist</span>
                  <span className="sm:hidden">New Playlist</span>
                </button>
                <span className="text-white px-2 sm:px-3 py-1 rounded-full bg-black/50 text-sm">{playlists.length} playlists</span>
              </div>
              
              {playlists.length === 0 ? (
                <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                    <ListMusic className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-white/30" />
                    <h2 className="text-lg sm:text-xl font-bold text-white mb-2">Your Library</h2>
                    <p className="text-white/60 text-sm sm:text-base">Create playlists to organize your favorite music.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
                    <div className="grid gap-1.5 sm:gap-2 p-3 sm:p-4">
                      {playlists.map((playlist) => (
                        <LocalizedLink
                          key={playlist.id}
                          to={`/music/playlist/${playlist.id}`}
                          className="flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-lg sm:rounded-xl hover:bg-white/10 transition-colors group"
                        >
                          <div 
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${theme.accent}30` }}
                          >
                            {playlist.coverArtUrl ? (
                              <img src={playlist.coverArtUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                            ) : (
                              <ListMusic className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-white truncate text-sm sm:text-base">{playlist.title}</h3>
                              {!playlist.isPublic && (
                                <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/50">Private</span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-white/50">{playlist.trackCount} tracks</p>
                          </div>
                          <button
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!confirm('Delete this playlist?')) return;
                              try {
                                const headers = getAuthHeader();
                                await fetch(`/api/music/playlists/${playlist.id}`, {
                                  method: 'DELETE',
                                  headers,
                                  credentials: 'include'
                                });
                                refetchPlaylists();
                              } catch (err) {
                                console.error('Failed to delete playlist:', err);
                              }
                            }}
                            className="p-1.5 sm:p-2 rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4 text-white/50 hover:text-red-400" />
                          </button>
                        </LocalizedLink>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Liked Playlists section */}
              {likedPlaylists.length > 0 && (
                <div className="mt-6 sm:mt-8">
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                    Liked Playlists
                    <span className="text-white/50 text-xs sm:text-sm font-normal">({likedPlaylists.length})</span>
                  </h3>
                  <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                    <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
                      <div className="grid gap-1.5 sm:gap-2 p-3 sm:p-4">
                        {likedPlaylists.map((playlist) => (
                          <LocalizedLink
                            key={playlist.id}
                            to={`/music/playlist/${playlist.id}`}
                            className="flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-lg sm:rounded-xl hover:bg-white/10 transition-colors group"
                          >
                            <div 
                              className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${theme.accent}30` }}
                            >
                              {playlist.coverArtUrl ? (
                                <img src={playlist.coverArtUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                <ListMusic className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-white truncate text-sm sm:text-base">{playlist.title}</h3>
                              <p className="text-xs sm:text-sm text-white/50">{playlist.trackCount} tracks</p>
                            </div>
                          </LocalizedLink>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'reviews' ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Earnings summary */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-white font-semibold text-sm sm:text-base" style={{ backgroundColor: `${theme.accent}30` }}>
                  <span>Total Earned:</span>
                  <span style={{ color: theme.accent }}>{totalEarnedKas} KAS</span>
                </div>
                <span className="text-white px-2 sm:px-3 py-1 rounded-full bg-black/50 text-sm">{reviews.length} reviews</span>
              </div>

              {reviews.length === 0 ? (
                <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                    <MessageSquare className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-white/30" />
                    <h2 className="text-lg sm:text-xl font-bold text-white mb-2">My Reviews</h2>
                    <p className="text-white/60 text-sm sm:text-base">{getEmptyMessage()}</p>
                    <LocalizedLink
                      to="/music"
                      className="inline-block mt-4 px-5 sm:px-6 py-2 rounded-full text-black font-medium text-sm sm:text-base"
                      style={{ backgroundColor: theme.accent }}
                    >
                      Discover Music
                    </LocalizedLink>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
                    <div className="grid gap-1.5 sm:gap-2 p-3 sm:p-4">
                      {reviews.map((review) => (
                        <div
                          key={review.id}
                          className="flex items-start gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div 
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${theme.accent}30` }}
                          >
                            {review.trackCover ? (
                              <img src={review.trackCover} alt="" className="w-full h-full object-cover rounded-lg" />
                            ) : (
                              <Music2 className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-white truncate text-sm sm:text-base">{review.trackTitle}</h3>
                              {parseFloat(review.rewardKas) > 0 && (
                                <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex-shrink-0">
                                  +{review.rewardKas} KAS
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-white/50 mb-1.5">{review.artistName}</p>
                            <div className="flex items-center gap-1 mb-1.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                  key={star}
                                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'fill-white/20 text-white/20'}`}
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                              ))}
                              <span className="text-xs text-white/40 ml-1">
                                {new Date(review.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {review.comment && (
                              <p className="text-xs sm:text-sm text-white/70 line-clamp-2">{review.comment}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : tracks.length === 0 ? (
            <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
              <div className="bg-black/70 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                <Music2 className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-white/30" />
                <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
                  {activeTab === 'liked' && 'Liked Songs'}
                  {activeTab === 'radio' && 'Radio'}
                  {activeTab === 'history' && 'History'}
                </h2>
                <p className="text-white/60 text-sm sm:text-base">{getEmptyMessage()}</p>
                {activeTab === 'radio' && (
                  <LocalizedLink
                    to="/music"
                    className="inline-block mt-4 px-5 sm:px-6 py-2 rounded-full text-black font-medium text-sm sm:text-base"
                    style={{ backgroundColor: theme.accent }}
                  >
                    Explore Music
                  </LocalizedLink>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Play All and Shuffle buttons */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
                <button
                  onClick={() => handlePlayTrack(tracks, 0)}
                  className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-black font-semibold text-sm sm:text-base"
                  style={{ backgroundColor: theme.accent }}
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5" />
                  Play All
                </button>
                <button
                  onClick={() => {
                    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                    playPlaylist(shuffled, 0);
                  }}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/60 hover:bg-black/80 text-white font-medium transition-colors border border-white/20 text-sm sm:text-base"
                  title="Shuffle play"
                >
                  <Shuffle className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Shuffle</span>
                </button>
                <span className="text-white px-2 sm:px-3 py-1 rounded-full bg-black/50 text-xs sm:text-sm">{tracks.length} tracks</span>
              </div>

              {/* Track List - with gradient border like front page */}
              <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                <div className="bg-black/70 rounded-xl sm:rounded-2xl">
                {/* Desktop table view */}
                <table className="w-full hidden sm:table">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 text-sm">
                      <th className="text-left py-3 px-4 w-12">#</th>
                      <th className="text-left py-3 px-4">Title</th>
                      <th className="text-left py-3 px-4 hidden md:table-cell">Album</th>
                      <th className="text-right py-3 px-4">Duration</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track, index) => {
                      const isCurrentTrack = currentTrack?.id === track.id;
                      const isThisPlaying = isCurrentTrack && isPlaying;
                      return (
                        <tr
                          key={`${track.id}-${index}`}
                          onClick={() => handlePlayTrack(tracks, index)}
                          className={`group border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${isCurrentTrack ? 'bg-white/5' : ''}`}
                        >
                          <td className="py-3 px-4 text-white/50 group-hover:text-white">
                            {isThisPlaying ? (
                              <div className="flex items-center gap-0.5">
                                <span className="w-1 h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                                <span className="w-1 h-4 rounded-full animate-pulse delay-75" style={{ backgroundColor: theme.accent }} />
                                <span className="w-1 h-2 rounded-full animate-pulse delay-150" style={{ backgroundColor: theme.accent }} />
                              </div>
                            ) : (
                              <>
                                <span className="group-hover:hidden">{index + 1}</span>
                                <Play className="w-4 h-4 hidden group-hover:block" style={{ color: theme.accent }} />
                              </>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&q=80'}
                                alt={track.title}
                                className="w-10 h-10 rounded object-cover hidden sm:block"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className={`font-medium ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>{track.title}</p>
                                  <PriceBadge priceKas={track.priceKas} />
                                  <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                                </div>
                                {track.artistId ? (
                                  <LocalizedLink 
                                    to={`/music/artist/${track.artistId}`} 
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-white/60 hover:text-white hover:underline"
                                  >
                                    {track.artist}
                                  </LocalizedLink>
                                ) : (
                                  <p className="text-sm text-white/60">{track.artist}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-white/60 hidden md:table-cell">
                            {track.albumId ? (
                              <LocalizedLink
                                to={`/music/album/${track.albumId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-white hover:underline transition-colors"
                              >
                                {track.albumTitle}
                              </LocalizedLink>
                            ) : (track.albumTitle || '—')}
                          </td>
                          <td className="py-3 px-4 text-white/50 text-right">{formatDuration(track.durationSeconds)}</td>
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              {hasFullyListened(track.id) && <ReviewButton track={track} accent={theme.accent} />}
                              <TrackActionsMenu
                              track={track}
                              accent={theme.accent}
                              onLikeToggle={(newLiked) => {
                                // TrackActionsMenu already called toggleLike, so just update UI
                                if (activeTab === 'liked' && !newLiked) {
                                  // Remove from liked list when unliked
                                  setLikedTracks(prev => prev.filter(t => t.id !== track.id));
                                }
                              }}
                              iconSize={18}
                            />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                {/* Mobile card view */}
                <div className="sm:hidden divide-y divide-white/5">
                  {tracks.map((track, index) => {
                    const isCurrentTrack = currentTrack?.id === track.id;
                    const isThisPlaying = isCurrentTrack && isPlaying;
                    return (
                      <div
                        key={`${track.id}-${index}-mobile`}
                        onClick={() => handlePlayTrack(tracks, index)}
                        className={`flex items-center gap-3 p-3 cursor-pointer ${isCurrentTrack ? 'bg-white/5' : ''}`}
                      >
                        <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
                          <img
                            src={track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&q=80'}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                          {isThisPlaying && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <div className="flex items-center gap-0.5">
                                <span className="w-1 h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                                <span className="w-1 h-4 rounded-full animate-pulse delay-75" style={{ backgroundColor: theme.accent }} />
                                <span className="w-1 h-2 rounded-full animate-pulse delay-150" style={{ backgroundColor: theme.accent }} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`font-medium truncate text-sm ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>{track.title}</p>
                            <PriceBadge priceKas={track.priceKas} />
                            <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                          </div>
                          {track.artistId ? (
                            <LocalizedLink 
                              to={`/music/artist/${track.artistId}`} 
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-white/60 hover:text-white hover:underline truncate block"
                            >
                              {track.artist}
                            </LocalizedLink>
                          ) : (
                            <p className="text-xs text-white/60 truncate">{track.artist}</p>
                          )}
                        </div>
                        <span className="text-xs text-white/50 flex-shrink-0">{formatDuration(track.durationSeconds)}</span>
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                          {hasFullyListened(track.id) && <ReviewButton track={track} accent={theme.accent} />}
                          <TrackActionsMenu
                            track={track}
                            accent={theme.accent}
                            onLikeToggle={(newLiked) => {
                              // TrackActionsMenu already called toggleLike, so just update UI
                              if (activeTab === 'liked' && !newLiked) {
                                // Remove from liked list when unliked
                                setLikedTracks(prev => prev.filter(t => t.id !== track.id));
                              }
                            }}
                            iconSize={16}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      
      {/* Create Playlist Modal */}
      <CreatePlaylistModal
        isOpen={showCreatePlaylistModal}
        onClose={() => setShowCreatePlaylistModal(false)}
        onCreated={refetchPlaylists}
        accent={theme.accent}
      />
    </div>
  );
}
