import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { AudioTrack } from '../components/AudioPlayer';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '@getmocha/users-service/react';
import { usePayment } from '../hooks/usePayment';
import { useMusicProfile } from '../hooks/useMusic';
import { ImageCropper } from '../components/ImageCropper';
import TrackActionsMenu from '../components/TrackActionsMenu';
import { PriceBadge } from '../components/PriceBadge';
import { FractionBadge } from '../components/FractionBadge';
import { TrackRating } from '../components/TrackRating';
import ReviewButton from '../components/ReviewButton';
import { SecurityVerificationModal } from '../components/SecurityVerificationModal';
import { WalletModal } from '../components/WalletModal';
import { FractionalizeModal } from '../components/FractionalizeModal';
import { BuySharesModal } from '../components/BuySharesModal';
import toast from 'react-hot-toast';

import LocalizedLink from '../components/LocalizedLink';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import { 
  Play, Pause, Clock, MoreHorizontal, Camera, Check,
  ChevronLeft, ChevronDown, Music2, Users, Loader2, Copy, Flag, Edit3, Palette, X, Trash2, Settings, Gift, Pencil, Star, PieChart
} from 'lucide-react';

interface Artist {
  id: number;
  name: string;
  handle: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  genre: string | null;
  websiteUrl: string | null;
  walletAddress: string | null;
  followerCount: number;
  followingCount: number;
  trackCount: number;
  totalPlays: number;
  isOwner: boolean;
  isFollowing: boolean;
  profileTheme: string;
}

interface Track {
  id: number;
  title: string;
  audioUrl: string;
  coverArtUrl: string | null;
  durationSeconds: number;
  playCount: number;
  albumTitle: string | null;
  priceKas?: string;
  artistName?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  isFractionalized?: boolean;
  krc20Ticker?: string | null;
  totalShares?: number;
  sharesSold?: number;
}

interface Episode {
  id: number;
  title: string;
  durationSeconds: number;
  priceKas: string | null;
}

interface Podcast {
  id: number;
  title: string;
  description: string | null;
  coverArtUrl: string | null;
  category: string | null;
  followerCount: number;
  episodeCount: number;
  episodes?: Episode[];
}

interface Playlist {
  id: number;
  title: string;
  description: string | null;
  coverArtUrl: string | null;
  trackCount: number;
}

interface Album {
  id: number;
  title: string;
  coverArtUrl: string | null;
  releaseDate: string | null;
  trackCount: number;
}

interface CustomTheme {
  id: string;
  title: string;
  previewImageUrl: string | null;
  themeData: {
    backgroundColor?: string;
    gradientStart?: string;
    gradientEnd?: string;
    gradientDirection?: string;
    accentColor?: string;
    textColor?: string;
  } | null;
  hasParticles: boolean;
}

interface Review {
  id: number;
  trackId: number;
  trackTitle: string;
  trackCoverUrl: string | null;
  rating: number;
  comment: string | null;
  reviewerName: string | null;
  reviewerAvatar: string | null;
  createdAt: string;
}

// Particle canvas for custom themes with particles enabled
function ParticleCanvas({ accentColor }: { accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    
    // Particle system
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    const particleCount = 50;
    
    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5 - 0.3, // Slight upward drift
        size: Math.random() * 3 + 1,
        alpha: Math.random() * 0.5 + 0.2
      });
    }
    
    // Parse accent color to RGB
    const parseColor = (color: string): [number, number, number] => {
      if (color.startsWith('#')) {
        const hex = color.slice(1);
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
      return [255, 255, 255];
    };
    const [r, g, b] = parseColor(accentColor);
    
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        // Update position
        p.x += p.vx;
        p.y += p.vy;
        
        // Wrap around edges
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        
        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
        ctx.fill();
      });
      
      animationId = requestAnimationFrame(animate);
    };
    animate();
    
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [accentColor]);
  
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -5 }}
    />
  );
}

