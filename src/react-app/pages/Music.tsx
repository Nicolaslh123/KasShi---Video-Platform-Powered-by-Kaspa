import { useState, useEffect } from 'react';
import { Music2, Mic2, Compass, ListMusic, Clock, ThumbsUp, Palette, Play, Pause, AlertCircle, Video, Upload, Loader2, User, X, Wallet, Search, Trophy, LayoutDashboard, Eye, EyeOff } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLocalizedNavigate } from '../components/LanguageRouter';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '@getmocha/users-service/react';
import { AudioTrack } from '../components/AudioPlayer';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { WalletModal } from '../components/WalletModal';
import { KaspaIcon } from '../components/KasShiLogo';
import { useFeaturedMusic, apiTrackToAudioTrack, ApiTrack, useMusicProfile } from '../hooks/useMusic';
import TrackActionsMenu from '../components/TrackActionsMenu';
import ReviewButton from '../components/ReviewButton';
import { PriceBadge } from '../components/PriceBadge';
import { TrackRating } from '../components/TrackRating';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

// Format duration as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format subscriber count
function formatSubscribers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function Music() {
  const { theme, setThemeById, themes } = useMusicTheme();
  const { } = useLanguage();
  const { playPlaylist, currentTrack, isPlaying, isPlayerVisible, setIsPlaying, hasFullyListened } = useAudioPlayer();
  const { wallet, externalWallet, isConnected, balance, pendingBalance } = useWallet();
  const { user: mochaUser } = useAuth();
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') === 'podcasts' ? 'podcasts' : 'music') as 'music' | 'podcasts';
  const setActiveTab = (tab: 'music' | 'podcasts') => {
    if (tab === 'music') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useLocalizedNavigate();
  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    return localStorage.getItem("kasshi_hide_balance") === "true";
  });

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    localStorage.setItem("kasshi_hide_balance", String(newValue));
  };


  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    return !localStorage.getItem('kasshi_music_disclaimer_seen');
  });

  // Fetch from API
  const { albums, podcasts, tracks, loading, error } = useFeaturedMusic();
  const { titleBarPadding } = useElectronTitleBar();
  const [likedTrackIds, setLikedTrackIds] = useState<Set<number>>(new Set());
  const [reviewedTrackIds, setReviewedTrackIds] = useState<Set<number>>(new Set());
  
  // Fetch user's liked track IDs
  useEffect(() => {
    const fetchLikedIds = async () => {
      if (!isConnected && !mochaUser) return;
      try {
        const response = await fetch('/api/music/user/liked', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          const ids = new Set<number>(data.tracks?.map((t: { id: number }) => t.id) || []);
          setLikedTrackIds(ids);
        }
      } catch (err) {
        console.error('Failed to fetch liked tracks:', err);
      }
    };
    fetchLikedIds();
  }, [isConnected, mochaUser]);
  
  // Fetch user's reviewed track IDs
  useEffect(() => {
    const fetchReviewedIds = async () => {
      if (!isConnected && !mochaUser) return;
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        const response = await fetch('/api/music/user/reviewed-tracks', {
          credentials: 'include',
          headers
        });
        if (response.ok) {
          const data = await response.json();
          const ids = new Set<number>(data.trackIds || []);
          setReviewedTrackIds(ids);
        }
      } catch (err) {
        console.error('Failed to fetch reviewed tracks:', err);
      }
    };
    fetchReviewedIds();
  }, [isConnected, mochaUser, externalWallet?.authToken]);
  
  // Featured playlists: all public playlists from everyone
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Array<{
    id: number;
    slug?: string;
    title: string;
    description: string;
    coverArtUrl: string | null;
    isPublic: boolean;
    trackCount: number;
    creatorName?: string;
  }>>([]);
  
  useEffect(() => {
    const fetchFeaturedPlaylists = async () => {
      try {
        // Fetch without ownOnly to get all public playlists
        const response = await fetch('/api/music/playlists', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          // Filter to only public playlists
          setFeaturedPlaylists(data.playlists?.filter((p: { isPublic: boolean }) => p.isPublic) || []);
        }
      } catch (err) {
        console.error('Failed to fetch featured playlists:', err);
      }
    };
    fetchFeaturedPlaylists();
  }, []);
  
  const playlists = featuredPlaylists;
  const { profile: userProfile, hasProfile, createProfile, loading: profileLoading, error: profileAuthError } = useMusicProfile();
  
  // Profile creation modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    handle: '',
    bio: '',
    genre: 'electronic'
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);

  // Convert API tracks to AudioTrack format
  const [recentTracks, setRecentTracks] = useState<AudioTrack[]>([]);
  
  useEffect(() => {
    if (tracks.length > 0) {
      const audioTracks = tracks.slice(0, 10).map(t => ({
        ...apiTrackToAudioTrack(t),
        isLiked: likedTrackIds.has(t.id),
        isReviewed: reviewedTrackIds.has(t.id)
      }));
      setRecentTracks(audioTracks);
    }
  }, [tracks, likedTrackIds, reviewedTrackIds]);

  const handlePlayTrack = (_track: AudioTrack, index: number) => {
    playPlaylist(recentTracks, index);
  };

  const handlePlayAlbum = async (albumId: number, albumTitle: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if this album is already playing
    const isThisAlbumPlaying = currentTrack?.albumTitle === albumTitle && isPlaying;
    if (isThisAlbumPlaying) {
      setIsPlaying(false);
      return;
    }
    
    // If same album but paused, resume
    if (currentTrack?.albumTitle === albumTitle && !isPlaying) {
      setIsPlaying(true);
      return;
    }
    
    // Fetch album tracks and play
    try {
      const response = await fetch(`/api/music/albums/${albumId}`);
      if (response.ok) {
        const albumData = await response.json();
        if (albumData.tracks && albumData.tracks.length > 0) {
          const audioTracks = albumData.tracks.map((t: ApiTrack) => ({
            ...apiTrackToAudioTrack(t, albumData.title),
            isLiked: likedTrackIds.has(t.id),
            isReviewed: reviewedTrackIds.has(t.id)
          }));
          playPlaylist(audioTracks, 0);
        }
      }
    } catch (err) {
      console.error('Failed to load album:', err);
    }
  };

  const dismissDisclaimer = () => {
    localStorage.setItem('kasshi_music_disclaimer_seen', 'true');
    setShowDisclaimer(false);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setCreatingProfile(true);
    
    try {
      await createProfile({
        name: profileForm.name,
        handle: profileForm.handle,
        bio: profileForm.bio || undefined,
        genre: profileForm.genre || undefined,
      });
      setShowProfileModal(false);
      setProfileForm({ name: '', handle: '', bio: '', genre: 'electronic' });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setCreatingProfile(false);
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Animated Background - handles all theme visuals */}
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      {/* Overlay - reduced for visibility */}
      <div className={`absolute inset-0 ${theme.overlay} opacity-30`} />

      {/* Copyright Disclaimer Modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-3">Content Guidelines</h3>
                <div className="space-y-3 text-white/70 text-sm">
                  <p>
                    <strong className="text-white">Original Content Only:</strong> All music, podcasts, and audio content uploaded to KasShi Music must be 100% owned by you or you must have explicit rights to distribute it.
                  </p>
                  <p>
                    <strong className="text-white">Copyright Policy:</strong> KasShi reserves the right to remove any content that infringes on copyrights or violates intellectual property rights without prior notice.
                  </p>
                  <p>
                    <strong className="text-white">Video Podcasts:</strong> Podcasts can include video for a richer experience. Episodes support both audio-only and video formats.
                  </p>
                  <p className="text-white/50 text-xs">
                    By uploading content, you confirm that you have all necessary rights and permissions.
                  </p>
                </div>
                <button
                  onClick={dismissDisclaimer}
                  className="mt-5 w-full py-3 rounded-xl font-semibold text-black transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: theme.accent }}
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Creation Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                  <User className="w-6 h-6" style={{ color: theme.accent }} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Create Your Music Profile</h3>
                  <p className="text-white/60 text-sm">Set up your artist profile</p>
                </div>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Check if user is authenticated - need actual wallet or auth token, not just wallet SDK loaded */}
            {(!wallet?.address && !externalWallet?.authToken && !mochaUser) || profileAuthError ? (
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 text-yellow-400" />
                <p className="text-white font-medium mb-2">Not authenticated</p>
                <p className="text-white/60 text-sm">Connect your wallet to create a music profile</p>
              </div>
            ) : (
            <form onSubmit={handleCreateProfile} className="space-y-4">
              {profileError && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                  {profileError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Artist / Creator Name *
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Your display name"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Handle *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">@</span>
                  <input
                    type="text"
                    value={profileForm.handle}
                    onChange={(e) => setProfileForm({ ...profileForm, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    placeholder="your_handle"
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                    required
                  />
                </div>
                <p className="text-xs text-white/40 mt-1">Letters, numbers, and underscores only</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Bio
                </label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  placeholder="Tell listeners about yourself..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Primary Genre
                </label>
                <select
                  value={profileForm.genre}
                  onChange={(e) => setProfileForm({ ...profileForm, genre: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-white/40 appearance-none cursor-pointer"
                >
                  <option value="electronic" className="bg-slate-800 text-white">Electronic</option>
                  <option value="house" className="bg-slate-800 text-white">House</option>
                  <option value="hip-hop" className="bg-slate-800 text-white">Hip-Hop</option>
                  <option value="pop" className="bg-slate-800 text-white">Pop</option>
                  <option value="rock" className="bg-slate-800 text-white">Rock</option>
                  <option value="r&b" className="bg-slate-800 text-white">R&B</option>
                  <option value="jazz" className="bg-slate-800 text-white">Jazz</option>
                  <option value="classical" className="bg-slate-800 text-white">Classical</option>
                  <option value="country" className="bg-slate-800 text-white">Country</option>
                  <option value="folk" className="bg-slate-800 text-white">Folk</option>
                  <option value="metal" className="bg-slate-800 text-white">Metal</option>
                  <option value="indie" className="bg-slate-800 text-white">Indie</option>
                  <option value="podcast" className="bg-slate-800 text-white">Podcast</option>
                  <option value="other" className="bg-slate-800 text-white">Other</option>
                </select>
              </div>
              
              <button
                type="submit"
                disabled={creatingProfile || !profileForm.name || !profileForm.handle}
                className="w-full py-3 rounded-xl font-semibold text-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                style={{ backgroundColor: theme.accent }}
              >
                {creatingProfile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Profile'
                )}
              </button>
            </form>
            )}
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className={`relative z-10 min-h-screen flex flex-col w-full overflow-x-hidden ${titleBarPadding}`}>
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-[2000px] mx-auto px-4 py-3 sm:py-4">
            {/* Top row - Logo and wallet */}
            <div className="flex items-center justify-between gap-2">
              {/* Logo and Videos button */}
              <div className="flex items-center gap-1.5 sm:gap-3">
                <LocalizedLink to="/music" className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                    <Music2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-black" />
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-white hidden sm:inline">KasShi Music</span>
                </LocalizedLink>
                
                {/* Videos button */}
                <LocalizedLink 
                  to="/" 
                  className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full font-medium text-[10px] sm:text-sm transition-colors bg-red-600/90 hover:bg-red-500 text-white"
                >
                  Videos
                </LocalizedLink>
                
                {/* Dashboard button */}
                {(wallet?.address || externalWallet?.address || externalWallet?.authToken || mochaUser) && (
                  <LocalizedLink 
                    to="/dashboard" 
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-sm transition-colors bg-white/10 hover:bg-white/20 text-white"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </LocalizedLink>
                )}
              </div>
              
              {/* Desktop center section - tabs and search */}
              <div className="hidden md:flex items-center gap-3 flex-1 justify-center">
                {/* Tab switcher */}
                <div className="flex bg-white/10 rounded-full p-1 flex-shrink-0">
                  <button
                    onClick={() => setActiveTab('music')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                      activeTab === 'music' 
                        ? 'bg-white text-black' 
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    <Music2 className="w-4 h-4" />
                    Music
                  </button>
                  <button
                    onClick={() => setActiveTab('podcasts')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                      activeTab === 'podcasts' 
                        ? 'bg-white text-black' 
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    <Mic2 className="w-4 h-4" />
                    Podcasts
                  </button>
                </div>

                {/* Search bar */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (searchQuery.trim()) {
                      navigate(`/music/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    }
                  }}
                  className="flex items-center max-w-md"
                >
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search artists, songs..."
                      className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-full text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/15 text-sm"
                    />
                  </div>
                </form>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-1 sm:gap-3">
                {/* Theme selector - icon only */}
                <div className="relative">
                  <button
                    onClick={() => setShowThemeSelector(!showThemeSelector)}
                    className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white/80 hover:text-white"
                    title={`Theme: ${theme.name}`}
                  >
                    <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  
                  {showThemeSelector && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50">
                      <div className="p-2">
                        <p className="text-xs text-white/50 px-3 py-2 uppercase tracking-wider">Choose Theme</p>
                        {themes.filter(t => t.id !== 'moonlight').map((t) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              setThemeById(t.id);
                              setShowThemeSelector(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                              theme.id === t.id 
                                ? 'bg-white/20 text-white' 
                                : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <div className="w-5 h-5 rounded-full border-2 border-white/40 flex items-center justify-center flex-shrink-0">
                              {theme.id === t.id && (
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: t.accent }} 
                                />
                              )}
                            </div>
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: t.accent }}
                            />
                            <span className="text-sm">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Desktop Profile icon */}
                {!profileLoading && (wallet?.address || externalWallet?.address || externalWallet?.authToken || mochaUser) && (
                  hasProfile && userProfile ? (
                    <LocalizedLink
                      to={`/music/artist/${userProfile.id}`}
                      className="hidden sm:flex p-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                      title="My Profile"
                    >
                      {userProfile.avatarUrl ? (
                        <img 
                          src={userProfile.avatarUrl} 
                          alt="Profile" 
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5" />
                      )}
                    </LocalizedLink>
                  ) : !profileAuthError && (
                    <button
                      onClick={() => setShowProfileModal(true)}
                      className="hidden sm:flex p-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                      title="Create Profile"
                    >
                      <User className="w-5 h-5" />
                    </button>
                  )
                )}
                
                {/* Upload button - icon only on mobile */}
                <LocalizedLink
                  to="/music/upload"
                  className="p-1.5 sm:px-3 sm:py-2 rounded-full font-medium text-black transition-colors hover:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: theme.accent }}
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">Upload</span>
                </LocalizedLink>

                {/* Balance visibility toggle */}
                {isConnected && wallet && (
                  <button
                    onClick={toggleBalanceVisibility}
                    className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white/70 hover:text-white"
                    title={isBalanceHidden ? "Show balance" : "Hide balance"}
                  >
                    {isBalanceHidden ? (
                      <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                )}

                {/* Connect Wallet */}
                {isConnected && wallet ? (
                  <button 
                    onClick={() => setIsWalletModalOpen(true)}
                    className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition-all"
                  >
                    <KaspaIcon size={14} />
                    <span className="text-xs sm:text-sm font-medium" style={{ color: theme.accent }}>
                      {isBalanceHidden ? "••••" : (parseFloat(balance) - (pendingBalance?.pendingDebitsKas || 0)).toFixed(2)}
                    </span>
                  </button>
                ) : (
                  <button 
                    onClick={() => setIsWalletModalOpen(true)}
                    className="p-1.5 sm:px-3 sm:py-2 text-white rounded-full font-medium transition-all shadow-lg hover:opacity-90 flex items-center gap-1.5"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <Wallet className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm">Connect</span>
                  </button>
                )}
                
                {/* Profile icon - always show on mobile */}
                <div className="sm:hidden">
                  {!profileLoading && hasProfile && userProfile ? (
                    <LocalizedLink
                      to={`/music/artist/${userProfile.id}`}
                      className="flex p-1.5 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                      title="My Profile"
                    >
                      {userProfile.avatarUrl ? (
                        <img 
                          src={userProfile.avatarUrl} 
                          alt="Profile" 
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </LocalizedLink>
                  ) : (
                    <button
                      onClick={() => {
                        if (wallet?.address || externalWallet?.address || mochaUser) {
                          setShowProfileModal(true);
                        } else {
                          setIsWalletModalOpen(true);
                        }
                      }}
                      className="flex p-1.5 rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                      title="Profile"
                    >
                      <User className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Mobile row - search and tabs */}
            <div className="flex items-center gap-2 mt-3 md:hidden">
              {/* Mobile search */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    navigate(`/music/search?q=${encodeURIComponent(searchQuery.trim())}`);
                  }
                }}
                className="flex-1"
              >
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-full text-white placeholder-white/40 focus:outline-none focus:border-white/40 text-sm"
                  />
                </div>
              </form>
              
              {/* Mobile tab switcher */}
              <div className="flex bg-white/10 rounded-full p-1 flex-shrink-0">
                <button
                  onClick={() => setActiveTab('music')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    activeTab === 'music' 
                      ? 'bg-white text-black' 
                      : 'text-white/70'
                  }`}
                >
                  <Music2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveTab('podcasts')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    activeTab === 'podcasts' 
                      ? 'bg-white text-black' 
                      : 'text-white/70'
                  }`}
                >
                  <Mic2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="w-full max-w-[2000px] mx-auto px-4 py-4 sm:py-8 overflow-x-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.accent }} />
              <span className="ml-3 text-white/70">Loading music...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-white/60">{error}</p>
            </div>
          ) : activeTab === 'music' ? (
            <>
              {/* Quick Actions */}
              <section className="mb-6 sm:mb-12">
                <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl p-2 sm:p-6">
                    <div className="flex sm:grid sm:grid-cols-5 gap-1 sm:gap-4 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                      <LocalizedLink to="/music/library/liked" className="flex-shrink-0 w-[72px] sm:w-auto flex flex-col items-center gap-1 sm:gap-3 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-4 transition-colors group">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                          <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-medium text-[10px] sm:text-base">Liked</p>
                        </div>
                      </LocalizedLink>
                      <LocalizedLink to="/music/library/library" className="flex-shrink-0 w-[72px] sm:w-auto flex flex-col items-center gap-1 sm:gap-3 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-4 transition-colors group">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                          <ListMusic className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-medium text-[10px] sm:text-base">Library</p>
                        </div>
                      </LocalizedLink>
                      <LocalizedLink to="/music/discover" className="flex-shrink-0 w-[72px] sm:w-auto flex flex-col items-center gap-1 sm:gap-3 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-4 transition-colors group">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                          <Compass className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-medium text-[10px] sm:text-base">Discover</p>
                        </div>
                      </LocalizedLink>
                      <LocalizedLink to="/music/library/history" className="flex-shrink-0 w-[72px] sm:w-auto flex flex-col items-center gap-1 sm:gap-3 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-4 transition-colors group">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-medium text-[10px] sm:text-base">History</p>
                        </div>
                      </LocalizedLink>
                      <LocalizedLink to="/music/leaderboard" className="flex-shrink-0 w-[72px] sm:w-auto flex flex-col items-center gap-1 sm:gap-3 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl p-2 sm:p-4 transition-colors group">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                          <Trophy className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-medium text-[10px] sm:text-base">Top</p>
                        </div>
                      </LocalizedLink>
                    </div>
                  </div>
                </div>
              </section>

              {/* Recent Tracks */}
              <section className="mb-8 sm:mb-12">
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h2 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        Recent Tracks
                      </h2>
                      <LocalizedLink to="/music/tracks" className="text-xs sm:text-sm hover:underline" style={{ color: theme.accent }}>See all</LocalizedLink>
                    </div>
                    {recentTracks.length === 0 ? (
                      <div className="bg-white/5 rounded-xl p-6 sm:p-8 text-center">
                        <p className="text-white/60 text-sm sm:text-base">No tracks yet. Upload your music to get started!</p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile card view */}
                        <div className="sm:hidden space-y-2">
                          {recentTracks.map((track, index) => {
                            const isCurrentTrack = currentTrack?.id === track.id;
                            const isThisPlaying = isCurrentTrack && isPlaying;
                            return (
                              <div
                                key={track.id}
                                onClick={() => handlePlayTrack(track, index)}
                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${isCurrentTrack ? 'bg-white/10' : 'bg-white/5 active:bg-white/10'}`}
                              >
                                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
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
                                  <div className="flex items-center gap-2">
                                    <p className={`font-medium text-sm truncate ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>{track.title}</p>
                                    <PriceBadge priceKas={track.priceKas} />
                                    <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                                  </div>
                                  {track.artistId ? (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); navigate(`/music/artist/${track.artistId}`); }}
                                      className="text-xs text-white/60 truncate hover:text-white hover:underline transition-colors text-left"
                                    >
                                      {track.artist}
                                    </button>
                                  ) : (
                                    <p className="text-xs text-white/60 truncate">{track.artist}</p>
                                  )}
                                </div>
                                <span className="text-xs text-white/50 flex-shrink-0">{formatDuration(track.durationSeconds)}</span>
                                {hasFullyListened(track.id) && (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <ReviewButton track={track} accent={theme.accent} />
                                  </div>
                                )}
                                <div onClick={(e) => e.stopPropagation()}>
                                  <TrackActionsMenu track={track} accent={theme.accent} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Desktop table view */}
                        <div className="hidden sm:block bg-white/5 rounded-xl">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-white/10 text-white/80 text-sm">
                                <th className="text-left py-3 px-4 w-12">#</th>
                                <th className="text-left py-3 px-4">Title</th>
                                <th className="text-left py-3 px-4 hidden md:table-cell">Album</th>
                                <th className="text-right py-3 px-4">Duration</th>
                                <th className="text-right py-3 px-4 w-12"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentTracks.map((track, index) => {
                                const isCurrentTrack = currentTrack?.id === track.id;
                                const isThisPlaying = isCurrentTrack && isPlaying;
                                return (
                                <tr 
                                  key={track.id}
                                  onClick={() => handlePlayTrack(track, index)}
                                  className={`group border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${isCurrentTrack ? 'bg-white/5' : ''}`}
                                >
                                  <td className="py-3 px-4 text-white/70 group-hover:text-white">
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
                                        className="w-10 h-10 rounded object-cover"
                                      />
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className={`font-medium ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>{track.title}</p>
                                          <PriceBadge priceKas={track.priceKas} />
                                          <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                                        </div>
                                        {track.artistId ? (
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); navigate(`/music/artist/${track.artistId}`); }}
                                            className="text-sm text-white/80 hover:text-white hover:underline transition-colors text-left"
                                          >
                                            {track.artist}
                                          </button>
                                        ) : (
                                          <p className="text-sm text-white/80">{track.artist}</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-white/70 hidden md:table-cell">
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
                                  <td className="py-3 px-4 text-white/70 text-right">{formatDuration(track.durationSeconds)}</td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {hasFullyListened(track.id) && (
                                        <ReviewButton track={track} accent={theme.accent} />
                                      )}
                                      <TrackActionsMenu track={track} accent={theme.accent} />
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Featured Albums */}
              <section className="mb-8 sm:mb-12">
                <div className="rounded-2xl p-[1px] bg-gradient-to-br from-white/20 via-white/5 to-transparent" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h2 className="text-lg sm:text-2xl font-bold text-white">Featured Albums</h2>
                      <LocalizedLink to="/music/albums" className="text-xs sm:text-sm hover:underline" style={{ color: theme.accent }}>See all</LocalizedLink>
                    </div>
                    {albums.length === 0 ? (
                      <div className="bg-white/5 rounded-xl p-6 sm:p-8 text-center">
                        <Music2 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-white/30" />
                        <p className="text-white/60 text-sm sm:text-base">No albums yet. Be the first to upload!</p>
                        <LocalizedLink 
                          to="/music/upload"
                          className="inline-block mt-3 sm:mt-4 px-4 sm:px-6 py-2 rounded-full text-black font-medium text-sm"
                          style={{ backgroundColor: theme.accent }}
                        >
                          Upload Music
                        </LocalizedLink>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
                        {albums.map((album) => (
                          <LocalizedLink 
                            key={album.id}
                            to={`/music/album/${album.slug || album.id}`}
                            className="group bg-white/5 hover:bg-white/10 rounded-xl p-2 sm:p-4 transition-all cursor-pointer block"
                          >
                            <div className="relative aspect-square rounded-lg overflow-hidden mb-2 sm:mb-3">
                              <img 
                                src={album.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80'} 
                                alt={album.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button 
                                  onClick={(e) => handlePlayAlbum(album.id, album.title, e)}
                                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform"
                                  style={{ backgroundColor: theme.accent }}
                                >
                                  {currentTrack?.albumTitle === album.title && isPlaying ? (
                                    <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
                                  ) : (
                                    <Play className="w-4 h-4 sm:w-5 sm:h-5 text-black ml-0.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <h3 className="font-semibold text-white truncate text-sm sm:text-base">{album.title}</h3>
                            <p className="text-xs sm:text-sm text-white/80 truncate">{album.artist.name}</p>
                            <p className="text-xs text-white/40 mt-1">{album.trackCount || 0} tracks</p>
                          </LocalizedLink>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Featured Playlists (static for now) */}
              <section className="mb-8 sm:mb-12">
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h2 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                        <ListMusic className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
                        Featured Playlists
                      </h2>
                      <LocalizedLink to="/music/playlists" className="text-xs sm:text-sm hover:underline" style={{ color: theme.accent }}>See all</LocalizedLink>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
                      {playlists.length === 0 ? (
                        <div className="col-span-full text-center py-6 sm:py-8">
                          <ListMusic className="w-10 h-10 sm:w-12 sm:h-12 text-white/30 mx-auto mb-3" />
                          <p className="text-white/50 text-sm sm:text-base">No playlists yet</p>
                        </div>
                      ) : (
                        playlists.map((playlist) => (
                          <LocalizedLink
                            key={playlist.id}
                            to={`/music/playlist/${playlist.slug || playlist.id}`}
                            className="group flex items-center gap-3 sm:gap-4 bg-white/5 hover:bg-white/10 rounded-xl p-2 sm:p-3 transition-all"
                          >
                            <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0">
                              {playlist.coverArtUrl ? (
                                <img 
                                  src={playlist.coverArtUrl} 
                                  alt={playlist.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-white/10 flex items-center justify-center">
                                  <ListMusic className="w-6 h-6 sm:w-8 sm:h-8 text-white/30" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div 
                                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center"
                                  style={{ backgroundColor: theme.accent }}
                                >
                                  <Play className="w-3 h-3 sm:w-4 sm:h-4 text-black ml-0.5" />
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-white truncate text-sm sm:text-base">{playlist.title}</h3>
                              <p className="text-xs sm:text-sm text-white/80 truncate">{playlist.description || 'Playlist'}</p>
                              <p className="text-xs text-white/40 mt-0.5 sm:mt-1">{playlist.trackCount} songs • by {playlist.creatorName}</p>
                            </div>
                          </LocalizedLink>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Podcasts Tab */}
              <section className="mb-8 sm:mb-12">
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h2 className="text-lg sm:text-2xl font-bold text-white">Featured Podcasts</h2>
                      <LocalizedLink to="/music/podcasts" className="text-xs sm:text-sm hover:underline" style={{ color: theme.accent }}>See all</LocalizedLink>
                    </div>
                    {podcasts.length === 0 ? (
                      <div className="bg-white/5 rounded-xl p-6 sm:p-8 text-center">
                        <Mic2 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-white/30" />
                        <p className="text-white/60 text-sm sm:text-base">No podcasts yet. Start your own!</p>
                        <LocalizedLink 
                          to="/music/upload"
                          className="inline-block mt-3 sm:mt-4 px-4 sm:px-6 py-2 rounded-full text-black font-medium text-sm"
                          style={{ backgroundColor: theme.accent }}
                        >
                          Create Podcast
                        </LocalizedLink>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                        {podcasts.map((podcast) => (
                          <LocalizedLink 
                            key={podcast.id}
                            to={`/music/podcast/${podcast.id}`}
                            className="group bg-white/5 hover:bg-white/10 rounded-xl p-2 sm:p-4 transition-all cursor-pointer block"
                          >
                            <div className="relative aspect-square rounded-lg overflow-hidden mb-2 sm:mb-3">
                              <img 
                                src={podcast.coverArtUrl || 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80'} 
                                alt={podcast.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div 
                                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform"
                                  style={{ backgroundColor: theme.accent }}
                                >
                                  <Play className="w-4 h-4 sm:w-5 sm:h-5 text-black ml-0.5" />
                                </div>
                              </div>
                            </div>
                            <h3 className="font-semibold text-white truncate text-sm sm:text-base">{podcast.title}</h3>
                            <p className="text-xs sm:text-sm text-white/80 truncate">{podcast.host.name}</p>
                            <div className="flex items-center flex-wrap gap-1 sm:gap-2 mt-1">
                              <p className="text-xs text-white/40">{podcast.episodeCount || 0} ep</p>
                              <span className="text-xs text-white/30 hidden sm:inline">•</span>
                              <p className="text-xs text-white/40 hidden sm:inline">{formatSubscribers(podcast.followerCount)} followers</p>
                              {podcast.isVideoPodcast && (
                                <span className="flex items-center gap-0.5 sm:gap-1 text-xs px-1 sm:px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                  <Video className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  <span className="hidden sm:inline">Video</span>
                                </span>
                              )}
                            </div>
                          </LocalizedLink>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Categories */}
              <section>
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${theme.accent}40 0%, transparent 50%, ${theme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4 sm:p-6">
                    <h2 className="text-lg sm:text-2xl font-bold text-white mb-4 sm:mb-6">Browse Categories</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                      {['Technology', 'Business', 'Arts', 'Science', 'Health', 'News', 'Comedy', 'Education'].map((category) => (
                        <LocalizedLink 
                          key={category}
                          to={`/music/podcasts/category/${category.toLowerCase()}`}
                          className="py-4 sm:py-6 px-3 sm:px-4 rounded-xl text-white font-medium transition-all hover:scale-105 text-center block text-sm sm:text-base"
                          style={{ 
                            background: `linear-gradient(135deg, ${theme.accent}40 0%, ${theme.accent}10 100%)`,
                            borderColor: `${theme.accent}30`,
                            borderWidth: 1
                          }}
                        >
                          {category}
                        </LocalizedLink>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>

        {/* Footer Disclaimer - add padding for mini player */}
        <footer className={`${isPlayerVisible ? 'pb-24' : 'pb-6 sm:pb-8'} pt-6 sm:pt-8 px-3 sm:px-4 mt-auto`}>
          <div className="max-w-[2000px] mx-auto border-t border-white/10 pt-4 sm:pt-6">
            <div className="flex flex-col items-center gap-3 sm:gap-4 text-white/40 text-xs text-center">
              <p>© {new Date().getFullYear()} KasShi Music. All rights reserved.</p>
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                <button 
                  onClick={() => setShowDisclaimer(true)}
                  className="hover:text-white/70 transition-colors"
                >
                  Content Guidelines
                </button>
                <span className="hidden sm:inline">•</span>
                <p className="px-4 sm:px-0">Upload only content you own or have rights to distribute</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
      
      {/* Wallet Modal */}
      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </div>
  );
}