export default function MusicArtist() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const { theme: userTheme, themes } = useMusicTheme();
  const { playTrack, currentTrack, isPlaying, setIsPlaying, hasFullyListened } = useAudioPlayer();
  const { wallet, externalWallet, micropay, balance, isConnected } = useWallet();
  const { user: mochaUser } = useAuth();
  const { pay, isExternalWallet } = usePayment();
  const { profile: _myProfile } = useMusicProfile();
  const { titleBarPadding } = useElectronTitleBar();
  
  const [artist, setArtist] = useState<Artist | null>(null);
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [popularTracks, setPopularTracks] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [popularPodcasts, setPopularPodcasts] = useState<Podcast[]>([]);
  const [allPodcasts, setAllPodcasts] = useState<Podcast[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artistReviews, setArtistReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editTheme, setEditTheme] = useState('moonlight');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Avatar cropper state
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  
  // Content management state
  const [showManageContent, setShowManageContent] = useState(false);
  const [deletingTrackId, setDeletingTrackId] = useState<number | null>(null);
  const [deletingPodcastId, setDeletingPodcastId] = useState<number | null>(null);
  const [deletingAlbumId, setDeletingAlbumId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [avatarFileToProcess, setAvatarFileToProcess] = useState<File | null>(null);
  
  // Price editing state
  const [editPriceId, setEditPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  
  // Title editing state
  const [editTitleId, setEditTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  
  // Artist name editing state
  const [editArtistId, setEditArtistId] = useState<string | null>(null);
  const [editArtistValue, setEditArtistValue] = useState('');
  const [savingArtist, setSavingArtist] = useState(false);
  
  // Cover art editing state
  const [editCoverId, setEditCoverId] = useState<string | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  
  // Copy from video profile state
  const [videoProfileExists, setVideoProfileExists] = useState(false);
  const [copyingFromVideo, setCopyingFromVideo] = useState(false);
  
  // Podcast episodes expansion state
  const [expandedPodcastId, setExpandedPodcastId] = useState<number | null>(null);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  
  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  
  // Tipping state
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [isTipping, setIsTipping] = useState(false);
  const [pendingTip, setPendingTip] = useState<{ amount: number; address: string } | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  
  // Fractionalization state
  const [showFractionalizeModal, setShowFractionalizeModal] = useState(false);
  const [fractionalizeTrack, setFractionalizeTrack] = useState<Track | null>(null);
  const [showBuySharesModal, setShowBuySharesModal] = useState(false);
  const [buySharesTrack, setBuySharesTrack] = useState<Track | null>(null);
  
  // Get the theme to display - custom marketplace theme takes priority over built-in themes
  // Use editTheme for live preview when editing, otherwise use saved theme
  const activeThemeId = isEditing ? editTheme : artist?.profileTheme;
  const builtInTheme = artist ? themes.find(t => t.id === activeThemeId) || themes.find(t => t.id === 'moonlight') || themes[0] : userTheme;
  
  // Custom theme from marketplace overrides built-in theme (but not during editing)
  const profileTheme = (!isEditing && customTheme?.themeData) ? {
    id: customTheme.id,
    name: customTheme.title,
    // Generate background from theme data
    background: customTheme.previewImageUrl 
      ? `url(${customTheme.previewImageUrl})`
      : (customTheme.themeData.gradientStart && customTheme.themeData.gradientEnd)
        ? `linear-gradient(${customTheme.themeData.gradientDirection || '180deg'}, ${customTheme.themeData.gradientStart} 0%, ${customTheme.themeData.gradientEnd} 100%)`
        : customTheme.themeData.backgroundColor || '#1a1a2e',
    accent: customTheme.themeData.accentColor || '#6366f1',
    hasParticles: customTheme.hasParticles,
    overlay: customTheme.previewImageUrl ? 'bg-black/30' : undefined
  } : builtInTheme;

  const authToken = (wallet as { authToken?: string } | null)?.authToken || externalWallet?.authToken;
  const isLoggedIn = !!authToken || !!mochaUser;

  // Unified payment function that handles both internal and external wallets
  const unifiedPay = useCallback(async (
    toAddress: string,
    amount: number,
    paymentType?: string
  ) => {
    if (isExternalWallet) {
      return pay(toAddress, amount, { paymentType });
    } else {
      return micropay(toAddress, amount, undefined, paymentType);
    }
  }, [isExternalWallet, pay, micropay]);

  const handleTip = async () => {
    const amount = parseFloat(tipAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid tip amount');
      return;
    }
    
    if (!isConnected) {
      setShowWalletModal(true);
      setShowTipModal(false);
      toast.error('Connect wallet to tip');
      return;
    }
    
    if (balance === null || parseFloat(balance) < amount) {
      toast.error('Insufficient balance');
      return;
    }
    
    if (!artist?.walletAddress) {
      toast.error('Artist has no wallet configured');
      return;
    }
    
    // Store pending tip and show security modal
    setPendingTip({ amount, address: artist.walletAddress });
    setShowTipModal(false);
    setShowSecurityModal(true);
  };

  const executeTip = useCallback(async () => {
    if (!pendingTip || !artist) return;
    
    setShowSecurityModal(false);
    setIsTipping(true);
    
    try {
      const paymentResult = await unifiedPay(pendingTip.address, pendingTip.amount, 'tip');
      if (!paymentResult.success) {
        if (paymentResult.needsConsolidation) {
          toast.error('Your wallet has too many small transactions. Please consolidate your wallet in Settings before continuing.', { duration: 6000 });
          return;
        }
        throw new Error(paymentResult.error || 'Tip failed');
      }
      toast.success(`Tip sent to ${artist.name}!`);
      setTipAmount('');
    } catch (error) {
      console.error('Tip failed:', error);
      toast.error(error instanceof Error ? error.message : 'Tip failed');
    } finally {
      setIsTipping(false);
      setPendingTip(null);
    }
  }, [pendingTip, unifiedPay, artist]);

  // Check if user has a video profile to copy from
  const checkVideoProfile = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const res = await fetch('/api/music/copy-from-video', {
        headers,
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setVideoProfileExists(data.exists);
      }
    } catch (error) {
      console.error('Error checking video profile:', error);
    }
  }, [authToken]);

  // Copy profile data from video site
  const handleCopyFromVideo = useCallback(async () => {
    setCopyingFromVideo(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const res = await fetch('/api/music/copy-from-video', {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to copy profile');
      }
      
      const data = await res.json();
      
      // Populate edit fields with copied data
      if (data.name) setEditName(data.name);
      if (data.handle) setEditHandle(data.handle);
      if (data.bio) setEditBio(data.bio);
      // Avatar and banner are copied directly to the profile - fetchArtist will show them
      
      // Refresh artist data to show updated profile
      fetchArtist();
      
      toast.success('Profile data copied from video site!');
    } catch (error) {
      console.error('Error copying video profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to copy profile');
    } finally {
      setCopyingFromVideo(false);
    }
  }, [authToken, fetchArtist]);

  useEffect(() => {
    fetchArtist();
  }, [artistId, authToken]);

  // Redirect to handle-based URL if using numeric ID but artist has a handle
  useEffect(() => {
    if (artist?.handle && artistId) {
      // Check if current URL uses numeric ID instead of handle
      const isNumericId = /^\d+$/.test(artistId);
      if (isNumericId && artist.handle !== artistId) {
        navigate(`/music/artist/${artist.handle}`, { replace: true });
      }
    }
  }, [artist?.handle, artistId, navigate]);

  // Check if video profile exists for owner
  useEffect(() => {
    if (artist?.isOwner) {
      checkVideoProfile();
    }
  }, [artist?.isOwner, authToken, checkVideoProfile]);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
  }

  async function handleReportSubmit() {
    if (!artist || !reportReason) return;
    setReportSubmitting(true);
    setReportError(null);
    
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const res = await fetch(`/api/music/profile/${artist.id}/report`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ reason: reportReason, details: reportDetails })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit report');
      }
      
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setReportReason('');
        setReportDetails('');
      }, 2000);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setReportSubmitting(false);
    }
  }

  async function fetchArtist() {
    if (!artistId) return;
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const res = await fetch(`/api/music/artist/${artistId}`, { headers });
      if (!res.ok) throw new Error('Artist not found');
      const data = await res.json();
      setArtist(data.artist);
      setCustomTheme(data.customTheme || null);
      setPopularTracks(data.tracks || []);
      setAllTracks(data.allTracks || []);
      setPopularPodcasts(data.popularPodcasts || []);
      setAllPodcasts(data.allPodcasts || []);
      setPlaylists(data.playlists || []);
      setAlbums(data.albums || []);
      setEditName(data.artist.name);
      setEditHandle(data.artist.handle || '');
      setEditBio(data.artist.bio || '');
      setEditTheme(data.artist.profileTheme || 'moonlight');
      
      // Fetch reviews for all tracks
      if (data.allTracks && data.allTracks.length > 0) {
        fetchArtistReviews(data.allTracks);
      }
    } catch (err) {
      console.error('Failed to fetch artist:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchArtistReviews(tracks: Track[]) {
    try {
      const reviewPromises = tracks.slice(0, 10).map(async (track) => {
        const res = await fetch(`/api/music/tracks/${track.id}/reviews`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.reviews || []).map((r: any) => ({
          ...r,
          trackId: track.id,
          trackTitle: track.title,
          trackCoverUrl: track.coverArtUrl
        }));
      });
      
      const allReviews = await Promise.all(reviewPromises);
      const flattenedReviews = allReviews.flat().sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setArtistReviews(flattenedReviews.slice(0, 20));
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    }
  }

  async function handleFollow() {
    if (!artist || !isLoggedIn) return;
    setFollowLoading(true);
    try {
      const method = artist.isFollowing ? 'DELETE' : 'POST';
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/music/follow/${artist.id}`, {
        method,
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        setArtist(prev => prev ? {
          ...prev,
          isFollowing: !prev.isFollowing,
          followerCount: prev.followerCount + (prev.isFollowing ? -1 : 1)
        } : null);
      }
    } catch (err) {
      console.error('Follow error:', err);
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleDeleteTrack(trackId: number) {
    setDeletingTrackId(trackId);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/music/tracks/${trackId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        setPopularTracks(prev => prev.filter(t => t.id !== trackId));
        setAllTracks(prev => prev.filter(t => t.id !== trackId));
        setDeleteConfirmId(null);
      }
    } catch (err) {
      console.error('Delete track error:', err);
    } finally {
      setDeletingTrackId(null);
    }
  }

  async function handleDeletePodcast(podcastId: number) {
    setDeletingPodcastId(podcastId);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/music/podcasts/${podcastId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        setPopularPodcasts(prev => prev.filter(p => p.id !== podcastId));
        setAllPodcasts(prev => prev.filter(p => p.id !== podcastId));
        setDeleteConfirmId(null);
      }
    } catch (err) {
      console.error('Delete podcast error:', err);
    } finally {
      setDeletingPodcastId(null);
    }
  }

  async function handleDeleteAlbum(albumId: number) {
    setDeletingAlbumId(albumId);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/music/albums/${albumId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        setAlbums(prev => prev.filter(a => a.id !== albumId));
        setDeleteConfirmId(null);
        toast.success('Album deleted');
      }
    } catch (err) {
      console.error('Delete album error:', err);
      toast.error('Failed to delete album');
    } finally {
      setDeletingAlbumId(null);
    }
  }

  async function handleSavePrice(type: 'track' | 'episode', id: number) {
    const price = parseFloat(editPriceValue);
    if (editPriceValue && price !== 0 && price < 0.11) {
      alert('Price must be 0 (free) or at least 0.11 KAS');
      return;
    }
    
    setSavingPrice(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const endpoint = type === 'track' 
        ? `/api/music/tracks/${id}` 
        : `/api/music/episodes/${id}`;
      
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ priceKas: editPriceValue || '0' })
      });
      
      if (res.ok) {
        const priceKas = editPriceValue || '0';
        if (type === 'track') {
          setAllTracks(prev => prev.map(t => t.id === id ? { ...t, priceKas } : t));
          setPopularTracks(prev => prev.map(t => t.id === id ? { ...t, priceKas } : t));
        } else {
          // Update episode price in the expanded podcast
          setAllPodcasts(prev => prev.map(p => ({
            ...p,
            episodes: p.episodes?.map(e => e.id === id ? { ...e, priceKas } : e)
          })));
        }
        setEditPriceId(null);
        setEditPriceValue('');
      }
    } catch (err) {
      console.error('Update price error:', err);
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleSaveTitle(type: 'track' | 'podcast' | 'album' | 'episode', id: number) {
    if (!editTitleValue.trim()) {
      alert('Title cannot be empty');
      return;
    }
    
    setSavingTitle(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const endpointMap: Record<string, string> = {
        track: `/api/music/tracks/${id}`,
        podcast: `/api/music/podcasts/${id}`,
        album: `/api/music/albums/${id}`,
        episode: `/api/music/episodes/${id}`
      };
      
      const res = await fetch(endpointMap[type], {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ title: editTitleValue.trim() })
      });
      
      if (res.ok) {
        const title = editTitleValue.trim();
        if (type === 'track') {
          setAllTracks(prev => prev.map(t => t.id === id ? { ...t, title } : t));
          setPopularTracks(prev => prev.map(t => t.id === id ? { ...t, title } : t));
        } else if (type === 'podcast') {
          setAllPodcasts(prev => prev.map(p => p.id === id ? { ...p, title } : p));
          setPopularPodcasts(prev => prev.map(p => p.id === id ? { ...p, title } : p));
        } else if (type === 'episode') {
          setAllPodcasts(prev => prev.map(p => ({
            ...p,
            episodes: p.episodes?.map(e => e.id === id ? { ...e, title } : e)
          })));
        } else if (type === 'album') {
          setAlbums(prev => prev.map(a => a.id === id ? { ...a, title } : a));
        }
        setEditTitleId(null);
        setEditTitleValue('');
        toast.success('Title updated');
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || 'Failed to update title');
      }
    } catch (err) {
      console.error('Update title error:', err);
      toast.error('Failed to update title');
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleSaveArtistName(trackId: number) {
    setSavingArtist(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      
      const res = await fetch(`/api/music/tracks/${trackId}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ artistName: editArtistValue.trim() || null })
      });
      
      if (res.ok) {
        const artistName = editArtistValue.trim() || null;
        setAllTracks(prev => prev.map(t => t.id === trackId ? { ...t, artistName } : t));
        setPopularTracks(prev => prev.map(t => t.id === trackId ? { ...t, artistName } : t));
        setEditArtistId(null);
        setEditArtistValue('');
        toast.success('Artist name updated');
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || 'Failed to update artist name');
      }
    } catch (err) {
      console.error('Update artist name error:', err);
      toast.error('Failed to update artist name');
    } finally {
      setSavingArtist(false);
    }
  }

  async function togglePodcastEpisodes(podcastId: number) {
    if (expandedPodcastId === podcastId) {
      setExpandedPodcastId(null);
      return;
    }
    
    // Check if we already have episodes loaded
    const podcast = allPodcasts.find(p => p.id === podcastId);
    if (podcast?.episodes) {
      setExpandedPodcastId(podcastId);
      return;
    }
    
    setLoadingEpisodes(true);
    setExpandedPodcastId(podcastId);
    
    try {
      const res = await fetch(`/api/music/podcasts/${podcastId}`);
      if (res.ok) {
        const data = await res.json();
        const episodes: Episode[] = (data.episodes || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          durationSeconds: e.duration_seconds || e.durationSeconds || 0,
          priceKas: e.price_kas || e.priceKas || null
        }));
        setAllPodcasts(prev => prev.map(p => 
          p.id === podcastId ? { ...p, episodes } : p
        ));
      }
    } catch (err) {
      console.error('Failed to fetch episodes:', err);
    } finally {
      setLoadingEpisodes(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!artist?.isOwner) return;
    
    setAvatarUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'cover');
    
    try {
      const uploadHeaders: Record<string, string> = {};
      if (authToken) uploadHeaders['Authorization'] = `Bearer ${authToken}`;
      
      const uploadRes = await fetch('/api/upload/music', {
        method: 'POST',
        headers: uploadHeaders,
        credentials: 'include',
        body: formData
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error('Upload failed:', errText);
        throw new Error('Upload failed');
      }
      const { url } = await uploadRes.json();
      
      // Update profile
      const updateHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) updateHeaders['Authorization'] = `Bearer ${authToken}`;
      
      const updateRes = await fetch('/api/music/profile', {
        method: 'PATCH',
        headers: updateHeaders,
        credentials: 'include',
        body: JSON.stringify({ avatarUrl: url })
      });
      
      if (updateRes.ok) {
        setArtist(prev => prev ? { ...prev, avatarUrl: url } : null);
      } else {
        console.error('Profile update failed:', await updateRes.text());
      }
    } catch (err) {
      console.error('Image upload error:', err);
    } finally {
      setAvatarUploading(false);
    }
  }

  // Handle avatar file selection - open cropper
  function handleAvatarFileSelect(file: File) {
    setAvatarFileToProcess(file);
    setShowAvatarCropper(true);
  }

  async function handleSaveProfile() {
    if (!artist?.isOwner) return;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      // Only add Authorization header if we have an auth token (external wallet)
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch('/api/music/profile', {
        method: 'PATCH',
        headers,
        credentials: 'include', // Include cookies for Mocha internal auth
        body: JSON.stringify({ name: editName, handle: editHandle, bio: editBio, profileTheme: editTheme })
      });
      if (res.ok) {
        setArtist(prev => prev ? { ...prev, name: editName, handle: editHandle, bio: editBio, profileTheme: editTheme } : null);
        setIsEditing(false);
      } else {
        const error = await res.json().catch(() => ({}));
        console.error('Save profile error:', error);
      }
    } catch (err) {
      console.error('Save profile error:', err);
    }
  }

  function handlePlayTrack(track: Track) {
    const audioTrack: AudioTrack = {
      id: track.id,
      title: track.title,
      artist: artist?.name || 'Unknown',
      audioUrl: track.audioUrl,
      coverArtUrl: track.coverArtUrl || '',
      durationSeconds: track.durationSeconds
    };
    
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      playTrack(audioTrack);
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f23]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#7dd3fc' }} />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0f23]">
        <Music2 className="w-16 h-16 text-white/30 mb-4" />
        <p className="text-white/60">Artist not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 rounded-full" style={{ backgroundColor: '#7dd3fc', color: '#000' }}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-white relative w-full overflow-x-hidden ${titleBarPadding}`}>
      {/* Background layer - URL-based backgrounds go on fixed div, others on separate layer */}
      {profileTheme.background.startsWith('url') && (
        <div 
          className="fixed inset-0 -z-10"
          style={{ 
            backgroundImage: profileTheme.background,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
            backgroundColor: '#0a0a1a'
          }}
        />
      )}
      {profileTheme.background.startsWith('#') && (
        <div 
          className="fixed inset-0 -z-10"
          style={{ backgroundColor: profileTheme.background }}
        />
      )}
      {!profileTheme.background.startsWith('url') && !profileTheme.background.startsWith('#') && (
        <div 
          className="fixed inset-0 -z-10"
          style={{ background: profileTheme.background }}
        />
      )}
      {profileTheme.overlay && <div className={`fixed inset-0 ${profileTheme.overlay} -z-10`} />}
      
      {/* Particle effects for custom themes */}
      {('hasParticles' in profileTheme) && profileTheme.hasParticles && <ParticleCanvas accentColor={profileTheme.accent} />}
      
      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={avatarInputRef} 
        className="hidden" 
        accept="image/*"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleAvatarFileSelect(e.target.files[0]);
            e.target.value = ''; // Reset so same file can be selected again
          }
        }}
      />


      {/* Banner */}
      <div 
        className="relative h-48 sm:h-64 md:h-80 bg-gradient-to-b from-white/10 to-transparent group"
        style={artist.bannerUrl ? { backgroundImage: `url(${artist.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
      >
        
        {/* Back button */}
        <LocalizedLink 
          to="/music"
          className="absolute top-3 left-3 sm:top-4 sm:left-4 p-1.5 sm:p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors z-10"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </LocalizedLink>



      </div>

      {/* Profile section */}
      <div className="relative z-10 px-3 sm:px-4 md:px-8 -mt-24 sm:-mt-32">
        <div className="max-w-6xl mx-auto">
          {/* Gradient border wrapper for artist section */}
          <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}50 0%, transparent 50%, ${profileTheme.accent}30 100%)` }}>
          <div className="bg-black/60 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col items-center sm:items-start sm:flex-row sm:items-end gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="relative group">
              <div 
                className="w-32 h-32 sm:w-40 sm:h-40 md:w-52 md:h-52 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shadow-2xl border-4 border-black/20"
              >
                {artist.avatarUrl ? (
                  <img src={artist.avatarUrl} alt={artist.name} className="w-full h-full object-cover" />
                ) : (
                  <Music2 className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-white/30" />
                )}
              </div>
              {artist.isOwner && (
                <button
                  onClick={() => !avatarUploading && avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-100"
                >
                  {avatarUploading ? <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" /> : <Camera className="w-6 h-6 sm:w-8 sm:h-8" />}
                </button>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 pb-2 sm:pb-4 text-center sm:text-left">
              <p className="text-xs uppercase tracking-wider text-white/60 mb-1">Artist</p>
              
              {isEditing ? (
                <div className="rounded-lg p-[1px] mb-2" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}50 0%, ${profileTheme.accent}20 100%)` }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-2xl sm:text-4xl md:text-6xl font-bold bg-black/50 rounded-lg px-3 py-1 w-full focus:outline-none"
                  />
                </div>
              ) : (
                <h1 className="text-2xl sm:text-4xl md:text-6xl font-bold mb-1 sm:mb-2">{artist.name}</h1>
              )}
              
              {isEditing ? (
                <div className="rounded-lg p-[1px] mb-2" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}50 0%, ${profileTheme.accent}20 100%)` }}>
                  <div className="flex items-center bg-black/50 rounded-lg px-3 py-1">
                    <span className="text-white/60">@</span>
                    <input
                      type="text"
                      value={editHandle}
                      onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="handle"
                      className="bg-transparent text-white/80 focus:outline-none text-sm sm:text-base"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-white/60 mb-2 sm:mb-3 text-sm sm:text-base">@{artist.handle}</p>
              )}
              
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-4 text-xs sm:text-sm text-white/70">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                  <strong className="text-white">{formatNumber(artist.followerCount)}</strong> <span className="hidden sm:inline">followers</span>
                </span>
                <span>•</span>
                <span><strong className="text-white">{artist.trackCount}</strong> tracks</span>
                <span>•</span>
                <span><strong className="text-white">{formatNumber(artist.totalPlays)}</strong> plays</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 pb-2 sm:pb-4 w-full sm:w-auto">
              {artist.isOwner ? (
                isEditing ? (
                  <>
                    {videoProfileExists && (
                      <button
                        onClick={handleCopyFromVideo}
                        disabled={copyingFromVideo}
                        className="px-4 sm:px-6 py-2 rounded-full border border-white/30 hover:bg-white/10 transition-colors text-sm sm:text-base flex items-center gap-2"
                      >
                        {copyingFromVideo ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Copy Video Profile</span>
                        <span className="sm:hidden">Copy</span>
                      </button>
                    )}
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 sm:px-6 py-2 rounded-full border border-white/30 hover:bg-white/10 transition-colors text-sm sm:text-base"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      className="px-4 sm:px-6 py-2 rounded-full font-semibold text-black transition-colors text-sm sm:text-base"
                      style={{ backgroundColor: profileTheme.accent }}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <div className="rounded-full p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}60 0%, ${profileTheme.accent}20 100%)` }}>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 sm:px-6 py-2 rounded-full bg-black/60 hover:bg-black/40 transition-colors text-sm sm:text-base"
                    >
                      Edit Profile
                    </button>
                  </div>
                )
              ) : isLoggedIn ? (
                <>
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`px-4 sm:px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 text-sm sm:text-base ${
                      artist.isFollowing 
                        ? 'border border-white/30 hover:bg-white/10 text-white' 
                        : 'text-black'
                    }`}
                    style={artist.isFollowing ? {} : { backgroundColor: profileTheme.accent }}
                  >
                    {followLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : artist.isFollowing ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span className="hidden sm:inline">Following</span>
                        <span className="sm:hidden">✓</span>
                      </>
                    ) : (
                      'Follow'
                    )}
                  </button>
                  
                  {/* Tip Button */}
                  {!artist.isOwner && artist.walletAddress && (
                    <div className="rounded-full p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}60 0%, ${profileTheme.accent}20 100%)` }}>
                      <button
                        onClick={() => setShowTipModal(true)}
                        disabled={isTipping}
                        className="px-3 sm:px-5 py-2 rounded-full bg-black/60 hover:bg-black/40 transition-colors flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
                      >
                        {isTipping ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Gift className="w-4 h-4" />
                            <span className="hidden sm:inline">Tip</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : null}
              
              <div className="relative" ref={menuRef}>
                <div className="rounded-full p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}60 0%, ${profileTheme.accent}20 100%)` }}>
                  <button 
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/40 transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
                
                {showMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-zinc-900 border border-white/10 shadow-xl overflow-hidden z-50">
                    <button
                      onClick={() => { handleCopyLink(); setShowMenu(false); }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-white/10 flex items-center gap-3 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copy Profile Link
                    </button>
                    {artist.isOwner && (
                      <button
                        onClick={() => { setIsEditing(true); setShowMenu(false); }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-white/10 flex items-center gap-3 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edit Profile
                      </button>
                    )}
                    {!artist.isOwner && isLoggedIn && (
                      <button
                        onClick={() => { setShowReportModal(true); setShowMenu(false); }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-white/10 flex items-center gap-3 text-red-400 transition-colors"
                      >
                        <Flag className="w-4 h-4" />
                        Report Artist
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bio */}
          {(artist.bio || isEditing) && (
            <div className="mt-6 max-w-2xl">
              <div className="rounded-xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-3">
                  {isEditing ? (
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="Write a bio..."
                      className="w-full bg-transparent border-none resize-none h-24 focus:outline-none"
                    />
                  ) : (
                    <p className="text-white/70">{artist.bio}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Theme selector (only when editing) */}
          {isEditing && artist.isOwner && (
            <div className="mt-6">
              <label className="flex items-center gap-2 text-sm text-white/70 mb-3">
                <Palette className="w-4 h-4" />
                Profile Background Theme
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setEditTheme(t.id)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      editTheme === t.id ? 'border-white ring-2 ring-white/50 scale-105' : 'border-white/20 hover:border-white/40'
                    }`}
                    title={t.name}
                  >
                    <div 
                      className="absolute inset-0"
                      style={{ 
                        background: t.background.startsWith('url') 
                          ? `${t.background} center/cover` 
                          : t.background 
                      }}
                    />
                    {t.overlay && <div className={`absolute inset-0 ${t.overlay}`} />}
                    <div className="absolute inset-0 flex items-end p-1.5">
                      <span className="text-[10px] font-medium text-white drop-shadow-lg truncate w-full text-center">
                        {t.name}
                      </span>
                    </div>
                    {editTheme === t.id && (
                      <div className="absolute top-1 right-1">
                        <Check className="w-4 h-4 text-white drop-shadow-lg" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
          </div>

          {/* Popular Tracks section */}
          {popularTracks.length > 0 && (
          <div className="mt-6 sm:mt-10">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Popular Tracks</h2>
            
            <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-visible">
                  {/* Header - hidden on mobile */}
                  <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 border-b border-white/10 text-xs text-white/50 uppercase tracking-wider">
                    <span className="w-10">#</span>
                    <span>Title</span>
                    <span className="w-20 text-right hidden sm:block">Plays</span>
                    <span className="w-16 text-right">
                      <Clock className="w-4 h-4 inline" />
                    </span>
                  </div>
                  
                  {/* Tracks */}
                  {popularTracks.map((track, index) => {
                    const isCurrentTrack = currentTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-white/5 group cursor-pointer transition-colors ${
                          isCurrentTrack ? 'bg-white/10' : ''
                        }`}
                        onClick={() => handlePlayTrack(track)}
                      >
                        <div className="w-8 sm:w-10 flex items-center justify-center flex-shrink-0">
                          <span className="group-hover:hidden text-white/60 text-sm">{index + 1}</span>
                          <button className="hidden group-hover:block">
                            {isCurrentTrack && isPlaying ? (
                              <Pause className="w-4 h-4" style={{ color: profileTheme.accent }} />
                            ) : (
                              <Play className="w-4 h-4" style={{ color: profileTheme.accent }} />
                            )}
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded bg-white/10 flex-shrink-0 overflow-hidden">
                            {track.coverArtUrl ? (
                              <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music2 className="w-5 h-5 text-white/30" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 sm:gap-2">
                              <p className={`font-medium truncate text-sm sm:text-base ${isCurrentTrack ? '' : ''}`} style={isCurrentTrack ? { color: profileTheme.accent } : {}}>
                                {track.title}
                              </p>
                              <PriceBadge priceKas={track.priceKas} />
                              {/* TEMP DISABLED - FractionBadge */}
                              {false && track.isFractionalized && track.krc20Ticker && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBuySharesTrack(track);
                                    setShowBuySharesModal(true);
                                  }}
                                  className="hover:scale-105 transition-transform"
                                >
                                  <FractionBadge ticker={track.krc20Ticker!} />
                                </button>
                              )}
                              <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                            </div>
                            {track.albumTitle && (
                              <p className="text-xs text-white/50 truncate">{track.albumTitle}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="hidden sm:block w-16 text-right text-white/60 text-sm flex-shrink-0">
                          {formatNumber(track.playCount)}
                        </div>
                        
                        <div className="w-12 sm:w-16 text-right text-white/60 text-xs sm:text-sm flex-shrink-0">
                          {formatDuration(track.durationSeconds)}
                        </div>
                        
                        <div className="w-8 sm:w-10 flex justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {hasFullyListened(track.id) && <ReviewButton 
                            track={{
                              id: track.id,
                              title: track.title,
                              artist: artist?.name || 'Unknown Artist',
                              artistId: artist?.id,
                              audioUrl: track.audioUrl,
                              coverArtUrl: track.coverArtUrl || '',
                              durationSeconds: track.durationSeconds,
                              albumTitle: track.albumTitle || undefined
                            }}
                            accent={profileTheme.accent}
                          />}
                        </div>
                        
                        <div className="w-8 sm:w-10 flex justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <TrackActionsMenu 
                            track={{
                              id: track.id,
                              title: track.title,
                              artist: artist?.name || 'Unknown Artist',
                              artistId: artist?.id,
                              audioUrl: track.audioUrl,
                              coverArtUrl: track.coverArtUrl || '',
                              durationSeconds: track.durationSeconds,
                              albumTitle: track.albumTitle || undefined
                            }}
                            accent={profileTheme.accent}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>
          )}

          {/* All Tracks section */}
          {allTracks.length > 0 && (
          <div className="mt-6 sm:mt-10">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">All Tracks</h2>
            
            <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
              <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-visible">
                {/* Header - hidden on mobile */}
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 border-b border-white/10 text-xs text-white/50 uppercase tracking-wider">
                  <span className="w-10">#</span>
                  <span>Title</span>
                  <span className="w-20 text-right hidden sm:block">Plays</span>
                  <span className="w-16 text-right">
                    <Clock className="w-4 h-4 inline" />
                  </span>
                </div>
                
                {/* Tracks */}
                {allTracks.map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-white/5 group cursor-pointer transition-colors ${
                        isCurrentTrack ? 'bg-white/10' : ''
                      }`}
                      onClick={() => handlePlayTrack(track)}
                    >
                      <div className="w-8 sm:w-10 flex items-center justify-center flex-shrink-0">
                        <span className="group-hover:hidden text-white/60 text-sm">{index + 1}</span>
                        <button className="hidden group-hover:block">
                          {isCurrentTrack && isPlaying ? (
                            <Pause className="w-4 h-4" style={{ color: profileTheme.accent }} />
                          ) : (
                            <Play className="w-4 h-4" style={{ color: profileTheme.accent }} />
                          )}
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded bg-white/10 flex-shrink-0 overflow-hidden">
                          {track.coverArtUrl ? (
                            <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music2 className="w-5 h-5 text-white/30" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium truncate text-sm sm:text-base ${isCurrentTrack ? '' : ''}`} style={isCurrentTrack ? { color: profileTheme.accent } : {}}>
                            {track.title}
                          </p>
                          {track.albumTitle && (
                            <p className="text-xs text-white/50 truncate">{track.albumTitle}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="hidden sm:block w-16 text-right text-white/60 text-sm flex-shrink-0">
                        {formatNumber(track.playCount)}
                      </div>
                      
                      <div className="w-12 sm:w-16 text-right text-white/60 text-xs sm:text-sm flex-shrink-0">
                        {formatDuration(track.durationSeconds)}
                      </div>
                      
                      <div className="w-8 sm:w-10 flex justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {hasFullyListened(track.id) && <ReviewButton 
                          track={{
                            id: track.id,
                            title: track.title,
                            artist: artist?.name || 'Unknown Artist',
                            artistId: artist?.id,
                            audioUrl: track.audioUrl,
                            coverArtUrl: track.coverArtUrl || '',
                            durationSeconds: track.durationSeconds,
                            albumTitle: track.albumTitle || undefined
                          }}
                          accent={profileTheme.accent}
                        />}
                      </div>
                      
                      <div className="w-8 sm:w-10 flex justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <TrackActionsMenu 
                          track={{
                            id: track.id,
                            title: track.title,
                            artist: artist?.name || 'Unknown Artist',
                            artistId: artist?.id,
                            audioUrl: track.audioUrl,
                            coverArtUrl: track.coverArtUrl || '',
                            durationSeconds: track.durationSeconds,
                            albumTitle: track.albumTitle || undefined
                          }}
                          accent={profileTheme.accent}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* Empty state - only show if no tracks at all */}
          {popularTracks.length === 0 && allTracks.length === 0 && (
            <div className="mt-6 sm:mt-10">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Tracks</h2>
              <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                <div className="bg-black/70 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                  <Music2 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-white/30" />
                  <p className="text-white/60 text-sm sm:text-base">No tracks uploaded yet</p>
                  {artist.isOwner && (
                    <LocalizedLink
                      to="/music/upload"
                      className="inline-block mt-4 px-5 sm:px-6 py-2 rounded-full text-black font-semibold text-sm sm:text-base"
                      style={{ backgroundColor: profileTheme.accent }}
                    >
                      Upload Track
                    </LocalizedLink>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Popular Podcasts section */}
          {popularPodcasts.length > 0 && (
          <div className="mt-6 sm:mt-10">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Popular Podcasts</h2>
            <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
              <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 p-3 sm:p-4">
                  {popularPodcasts.map((podcast) => (
                    <LocalizedLink
                      key={podcast.id}
                      to={`/music/podcast/${podcast.id}`}
                      className="group"
                    >
                      <div className="aspect-square rounded-lg overflow-hidden mb-2 sm:mb-3 bg-white/5">
                        {podcast.coverArtUrl ? (
                          <img
                            src={podcast.coverArtUrl}
                            alt={podcast.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-8 h-8 sm:w-12 sm:h-12 text-white/30" />
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-xs sm:text-sm truncate group-hover:underline">{podcast.title}</h3>
                      <p className="text-[10px] sm:text-xs text-white/60 mt-0.5 sm:mt-1">
                        {podcast.episodeCount} ep{podcast.episodeCount !== 1 ? 's' : ''} • {podcast.followerCount} <span className="hidden sm:inline">follower{podcast.followerCount !== 1 ? 's' : ''}</span>
                      </p>
                    </LocalizedLink>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* All Podcasts section */}
          {allPodcasts.length > 0 && (
          <div className="mt-6 sm:mt-10">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">All Podcasts</h2>
            <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
              <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 p-3 sm:p-4">
                  {allPodcasts.map((podcast) => (
                    <LocalizedLink
                      key={podcast.id}
                      to={`/music/podcast/${podcast.id}`}
                      className="group"
                    >
                      <div className="aspect-square rounded-lg overflow-hidden mb-2 sm:mb-3 bg-white/5">
                        {podcast.coverArtUrl ? (
                          <img
                            src={podcast.coverArtUrl}
                            alt={podcast.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-8 h-8 sm:w-12 sm:h-12 text-white/30" />
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-xs sm:text-sm truncate group-hover:underline">{podcast.title}</h3>
                      <p className="text-[10px] sm:text-xs text-white/60 mt-0.5 sm:mt-1">
                        {podcast.episodeCount} ep{podcast.episodeCount !== 1 ? 's' : ''} • {podcast.followerCount} <span className="hidden sm:inline">follower{podcast.followerCount !== 1 ? 's' : ''}</span>
                      </p>
                    </LocalizedLink>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Playlists Section */}
      {playlists.length > 0 && (
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 mt-6 sm:mt-10">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Playlists</h2>
        <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
          <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 p-3 sm:p-4">
              {playlists.map((playlist) => (
                <LocalizedLink
                  key={playlist.id}
                  to={`/music/playlist/${playlist.id}`}
                  className="group"
                >
                  <div className="aspect-square rounded-lg overflow-hidden mb-2 sm:mb-3 bg-white/5">
                    {playlist.coverArtUrl ? (
                      <img
                        src={playlist.coverArtUrl}
                        alt={playlist.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
                        <Music2 className="w-8 h-8 sm:w-12 sm:h-12 text-white/30" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-semibold text-xs sm:text-sm truncate group-hover:underline">{playlist.title}</h3>
                  <p className="text-[10px] sm:text-xs text-white/60 mt-0.5 sm:mt-1">
                    {playlist.trackCount} track{playlist.trackCount !== 1 ? 's' : ''}
                  </p>
                </LocalizedLink>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Reviews Section */}
      {artistReviews.length > 0 && (
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 mt-6 sm:mt-10">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-2">
          <Star className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: profileTheme.accent }} />
          Listener Reviews
        </h2>
        <div className="rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
          <div className="bg-black/70 rounded-xl sm:rounded-2xl overflow-hidden">
            <div className="divide-y divide-white/10">
              {artistReviews.map((review) => (
                <div key={review.id} className="p-3 sm:p-4 hover:bg-white/5 transition-colors">
                  <div className="flex gap-3 sm:gap-4">
                    {/* Track cover */}
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-white/10 flex-shrink-0 overflow-hidden">
                      {review.trackCoverUrl ? (
                        <img src={review.trackCoverUrl} alt={review.trackTitle} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-5 h-5 sm:w-6 sm:h-6 text-white/30" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {/* Review header */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">{review.trackTitle}</p>
                          <div className="flex items-center gap-2 text-xs text-white/50">
                            <span>{review.reviewerName || 'Anonymous'}</span>
                            <span>•</span>
                            <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        {/* Star rating */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                                star <= review.rating 
                                  ? 'fill-current' 
                                  : 'text-white/20'
                              }`}
                              style={star <= review.rating ? { color: profileTheme.accent } : {}}
                            />
                          ))}
                        </div>
                      </div>
                      
                      {/* Comment */}
                      {review.comment && (
                        <p className="text-sm text-white/70 mt-2 line-clamp-2">{review.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Manage Content Section - Owner Only */}
      {artist?.isOwner && (
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 mt-6 sm:mt-10">
          <button
            onClick={() => setShowManageContent(!showManageContent)}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-3 sm:mb-4"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="font-medium text-sm sm:text-base">Manage Content</span>
            <ChevronLeft className={`w-4 h-4 transition-transform ${showManageContent ? '-rotate-90' : 'rotate-180'}`} />
          </button>

          {/* Hidden file input for cover image upload */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file && editCoverId) {
                // Handle tracks, podcasts, and albums
                const isTrack = editCoverId.startsWith('track-');
                const isPodcast = editCoverId.startsWith('podcast-');
                const isAlbum = editCoverId.startsWith('album-');
                const id = parseInt(editCoverId.replace(/^(track|podcast|album)-/, ''));
                
                if (!isNaN(id) && (isTrack || isPodcast || isAlbum)) {
                  setSavingCover(true);
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    const uploadHeaders: Record<string, string> = {};
                    if (authToken) uploadHeaders['Authorization'] = `Bearer ${authToken}`;
                    const uploadRes = await fetch('/api/upload', {
                      method: 'POST',
                      headers: uploadHeaders,
                      credentials: 'include',
                      body: formData
                    });
                    if (!uploadRes.ok) throw new Error('Failed to upload image');
                    const { url: coverArtUrl } = await uploadRes.json();
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                    
                    const endpoint = isTrack ? `/api/music/tracks/${id}` : isAlbum ? `/api/music/albums/${id}` : `/api/music/podcasts/${id}`;
                    const res = await fetch(endpoint, {
                      method: 'PATCH',
                      headers,
                      credentials: 'include',
                      body: JSON.stringify({ coverArtUrl })
                    });
                    if (res.ok) {
                      if (isTrack) {
                        setAllTracks(prev => prev.map(t => t.id === id ? { ...t, coverArtUrl } : t));
                        setPopularTracks(prev => prev.map(t => t.id === id ? { ...t, coverArtUrl } : t));
                      } else if (isAlbum) {
                        setAlbums(prev => prev.map(a => a.id === id ? { ...a, coverArtUrl } : a));
                      } else {
                        setAllPodcasts(prev => prev.map(p => p.id === id ? { ...p, coverArtUrl } : p));
                        setPopularPodcasts(prev => prev.map(p => p.id === id ? { ...p, coverArtUrl } : p));
                      }
                      toast.success('Cover image updated');
                    } else {
                      const error = await res.json().catch(() => ({}));
                      toast.error(error.error || 'Failed to update cover');
                    }
                  } catch (err) {
                    console.error('Update cover error:', err);
                    toast.error('Failed to update cover image');
                  } finally {
                    setSavingCover(false);
                    setEditCoverId(null);
                    e.target.value = '';
                  }
                }
              }
            }}
          />

          {showManageContent && (
            <div className="space-y-6">
              {/* Manage Tracks */}
              {allTracks.length > 0 && (
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Music2 className="w-5 h-5" style={{ color: profileTheme.accent }} />
                      Your Tracks ({allTracks.length})
                    </h3>
                    <div className="space-y-2">
                      {allTracks.map((track) => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div 
                              className="w-10 h-10 rounded bg-white/10 flex-shrink-0 overflow-hidden relative group cursor-pointer"
                              onClick={() => { setEditCoverId(`track-${track.id}`); coverInputRef.current?.click(); }}
                            >
                              {track.coverArtUrl ? (
                                <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Music2 className="w-5 h-5 text-white/30" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-4 h-4 text-white" />
                              </div>
                              {savingCover && editCoverId === `track-${track.id}` && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {editTitleId === `track-${track.id}` ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-sm font-medium"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSaveTitle('track', track.id)}
                                    disabled={savingTitle}
                                    className="p-1 rounded hover:bg-white/10 text-green-400"
                                  >
                                    {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => { setEditTitleId(null); setEditTitleValue(''); }}
                                    className="p-1 rounded hover:bg-white/10 text-white/50"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditTitleId(`track-${track.id}`); setEditTitleValue(track.title); }}
                                  className="font-medium truncate hover:text-white/80 flex items-center gap-1 group"
                                >
                                  {track.title}
                                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                                </button>
                              )}
                              <p className="text-xs text-white/50">{formatNumber(track.playCount)} plays</p>
                              {/* Artist name editing */}
                              {editArtistId === `track-${track.id}` ? (
                                <div className="flex items-center gap-1 mt-1">
                                  <input
                                    type="text"
                                    value={editArtistValue}
                                    onChange={(e) => setEditArtistValue(e.target.value)}
                                    placeholder="Artist name (optional)"
                                    className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-xs"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSaveArtistName(track.id)}
                                    disabled={savingArtist}
                                    className="p-1 rounded hover:bg-white/10 text-green-400"
                                  >
                                    {savingArtist ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  </button>
                                  <button
                                    onClick={() => { setEditArtistId(null); setEditArtistValue(''); }}
                                    className="p-1 rounded hover:bg-white/10 text-white/50"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditArtistId(`track-${track.id}`); setEditArtistValue(track.artistName || ''); }}
                                  className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1 group mt-0.5"
                                >
                                  {track.artistName ? `by ${track.artistName}` : 'Add artist name'}
                                  <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Price editing */}
                          <div className="flex items-center gap-2 mr-3">
                            {editPriceId === `track-${track.id}` ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editPriceValue}
                                  onChange={(e) => setEditPriceValue(e.target.value)}
                                  placeholder="0"
                                  className="w-20 px-2 py-1 rounded bg-white/10 border border-white/20 text-sm text-center"
                                />
                                <span className="text-xs text-white/50">KAS</span>
                                <button
                                  onClick={() => handleSavePrice('track', track.id)}
                                  disabled={savingPrice}
                                  className="p-1 rounded hover:bg-white/10 text-green-400"
                                >
                                  {savingPrice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => { setEditPriceId(null); setEditPriceValue(''); }}
                                  className="p-1 rounded hover:bg-white/10 text-white/50"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditPriceId(`track-${track.id}`); setEditPriceValue(track.priceKas || '0'); }}
                                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs transition-colors flex items-center gap-1"
                              >
                                {parseFloat(track.priceKas || '0') > 0 ? `${track.priceKas} KAS` : 'Free'}
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          
                          {/* TEMP DISABLED - Fractionalize button */}
                          {false && (
                          <button
                            onClick={() => { setFractionalizeTrack(track); setShowFractionalizeModal(true); }}
                            className="p-2 rounded-lg text-white/50 hover:text-purple-400 hover:bg-white/10 transition-colors"
                            title="Fractionalize track"
                          >
                            <PieChart className="w-5 h-5" />
                          </button>
                          )}
                          
                          {deleteConfirmId === `track-${track.id}` ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white/70 mr-2">Delete?</span>
                              <button
                                onClick={() => handleDeleteTrack(track.id)}
                                disabled={deletingTrackId === track.id}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                {deletingTrackId === track.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'Yes'
                                )}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(`track-${track.id}`)}
                              className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Manage Podcasts */}
              {allPodcasts.length > 0 && (
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Music2 className="w-5 h-5" style={{ color: profileTheme.accent }} />
                      Your Podcasts ({allPodcasts.length})
                    </h3>
                    <div className="space-y-2">
                      {allPodcasts.map((podcast) => (
                        <div key={podcast.id} className="space-y-2">
                          <div
                            className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => togglePodcastEpisodes(podcast.id)}>
                              <button className="p-1 rounded hover:bg-white/10 transition-colors">
                                <ChevronDown className={`w-4 h-4 transition-transform ${expandedPodcastId === podcast.id ? 'rotate-0' : '-rotate-90'}`} />
                              </button>
                              <div 
                                className="w-10 h-10 rounded bg-white/10 flex-shrink-0 overflow-hidden relative group cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setEditCoverId(`podcast-${podcast.id}`); coverInputRef.current?.click(); }}
                              >
                                {podcast.coverArtUrl ? (
                                  <img src={podcast.coverArtUrl} alt={podcast.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music2 className="w-5 h-5 text-white/30" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Camera className="w-4 h-4 text-white" />
                                </div>
                                {savingCover && editCoverId === `podcast-${podcast.id}` && (
                                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                {editTitleId === `podcast-${podcast.id}` ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editTitleValue}
                                      onChange={(e) => setEditTitleValue(e.target.value)}
                                      className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-sm font-medium"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSaveTitle('podcast', podcast.id); }}
                                      disabled={savingTitle}
                                      className="p-1 rounded hover:bg-white/10 text-green-400"
                                    >
                                      {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditTitleId(null); setEditTitleValue(''); }}
                                      className="p-1 rounded hover:bg-white/10 text-white/50"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditTitleId(`podcast-${podcast.id}`); setEditTitleValue(podcast.title); }}
                                    className="font-medium truncate hover:text-white/80 flex items-center gap-1 group"
                                  >
                                    {podcast.title}
                                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                                  </button>
                                )}
                                <p className="text-xs text-white/50">
                                  {podcast.episodeCount} episode{podcast.episodeCount !== 1 ? 's' : ''} • {podcast.followerCount} follower{podcast.followerCount !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          
                            {deleteConfirmId === `podcast-${podcast.id}` ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-white/70 mr-2">Delete?</span>
                                <button
                                  onClick={() => handleDeletePodcast(podcast.id)}
                                  disabled={deletingPodcastId === podcast.id}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  {deletingPodcastId === podcast.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    'Yes'
                                  )}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(`podcast-${podcast.id}`)}
                                className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                          
                          {/* Episodes list */}
                          {expandedPodcastId === podcast.id && (
                            <div className="ml-8 space-y-1 border-l border-white/10 pl-4">
                              {loadingEpisodes ? (
                                <div className="flex items-center gap-2 py-2 text-white/50 text-sm">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Loading episodes...
                                </div>
                              ) : podcast.episodes && podcast.episodes.length > 0 ? (
                                podcast.episodes.map((episode) => (
                                  <div key={episode.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {editTitleId === `episode-${episode.id}` ? (
                                        <div className="flex items-center gap-1 flex-1">
                                          <input
                                            type="text"
                                            value={editTitleValue}
                                            onChange={(e) => setEditTitleValue(e.target.value)}
                                            className="flex-1 px-2 py-1 rounded bg-white/10 border border-white/20 text-sm"
                                            autoFocus
                                          />
                                          <button
                                            onClick={() => handleSaveTitle('episode', episode.id)}
                                            disabled={savingTitle}
                                            className="p-1 rounded hover:bg-white/10 text-green-400"
                                          >
                                            {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                          </button>
                                          <button
                                            onClick={() => { setEditTitleId(null); setEditTitleValue(''); }}
                                            className="p-1 rounded hover:bg-white/10 text-white/50"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => { setEditTitleId(`episode-${episode.id}`); setEditTitleValue(episode.title); }}
                                          className="text-sm truncate hover:text-white/80 flex items-center gap-1 group"
                                        >
                                          {episode.title}
                                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                                        </button>
                                      )}
                                      <span className="text-xs text-white/40">
                                        {Math.floor(episode.durationSeconds / 60)}:{String(episode.durationSeconds % 60).padStart(2, '0')}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {editPriceId === `episode-${episode.id}` ? (
                                        <>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editPriceValue}
                                            onChange={(e) => setEditPriceValue(e.target.value)}
                                            className="w-20 px-2 py-1 text-sm rounded bg-black/50 border border-white/20 focus:outline-none focus:border-white/40"
                                            placeholder="0 = free"
                                          />
                                          <button
                                            onClick={() => handleSavePrice('episode', episode.id)}
                                            disabled={savingPrice}
                                            className="p-1 rounded hover:bg-green-600/20 text-green-400 transition-colors disabled:opacity-50"
                                          >
                                            {savingPrice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                          </button>
                                          <button
                                            onClick={() => { setEditPriceId(null); setEditPriceValue(''); }}
                                            className="p-1 rounded hover:bg-red-600/20 text-red-400 transition-colors"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <PriceBadge priceKas={episode.priceKas ?? undefined} size="sm" />
                                          <button
                                            onClick={() => { setEditPriceId(`episode-${episode.id}`); setEditPriceValue(episode.priceKas ?? ''); }}
                                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-white/40 py-2">No episodes</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Manage Albums */}
              {albums.length > 0 && (
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-4">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Music2 className="w-5 h-5" style={{ color: profileTheme.accent }} />
                      Your Albums ({albums.length})
                    </h3>
                    <div className="space-y-2">
                      {albums.map((album) => (
                        <div
                          key={album.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div 
                              className="w-10 h-10 rounded bg-white/10 flex-shrink-0 overflow-hidden relative group cursor-pointer"
                              onClick={() => { setEditCoverId(`album-${album.id}`); coverInputRef.current?.click(); }}
                            >
                              {album.coverArtUrl ? (
                                <img src={album.coverArtUrl} alt={album.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Music2 className="w-5 h-5 text-white/30" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-4 h-4 text-white" />
                              </div>
                              {savingCover && editCoverId === `album-${album.id}` && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              {editTitleId === `album-${album.id}` ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-sm font-medium"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSaveTitle('album', album.id)}
                                    disabled={savingTitle}
                                    className="p-1 rounded hover:bg-white/10 text-green-400"
                                  >
                                    {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => { setEditTitleId(null); setEditTitleValue(''); }}
                                    className="p-1 rounded hover:bg-white/10 text-white/50"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditTitleId(`album-${album.id}`); setEditTitleValue(album.title); }}
                                  className="font-medium truncate hover:text-white/80 flex items-center gap-1 group"
                                >
                                  {album.title}
                                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                                </button>
                              )}
                              <p className="text-xs text-white/50">
                                {album.trackCount} track{album.trackCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        
                          {deleteConfirmId === `album-${album.id}` ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white/70 mr-2">Delete?</span>
                              <button
                                onClick={() => handleDeleteAlbum(album.id)}
                                disabled={deletingAlbumId === album.id}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                {deletingAlbumId === album.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'Yes'
                                )}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(`album-${album.id}`)}
                              className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {allTracks.length === 0 && allPodcasts.length === 0 && albums.length === 0 && (
                <div className="rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${profileTheme.accent}40 0%, transparent 50%, ${profileTheme.accent}20 100%)` }}>
                  <div className="bg-black/70 rounded-2xl p-8 text-center">
                    <Music2 className="w-12 h-12 mx-auto mb-3 text-white/30" />
                    <p className="text-white/60 mb-4">You haven't uploaded any content yet</p>
                    <LocalizedLink
                      to="/music/upload"
                      className="inline-block px-6 py-2 rounded-full text-black font-semibold"
                      style={{ backgroundColor: profileTheme.accent }}
                    >
                      Upload Content
                    </LocalizedLink>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom spacing for audio player */}
      <div className="h-32" />

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Report Artist</h3>
              <button 
                onClick={() => { setShowReportModal(false); setReportError(null); setReportReason(''); setReportDetails(''); }}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="text-center py-8">
                <Check className="w-12 h-12 mx-auto mb-4 text-green-400" />
                <p className="text-lg font-medium">Report Submitted</p>
                <p className="text-white/60 text-sm mt-2">Thank you for helping keep our community safe.</p>
              </div>
            ) : (
              <>
                <p className="text-white/70 text-sm mb-4">
                  Why are you reporting <strong>{artist.name}</strong>?
                </p>

                <div className="space-y-2 mb-4">
                  {[
                    { value: 'spam', label: 'Spam or misleading' },
                    { value: 'harassment', label: 'Harassment or bullying' },
                    { value: 'hate_speech', label: 'Hate speech or discrimination' },
                    { value: 'impersonation', label: 'Impersonation' },
                    { value: 'copyright', label: 'Copyright infringement' },
                    { value: 'inappropriate', label: 'Inappropriate content' },
                    { value: 'other', label: 'Other' },
                  ].map((option) => (
                    <label 
                      key={option.value}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        reportReason === option.value ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={option.value}
                        checked={reportReason === option.value}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        reportReason === option.value ? 'border-white' : 'border-white/40'
                      }`}>
                        {reportReason === option.value && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>

                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Additional details (optional)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm resize-none h-20 mb-4 focus:outline-none focus:border-white/30"
                />

                {reportError && (
                  <p className="text-red-400 text-sm mb-4">{reportError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowReportModal(false); setReportError(null); setReportReason(''); setReportDetails(''); }}
                    className="flex-1 px-4 py-3 rounded-full border border-white/20 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReportSubmit}
                    disabled={!reportReason || reportSubmitting}
                    className="flex-1 px-4 py-3 rounded-full bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {reportSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Report'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Avatar Cropper Modal */}
      {avatarFileToProcess && (
        <ImageCropper
          isOpen={showAvatarCropper}
          onClose={() => {
            setShowAvatarCropper(false);
            setAvatarFileToProcess(null);
          }}
          imageFile={avatarFileToProcess}
          onCropComplete={(croppedFile) => {
            setShowAvatarCropper(false);
            setAvatarFileToProcess(null);
            handleAvatarUpload(croppedFile);
          }}
          aspectRatio="square"
        />
      )}

      {/* Tip Modal */}
      {showTipModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowTipModal(false)}>
          <div 
            className="rounded-2xl border border-white/10 p-6 w-full max-w-sm bg-zinc-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Tip {artist?.name}</h3>
              <button onClick={() => setShowTipModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {[1, 5, 10, 25].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTipAmount(amt.toString())}
                  className={`px-4 py-2 rounded-full border transition-colors ${
                    tipAmount === amt.toString()
                      ? 'border-white/40 bg-white/20'
                      : 'border-white/20 hover:bg-white/10'
                  }`}
                >
                  {amt} KAS
                </button>
              ))}
            </div>

            <div className="relative mb-4">
              <input
                type="number"
                step="0.01"
                min="0"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="Custom amount"
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 pr-16 text-lg focus:outline-none focus:border-white/40"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60">KAS</span>
            </div>

            <button
              onClick={handleTip}
              disabled={isTipping || !tipAmount || parseFloat(tipAmount) <= 0}
              className="w-full py-3 rounded-full font-semibold text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: profileTheme.accent }}
            >
              {isTipping ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Gift className="w-5 h-5" />
                  Send Tip
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Security Verification Modal */}
      <SecurityVerificationModal
        isOpen={showSecurityModal}
        onClose={() => {
          setShowSecurityModal(false);
          setPendingTip(null);
        }}
        onVerified={executeTip}
        transactionType="tip"
        amount={pendingTip?.amount}
      />

      {/* Wallet Modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />
      
      {fractionalizeTrack && (
        <FractionalizeModal
          isOpen={showFractionalizeModal}
          onClose={() => { setShowFractionalizeModal(false); setFractionalizeTrack(null); }}
          track={fractionalizeTrack}
        />
      )}

      {/* Buy Shares Modal */}
      {buySharesTrack && (
        <BuySharesModal
          isOpen={showBuySharesModal}
          onClose={() => { setShowBuySharesModal(false); setBuySharesTrack(null); }}
          track={{
            id: buySharesTrack.id,
            title: buySharesTrack.title,
            coverArtUrl: buySharesTrack.coverArtUrl || '',
            ticker: buySharesTrack.krc20Ticker || '',
            totalShares: buySharesTrack.totalShares || 0,
            sharesSold: buySharesTrack.sharesSold || 0,
            availableShares: (buySharesTrack.totalShares || 0) - (buySharesTrack.sharesSold || 0),
            percentageSold: buySharesTrack.totalShares ? ((buySharesTrack.sharesSold || 0) / buySharesTrack.totalShares) * 100 : 0,
            pricePerShare: 0.1,
            artistName: artist?.name || 'Unknown Artist',
            artistHandle: artist?.handle || '',
            artistAvatar: artist?.avatarUrl
          }}
          onPurchaseComplete={() => {
            // Refresh tracks data after purchase
            if (artistId) {
              fetch(`/api/music/artist/${artistId}`)
                .then(res => res.json())
                .then(data => {
                  if (data.allTracks) setAllTracks(data.allTracks);
                  if (data.popularTracks) setPopularTracks(data.popularTracks);
                });
            }
          }}
        />
      )}
    </div>
  );
}
