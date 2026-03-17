import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { useElectronTitleBar } from "../components/ElectronTitleBar";
import LocalizedLink from "../components/LocalizedLink";
import { useLocalizedNavigate } from "../components/LanguageRouter";
import { useWallet } from "../contexts/WalletContext";
import { formatKas, formatViews } from "../hooks/useKasShi";
import { KaspaIcon } from "../components/KasShiLogo";
import { 
  BarChart3, 
  Eye, 
  Users, 
  Heart, 
  TrendingUp, 
  Video,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Play,
  DollarSign,
  Pencil,
  Trash2,
  ExternalLink,
  MoreVertical,
  Clock,
  CheckCircle,
  AlertCircle,
  Wallet,
  ArrowUp,
  Copy,
  CheckCheck,
  MessageSquare,
  Timer,
  UserPlus,
  UserCheck,
  Target,
  LayoutGrid,
  LineChart as LineChartIcon,
  Film,
  Coins,
  Gift,
  Music,
  Mic2,
  ThumbsUp,
  Star
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DashboardStats {
  totalViews: number;
  uniqueViewers: number;
  totalLikes: number;
  likeRate: number;
  subscriberCount: number;
  totalVideos: number;
  totalKasEarned: string;
  viewsChange: number;
  likesChange: number;
  revenueChange: number;
  totalWatchTimeSeconds: number;
  avgWatchTimeSeconds: number;
  completionRate: number;
  newViewers: number;
  returningViewers: number;
}

interface ChartDataPoint {
  date: string;
  views: number;
  earnings: number;
  label: string;
}

interface SubscriberDataPoint {
  date: string;
  label: string;
  newSubscribers: number;
  cumulative: number;
}

interface PeakHourData {
  hour: number;
  label: string;
  views: number;
}

interface PeakDayData {
  day: number;
  label: string;
  views: number;
}

interface TopComment {
  id: number;
  content: string;
  likeCount: number;
  createdAt: string;
  videoId: number;
  videoTitle: string;
  commenterName: string;
  commenterHandle: string | null;
  commenterAvatar: string | null;
}

interface VideoEarnings {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number;
  priceKas: string | null;
  totalEarned: string;
  periodEarnings: number;
  periodViews: number;
  paymentCount: number;
}

interface EarningsBySource {
  type: string;
  total: number;
  count: number;
}

interface ManagedVideo {
  id: number;
  publicId: string;
  title: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  viewCount: number;
  likeCount: number;
  priceKas: string | null;
  duration: number | null;
  bunnyStatus: number | null;
  createdAt: string;
  isMembersOnly: boolean;
}

interface WithdrawalRecord {
  id: number;
  amount: string;
  toAddress: string;
  transactionId: string | null;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

interface WithdrawOverview {
  currentBalance: string;
  pendingBalance: string;
  totalWithdrawn: string;
  withdrawalCount: number;
  recentWithdrawals: WithdrawalRecord[];
  walletAddress: string;
}

interface MusicDashboardStats {
  hasProfile: boolean;
  totalPlays: number;
  totalTracks: number;
  totalAlbums: number;
  followers: number;
  earnings: string;
  topTracks: MusicTrackStat[];
}

interface MusicTrackStat {
  id: number;
  title: string;
  coverArtUrl: string | null;
  playCount: number;
  priceKas: string | null;
  albumTitle: string | null;
}

interface ManagedMusicTrack {
  id: number;
  title: string;
  coverArtUrl: string | null;
  audioUrl: string | null;
  playCount: number;
  likeCount: number;
  priceKas: string | null;
  durationSeconds: number | null;
  albumTitle: string | null;
  createdAt: string;
}

interface PodcastDashboardStats {
  hasProfile: boolean;
  totalPlays: number;
  totalEpisodes: number;
  totalPodcasts: number;
  subscribers: number;
  earnings: string;
  topEpisodes: PodcastEpisodeStat[];
}

interface PodcastEpisodeStat {
  id: number;
  title: string;
  coverArtUrl: string | null;
  playCount: number;
  priceKas: string | null;
  durationSeconds: number | null;
  podcastTitle: string;
}

interface ManagedPodcastEpisode {
  id: number;
  title: string;
  coverArtUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  playCount: number;
  priceKas: string | null;
  durationSeconds: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  podcastTitle: string;
  createdAt: string;
}

interface MusicReview {
  id: number;
  trackId: number;
  trackTitle: string;
  trackCoverUrl: string | null;
  rating: number;
  comment: string | null;
  reviewerName: string | null;
  reviewerAvatar: string | null;
  rewardKas: string | null;
  createdAt: string;
}

type TimeRange = '7d' | '30d' | '90d';
type TabType = 'overview' | 'analytics' | 'videos' | 'earnings' | 'music' | 'podcasts' | 'reviews';

// Helper to validate cover art URLs - filters out malformed/broken URLs
function isValidCoverUrl(url: string | null): boolean {
  if (!url || !url.trim()) return false;
  const trimmed = url.trim();
  // Valid URLs start with http, https, or /api/
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/api/');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  format = 'number',
  subtitle
}: { 
  title: string; 
  value: number | string; 
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  format?: 'number' | 'percent' | 'kas';
  subtitle?: string;
}) {
  const formattedValue = format === 'percent' 
    ? `${(Number(value) * 100).toFixed(1)}%`
    : format === 'kas'
    ? formatKas(String(value))
    : formatViews(Number(value));
  
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-[#70C7BA]/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-[#70C7BA]/10 rounded-lg">
          <Icon className="w-5 h-5 text-[#70C7BA]" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-400'
          }`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : isNegative ? <ArrowDownRight className="w-3 h-3" /> : null}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">
        {format === 'kas' && <KaspaIcon className="w-5 h-5 inline mr-1 -mt-1" />}
        {formattedValue}
      </div>
      <div className="text-sm text-slate-400">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
        <p className="text-slate-300 text-sm mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm">
            <span className="text-slate-400">{entry.name === 'views' ? 'Views' : 'Earnings'}: </span>
            <span className="text-white font-medium">
              {entry.name === 'views' ? formatViews(entry.value) : `${formatKas(String(entry.value))} KAS`}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const navigate = useLocalizedNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const { channel, isConnected, externalWallet, isLoading: walletLoading } = useWallet();
  
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [subscriberChartData, setSubscriberChartData] = useState<SubscriberDataPoint[]>([]);
  const [peakHoursData, setPeakHoursData] = useState<PeakHourData[]>([]);
  const [peakDaysData, setPeakDaysData] = useState<PeakDayData[]>([]);
  const [topComments, setTopComments] = useState<TopComment[]>([]);
  const [videoEarnings, setVideoEarnings] = useState<VideoEarnings[]>([]);
  const [earningsBySource, setEarningsBySource] = useState<EarningsBySource[]>([]);
  const [managedVideos, setManagedVideos] = useState<ManagedVideo[]>([]);
  const [withdrawOverview, setWithdrawOverview] = useState<WithdrawOverview | null>(null);
  const [musicStats, setMusicStats] = useState<MusicDashboardStats | null>(null);
  const [musicTracks, setMusicTracks] = useState<ManagedMusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [podcastStats, setPodcastStats] = useState<PodcastDashboardStats | null>(null);
  const [podcastEpisodes, setPodcastEpisodes] = useState<ManagedPodcastEpisode[]>([]);
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [musicReviews, setMusicReviews] = useState<MusicReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [deletingVideoId, setDeletingVideoId] = useState<number | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [chartsMounted, setChartsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setChartsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (walletLoading) return;
    
    if (!isConnected && !externalWallet) {
      navigate('/');
      return;
    }

    const fetchDashboardData = async () => {
      if (!channel?.id && !externalWallet) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const channelId = channel?.id;
        const authToken = externalWallet?.authToken;
        
        const headers: Record<string, string> = {};
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetch(
          `/api/kasshi/dashboard/analytics?channelId=${channelId || ''}&range=${timeRange}`,
          { headers }
        );
        
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats);
          setChartData(data.chartData || []);
          setSubscriberChartData(data.subscriberChartData || []);
          setPeakHoursData(data.peakHoursData || []);
          setPeakDaysData(data.peakDaysData || []);
          setTopComments(data.topComments || []);
        }
        
        const earningsResponse = await fetch(
          `/api/kasshi/dashboard/earnings?channelId=${channelId || ''}&range=${timeRange}`,
          { headers }
        );
        
        if (earningsResponse.ok) {
          const earningsData = await earningsResponse.json();
          setVideoEarnings(earningsData.videos || []);
          setEarningsBySource(earningsData.earningsBySource || []);
        }
        
        const videosResponse = await fetch(
          `/api/kasshi/dashboard/videos?channelId=${channelId || ''}`,
          { headers }
        );
        
        if (videosResponse.ok) {
          const videosData = await videosResponse.json();
          setManagedVideos(videosData.videos || []);
        }
        
        const withdrawResponse = await fetch(
          `/api/kasshi/dashboard/withdraw?channelId=${channelId || ''}`,
          { headers }
        );
        
        if (withdrawResponse.ok) {
          const withdrawData = await withdrawResponse.json();
          setWithdrawOverview(withdrawData);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [channel?.id, externalWallet, timeRange, isConnected, navigate, walletLoading]);

  // Fetch music dashboard data when music tab is active
  useEffect(() => {
    if (activeTab !== 'music') return;
    if (!isConnected && !externalWallet) return;
    
    const fetchMusicData = async () => {
      setMusicLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        
        const [analyticsRes, tracksRes] = await Promise.all([
          fetch('/api/music/dashboard/analytics', { headers, credentials: 'include' }),
          fetch('/api/music/dashboard/tracks', { headers, credentials: 'include' })
        ]);
        
        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setMusicStats(data);
        }
        
        if (tracksRes.ok) {
          const data = await tracksRes.json();
          setMusicTracks(data.tracks || []);
        }
      } catch (error) {
        console.error('Failed to fetch music dashboard data:', error);
      } finally {
        setMusicLoading(false);
      }
    };
    
    fetchMusicData();
  }, [activeTab, externalWallet, isConnected]);

  // Fetch podcast dashboard data when podcasts tab is active
  useEffect(() => {
    if (activeTab !== 'podcasts') return;
    if (!isConnected && !externalWallet) return;
    
    const fetchPodcastData = async () => {
      setPodcastLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        
        const [analyticsRes, episodesRes] = await Promise.all([
          fetch('/api/podcast/dashboard/analytics', { headers, credentials: 'include' }),
          fetch('/api/podcast/dashboard/episodes', { headers, credentials: 'include' })
        ]);
        
        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setPodcastStats(data);
        }
        
        if (episodesRes.ok) {
          const data = await episodesRes.json();
          setPodcastEpisodes(data.episodes || []);
        }
      } catch (error) {
        console.error('Failed to fetch podcast dashboard data:', error);
      } finally {
        setPodcastLoading(false);
      }
    };
    
    fetchPodcastData();
  }, [activeTab, externalWallet, isConnected]);

  // Fetch music reviews when reviews tab is active
  useEffect(() => {
    if (activeTab !== 'reviews') return;
    if (!isConnected && !externalWallet) return;
    
    const fetchReviews = async () => {
      setReviewsLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (externalWallet?.authToken) {
          headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
        }
        
        const res = await fetch('/api/music/dashboard/reviews', { headers, credentials: 'include' });
        
        if (res.ok) {
          const data = await res.json();
          setMusicReviews(data.reviews || []);
        }
      } catch (error) {
        console.error('Failed to fetch music reviews:', error);
      } finally {
        setReviewsLoading(false);
      }
    };
    
    fetchReviews();
  }, [activeTab, externalWallet, isConnected]);

  if (!isConnected && !externalWallet) {
    return null;
  }

  const handleDeleteVideo = async (videoId: number) => {
    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return;
    }
    
    setDeletingVideoId(videoId);
    setActiveDropdown(null);
    
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (externalWallet?.authToken) {
        headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
      }
      
      const response = await fetch(`/api/kasshi/videos/${videoId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ channelId: channel?.id })
      });
      
      if (response.ok) {
        setManagedVideos(prev => prev.filter(v => v.id !== videoId));
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete video');
      }
    } catch (error) {
      console.error('Failed to delete video:', error);
      alert('Failed to delete video');
    } finally {
      setDeletingVideoId(null);
    }
  };

  const formatVideoDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatWatchTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const getVideoStatus = (video: ManagedVideo) => {
    if (video.bunnyStatus === 4) {
      return { icon: CheckCircle, text: 'Ready', color: 'text-green-400' };
    }
    if (video.bunnyStatus !== null && video.bunnyStatus < 4) {
      return { icon: Clock, text: 'Encoding', color: 'text-amber-400' };
    }
    if (video.bunnyStatus === 5) {
      return { icon: AlertCircle, text: 'Error', color: 'text-red-400' };
    }
    if (video.videoUrl) {
      return { icon: CheckCircle, text: 'Ready', color: 'text-green-400' };
    }
    return { icon: AlertCircle, text: 'No video', color: 'text-slate-400' };
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutGrid },
    { id: 'analytics' as TabType, label: 'Analytics', icon: LineChartIcon },
    { id: 'videos' as TabType, label: 'Videos', icon: Film },
    { id: 'earnings' as TabType, label: 'Video Earnings', icon: Coins },
    { id: 'music' as TabType, label: 'Music', icon: Music },
    { id: 'podcasts' as TabType, label: 'Podcasts', icon: Mic2 },
    { id: 'reviews' as TabType, label: 'Reviews', icon: Star },
  ];

  return (
    <div className={`min-h-screen bg-background ${titleBarPadding}`}>
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Creator Dashboard</h1>
            <p className="text-slate-400">Track your channel performance and earnings</p>
          </div>
          
          {/* Time Range Selector */}
          <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1">
            {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  timeRange === range 
                    ? 'bg-[#70C7BA] text-slate-900 font-medium' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-slate-800/30 rounded-xl mb-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#70C7BA] text-slate-900 shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#70C7BA]" />
          </div>
        ) : stats ? (
          <>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Overview */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Quick Stats */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-[#70C7BA]/20 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-[#70C7BA]" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Key Metrics</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <StatCard title="Total Views" value={stats.totalViews} change={stats.viewsChange} icon={Eye} />
                    <StatCard title="Unique Viewers" value={stats.uniqueViewers} icon={Users} />
                    <StatCard title="Total Likes" value={stats.totalLikes} change={stats.likesChange} icon={Heart} />
                    <StatCard title="Like Rate" value={stats.likeRate} icon={TrendingUp} format="percent" />
                    <StatCard title="Subscribers" value={stats.subscriberCount} icon={Users} />
                    <StatCard title="Revenue" value={stats.totalKasEarned} change={stats.revenueChange} icon={BarChart3} format="kas" />
                  </div>
                </section>

                {/* Channel Overview */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Video className="w-5 h-5 text-blue-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Channel Overview</h2>
                  </div>
                  
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <div className="text-slate-400 text-sm mb-1">Total Videos</div>
                        <div className="text-xl font-bold text-white flex items-center gap-2">
                          <Video className="w-5 h-5 text-[#70C7BA]" />
                          {stats.totalVideos}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-sm mb-1">Avg Views/Video</div>
                        <div className="text-xl font-bold text-white">
                          {stats.totalVideos > 0 ? formatViews(Math.round(stats.totalViews / stats.totalVideos)) : '0'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-sm mb-1">Avg Likes/Video</div>
                        <div className="text-xl font-bold text-white">
                          {stats.totalVideos > 0 ? formatViews(Math.round(stats.totalLikes / stats.totalVideos)) : '0'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-sm mb-1">Avg Earnings/Video</div>
                        <div className="text-xl font-bold text-white flex items-center gap-1">
                          <KaspaIcon className="w-4 h-4" />
                          {stats.totalVideos > 0 ? (parseFloat(stats.totalKasEarned) / stats.totalVideos).toFixed(2) : '0'}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Views Chart */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-purple-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Views Over Time</h2>
                  </div>
                  
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="h-64">
                      {chartsMounted && chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#70C7BA" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#70C7BA" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="label" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value: number) => formatViews(value)} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="views" stroke="#70C7BA" strokeWidth={2} fill="url(#viewsGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                          No view data yet
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-4">
                  <LocalizedLink to="/upload" className="px-6 py-3 bg-[#70C7BA] text-slate-900 font-medium rounded-lg hover:bg-[#5DB8AA] transition-colors">
                    Upload New Video
                  </LocalizedLink>
                  {channel && (
                    <LocalizedLink to={`/channel/${channel.handle}`} className="px-6 py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600 transition-colors">
                      View My Channel
                    </LocalizedLink>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Analytics */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'analytics' && (
              <div className="space-y-8">
                {/* Engagement Stats */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Users className="w-5 h-5 text-purple-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Engagement</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                        <Timer className="w-4 h-4" />
                        Watch Time
                      </div>
                      <div className="text-xl font-bold text-white">{formatWatchTime(stats.totalWatchTimeSeconds || 0)}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                        <Clock className="w-4 h-4" />
                        Avg View Duration
                      </div>
                      <div className="text-xl font-bold text-white">{formatWatchTime(stats.avgWatchTimeSeconds || 0)}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                        <Target className="w-4 h-4" />
                        Completion Rate
                      </div>
                      <div className="text-xl font-bold text-white">{((stats.completionRate || 0) * 100).toFixed(1)}%</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                        <UserPlus className="w-4 h-4" />
                        New / Returning
                      </div>
                      <div className="text-xl font-bold text-white">
                        <span className="text-[#70C7BA]">{stats.newViewers || 0}</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-blue-400">{stats.returningViewers || 0}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Subscriber Growth */}
                  <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-semibold text-white">Subscriber Growth</h2>
                      <UserCheck className="w-5 h-5 text-[#70C7BA]" />
                    </div>
                    <div className="h-64">
                      {chartsMounted && subscriberChartData.length > 0 && subscriberChartData.some(d => d.cumulative > 0) ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <AreaChart data={subscriberChartData}>
                            <defs>
                              <linearGradient id="subGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="label" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} labelStyle={{ color: '#94a3b8' }} formatter={(value) => [value ?? 0, 'Total Subscribers']} />
                            <Area type="monotone" dataKey="cumulative" stroke="#3B82F6" strokeWidth={2} fill="url(#subGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">No subscriber data yet</div>
                      )}
                    </div>
                  </section>

                  {/* Peak Hours */}
                  <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-semibold text-white">Peak Viewing Hours</h2>
                      <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="h-64">
                      {chartsMounted && peakHoursData.length > 0 && peakHoursData.some(d => d.views > 0) ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart data={peakHoursData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="label" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} interval={2} />
                            <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} labelStyle={{ color: '#94a3b8' }} formatter={(value) => [value ?? 0, 'Views']} />
                            <Bar dataKey="views" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">No peak hours data yet</div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Peak Days & Top Comments */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Peak Days */}
                  <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-semibold text-white">Views by Day</h2>
                      <Calendar className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="h-48">
                      {chartsMounted && peakDaysData.length > 0 && peakDaysData.some(d => d.views > 0) ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <BarChart data={peakDaysData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                            <XAxis type="number" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <YAxis type="category" dataKey="label" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} width={40} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} labelStyle={{ color: '#94a3b8' }} formatter={(value) => [value ?? 0, 'Views']} />
                            <Bar dataKey="views" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">No daily data yet</div>
                      )}
                    </div>
                  </section>

                  {/* Top Comments */}
                  <section className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-white">Top Comments</h2>
                      <MessageSquare className="w-5 h-5 text-green-500" />
                    </div>
                    {topComments.length > 0 ? (
                      <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                        {topComments.slice(0, 5).map((comment) => (
                          <LocalizedLink key={comment.id} to={`/watch/${comment.videoId}`} className="block p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors group">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden">
                                {comment.commenterAvatar ? (
                                  <img src={comment.commenterAvatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-medium">
                                    {comment.commenterName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium text-white">{comment.commenterName}</span>
                                  <span className="text-xs text-slate-500">on "{comment.videoTitle.slice(0, 30)}{comment.videoTitle.length > 30 ? '...' : ''}"</span>
                                </div>
                                <p className="text-sm text-slate-300 line-clamp-2">{comment.content}</p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{comment.likeCount}</span>
                                  <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          </LocalizedLink>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No comments yet</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Videos */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'videos' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/20 rounded-lg">
                      <Play className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Manage Videos</h2>
                      <p className="text-sm text-slate-400">Edit, view, or delete your content</p>
                    </div>
                  </div>
                  <LocalizedLink to="/upload" className="px-4 py-2 bg-[#70C7BA] text-slate-900 text-sm font-medium rounded-lg hover:bg-[#5DB8AA] transition-colors">
                    + Upload
                  </LocalizedLink>
                </div>

                {managedVideos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {managedVideos.map((video) => {
                      const status = getVideoStatus(video);
                      const StatusIcon = status.icon;
                      
                      return (
                        <div key={video.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600 transition-colors group">
                          {/* Thumbnail */}
                          <div className="relative aspect-video bg-slate-800">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Video className="w-8 h-8 text-slate-600" />
                              </div>
                            )}
                            
                            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-xs text-white font-medium">
                              {formatVideoDuration(video.duration)}
                            </div>
                            
                            <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-black/80 rounded text-xs ${status.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {status.text}
                            </div>
                            
                            {video.priceKas && parseFloat(video.priceKas) > 0 && (
                              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-green-600/90 rounded text-xs text-white font-medium">
                                <KaspaIcon className="w-3 h-3" />
                                {parseFloat(video.priceKas).toFixed(2)}
                              </div>
                            )}
                            
                            {video.isMembersOnly && (
                              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-purple-600/90 rounded text-xs text-white font-medium">
                                Members
                              </div>
                            )}
                            
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <LocalizedLink to={`/watch/${video.publicId || video.id}`} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors" title="View">
                                <ExternalLink className="w-5 h-5 text-white" />
                              </LocalizedLink>
                              <LocalizedLink to={`/edit/${video.id}`} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors" title="Edit">
                                <Pencil className="w-5 h-5 text-white" />
                              </LocalizedLink>
                              <button onClick={() => handleDeleteVideo(video.id)} disabled={deletingVideoId === video.id} className="p-2 bg-red-500/50 hover:bg-red-500/70 rounded-full transition-colors disabled:opacity-50" title="Delete">
                                {deletingVideoId === video.id ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Trash2 className="w-5 h-5 text-white" />}
                              </button>
                            </div>
                          </div>
                          
                          {/* Info */}
                          <div className="p-3">
                            <h3 className="text-sm font-medium text-white truncate mb-2" title={video.title}>{video.title}</h3>
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatViews(video.viewCount)}</span>
                                <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatViews(video.likeCount)}</span>
                              </div>
                              
                              {/* Mobile dropdown */}
                              <div className="relative md:hidden">
                                <button onClick={() => setActiveDropdown(activeDropdown === video.id ? null : video.id)} className="p-1 hover:bg-slate-700 rounded">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                
                                {activeDropdown === video.id && (
                                  <div className="absolute right-0 bottom-full mb-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden z-10">
                                    <LocalizedLink to={`/watch/${video.publicId || video.id}`} className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-slate-700">
                                      <ExternalLink className="w-4 h-4" />View
                                    </LocalizedLink>
                                    <LocalizedLink to={`/edit/${video.id}`} className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-slate-700">
                                      <Pencil className="w-4 h-4" />Edit
                                    </LocalizedLink>
                                    <button onClick={() => handleDeleteVideo(video.id)} disabled={deletingVideoId === video.id} className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 w-full text-left">
                                      <Trash2 className="w-4 h-4" />Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <Video className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-slate-400 mb-4">No videos uploaded yet</p>
                    <LocalizedLink to="/upload" className="inline-flex px-4 py-2 bg-[#70C7BA] text-slate-900 text-sm font-medium rounded-lg hover:bg-[#5DB8AA] transition-colors">
                      Upload Your First Video
                    </LocalizedLink>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Music */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'music' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Music className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Music Analytics</h2>
                      <p className="text-sm text-slate-400">Track your music performance and earnings</p>
                    </div>
                  </div>
                  <LocalizedLink to="/music/upload" className="px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors">
                    + Upload Track
                  </LocalizedLink>
                </div>

                {musicLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  </div>
                ) : !musicStats?.hasProfile ? (
                  <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <Music className="w-12 h-12 mx-auto mb-3 text-purple-500/50" />
                    <p className="text-slate-400 mb-2">No music profile yet</p>
                    <p className="text-sm text-slate-500 mb-4">Create a music profile to start uploading tracks</p>
                    <LocalizedLink to="/music" className="inline-flex px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors">
                      Create Profile
                    </LocalizedLink>
                  </div>
                ) : (
                  <>
                    {/* Music Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Play className="w-4 h-4" />
                          Total Plays
                        </div>
                        <div className="text-2xl font-bold text-white">{musicStats.totalPlays.toLocaleString()}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Music className="w-4 h-4" />
                          Total Tracks
                        </div>
                        <div className="text-2xl font-bold text-white">{musicStats.totalTracks}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Users className="w-4 h-4" />
                          Followers
                        </div>
                        <div className="text-2xl font-bold text-white">{musicStats.followers.toLocaleString()}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Coins className="w-4 h-4" />
                          Earnings
                        </div>
                        <div className="text-2xl font-bold text-[#70C7BA] flex items-center gap-1">
                          <KaspaIcon className="w-5 h-5" />{parseFloat(musicStats.earnings || '0').toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Top Tracks */}
                    {musicStats.topTracks && musicStats.topTracks.length > 0 && (
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <h3 className="text-white font-semibold mb-4">Top Tracks</h3>
                        <div className="space-y-3">
                          {musicStats.topTracks.slice(0, 5).map((track, index) => (
                            <div key={track.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                              <span className="w-6 text-center text-slate-500 font-medium">{index + 1}</span>
                              <div className="w-10 h-10 rounded bg-slate-700 overflow-hidden flex-shrink-0">
                                {isValidCoverUrl(track.coverArtUrl) ? (
                                  <img src={track.coverArtUrl!} alt={track.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music className="w-5 h-5 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{track.title}</p>
                                <p className="text-slate-400 text-xs truncate">{track.albumTitle || 'Single'}</p>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-slate-400">{track.playCount.toLocaleString()} plays</span>
                                {track.priceKas && parseFloat(track.priceKas) > 0 && (
                                  <span className="text-[#70C7BA] flex items-center gap-1">
                                    <KaspaIcon className="w-3.5 h-3.5" />{parseFloat(track.priceKas).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Manage Tracks */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-4">Your Tracks ({musicTracks.length})</h3>
                      {musicTracks.length === 0 ? (
                        <div className="text-center py-8">
                          <Music className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                          <p className="text-slate-400 text-sm">No tracks uploaded yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {musicTracks.map((track) => (
                            <div key={track.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                              <div className="w-12 h-12 rounded bg-slate-700 overflow-hidden flex-shrink-0">
                                {isValidCoverUrl(track.coverArtUrl) ? (
                                  <img src={track.coverArtUrl!} alt={track.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music className="w-6 h-6 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{track.title}</p>
                                <p className="text-slate-400 text-xs">{track.albumTitle || 'Single'}</p>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Play className="w-3 h-3" />{track.playCount}
                                </span>
                                <span className="text-slate-400 flex items-center gap-1">
                                  <ThumbsUp className="w-3 h-3" />{track.likeCount}
                                </span>
                                {track.priceKas && parseFloat(track.priceKas) > 0 ? (
                                  <span className="text-[#70C7BA] flex items-center gap-1">
                                    <KaspaIcon className="w-3 h-3" />{parseFloat(track.priceKas).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-blue-400 text-xs">Free</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Podcasts */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'podcasts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <Mic2 className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Podcast Analytics</h2>
                      <p className="text-sm text-slate-400">Track your podcast performance and listener engagement</p>
                    </div>
                  </div>
                  <LocalizedLink to="/music/upload" className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors">
                    + Upload Episode
                  </LocalizedLink>
                </div>

                {podcastLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
                  </div>
                ) : !podcastStats?.hasProfile ? (
                  <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <Mic2 className="w-12 h-12 mx-auto mb-3 text-orange-500/50" />
                    <p className="text-slate-400 mb-2">Create a music profile to start uploading podcasts</p>
                    <p className="text-sm text-slate-500 mb-4">Your podcast analytics will appear here</p>
                    <LocalizedLink to="/music" className="inline-flex px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors">
                      Create Profile
                    </LocalizedLink>
                  </div>
                ) : (
                  <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-orange-500/30 transition-colors">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Play className="w-4 h-4" />
                          Total Listens
                        </div>
                        <div className="text-2xl font-bold text-white">{(podcastStats.totalPlays || 0).toLocaleString()}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-orange-500/30 transition-colors">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Mic2 className="w-4 h-4" />
                          Episodes
                        </div>
                        <div className="text-2xl font-bold text-white">{podcastStats.totalEpisodes || 0}</div>
                        <div className="text-xs text-slate-500 mt-1">{podcastStats.totalPodcasts || 0} podcasts</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-orange-500/30 transition-colors">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Users className="w-4 h-4" />
                          Followers
                        </div>
                        <div className="text-2xl font-bold text-white">{(podcastStats.subscribers || 0).toLocaleString()}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-orange-500/30 transition-colors">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Coins className="w-4 h-4" />
                          Earnings
                        </div>
                        <div className="text-2xl font-bold text-[#70C7BA] flex items-center gap-1">
                          <KaspaIcon className="w-5 h-5" />{podcastStats.earnings || '0.00'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">KAS</div>
                      </div>
                    </div>

                    {/* Top Episodes */}
                    {podcastStats.topEpisodes && podcastStats.topEpisodes.length > 0 && (
                      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-orange-400" />
                          Top Episodes
                        </h3>
                        <div className="space-y-3">
                          {podcastStats.topEpisodes.map((episode, index) => (
                            <div key={episode.id} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
                              <div className="w-8 h-8 flex items-center justify-center text-lg font-bold text-orange-400">
                                #{index + 1}
                              </div>
                              <div className="w-12 h-12 rounded-lg bg-slate-700/50 overflow-hidden flex-shrink-0">
                                {isValidCoverUrl(episode.coverArtUrl) ? (
                                  <img src={episode.coverArtUrl!} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Mic2 className="w-6 h-6 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white truncate">{episode.title}</div>
                                <div className="text-sm text-slate-400 truncate">{episode.podcastTitle}</div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="flex items-center gap-1 text-slate-300">
                                  <Play className="w-4 h-4" />
                                  {(episode.playCount || 0).toLocaleString()}
                                </div>
                                {episode.priceKas && parseFloat(episode.priceKas) > 0 && (
                                  <div className="text-xs text-[#70C7BA] flex items-center gap-1 justify-end mt-1">
                                    <KaspaIcon className="w-3 h-3" />{episode.priceKas}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Your Episodes */}
                    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Mic2 className="w-5 h-5 text-orange-400" />
                        Your Episodes
                      </h3>
                      {podcastEpisodes.length === 0 ? (
                        <div className="text-center py-8">
                          <Mic2 className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                          <p className="text-slate-400">No episodes uploaded yet</p>
                          <LocalizedLink to="/music/upload" className="text-sm text-orange-400 hover:text-orange-300 mt-2 inline-block">
                            Upload your first episode
                          </LocalizedLink>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                          {podcastEpisodes.map((episode) => (
                            <div key={episode.id} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                              <div className="w-12 h-12 rounded-lg bg-slate-700/50 overflow-hidden flex-shrink-0">
                                {isValidCoverUrl(episode.coverArtUrl) ? (
                                  <img src={episode.coverArtUrl!} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Mic2 className="w-6 h-6 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-white truncate">{episode.title}</div>
                                <div className="text-sm text-slate-400 truncate">{episode.podcastTitle}</div>
                              </div>
                              <div className="flex items-center gap-4 flex-shrink-0">
                                <div className="flex items-center gap-1 text-slate-400 text-sm">
                                  <Play className="w-4 h-4" />
                                  {(episode.playCount || 0).toLocaleString()}
                                </div>
                                {episode.priceKas && parseFloat(episode.priceKas) > 0 ? (
                                  <div className="text-xs bg-green-600/90 text-white px-2 py-1 rounded flex items-center gap-1">
                                    <KaspaIcon className="w-3 h-3" />{episode.priceKas}
                                  </div>
                                ) : (
                                  <div className="text-xs bg-blue-600/90 text-white px-2 py-1 rounded">Free</div>
                                )}
                                {episode.videoUrl && (
                                  <div className="text-xs bg-purple-600/90 text-white px-2 py-1 rounded">Video</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Earnings */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'earnings' && (
              <div className="space-y-8">
                {/* Tips Summary Card */}
                {(() => {
                  const tipsData = earningsBySource.find(s => s.type === 'tip');
                  const totalTips = tipsData?.total || 0;
                  const tipsCount = tipsData?.count || 0;
                  return (
                    <section className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-amber-500/30 rounded-xl">
                            <Gift className="w-8 h-8 text-amber-400" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-amber-300 mb-1">Tips Received</h3>
                            <div className="flex items-center gap-2">
                              <span className="text-3xl font-bold text-white flex items-center gap-2">
                                <KaspaIcon className="w-6 h-6" />
                                {totalTips.toFixed(2)}
                              </span>
                              <span className="text-sm text-slate-400">KAS</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-amber-400">{tipsCount}</div>
                          <div className="text-sm text-slate-400">total tips</div>
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {/* Earnings Chart */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-amber-500/20 rounded-lg">
                      <DollarSign className="w-5 h-5 text-amber-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">Earnings Over Time</h2>
                  </div>
                  
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="h-64">
                      {chartsMounted && chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="label" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value: number) => `${value.toFixed(2)}`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line type="monotone" dataKey="earnings" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', strokeWidth: 0, r: 3 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">No earnings data yet</div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Revenue by Video & Source */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Per-Video Revenue */}
                  <section className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-white">Revenue by Video</h2>
                      <span className="text-xs text-slate-400">Top performers</span>
                    </div>
                    
                    {videoEarnings.length > 0 ? (
                      <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                        {videoEarnings.map((video, index) => (
                          <LocalizedLink key={video.id} to={`/watch/${video.id}`} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors group">
                            <span className="text-slate-500 text-sm w-5 text-center font-medium">{index + 1}</span>
                            <div className="w-16 h-9 bg-slate-700 rounded overflow-hidden flex-shrink-0">
                              {video.thumbnailUrl ? (
                                <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><Play className="w-4 h-4 text-slate-500" /></div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate group-hover:text-[#70C7BA] transition-colors">{video.title}</p>
                              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatViews(video.viewCount)}</span>
                                <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatViews(video.likeCount)}</span>
                                {video.priceKas && parseFloat(video.priceKas) > 0 && (
                                  <span className="text-green-400">{parseFloat(video.priceKas).toFixed(2)} KAS</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="flex items-center gap-1 text-[#70C7BA] font-semibold">
                                <KaspaIcon className="w-4 h-4" />
                                {video.periodEarnings > 0 ? video.periodEarnings.toFixed(2) : parseFloat(video.totalEarned).toFixed(2)}
                              </div>
                              <div className="text-xs text-slate-500">{video.paymentCount} {video.paymentCount === 1 ? 'payment' : 'payments'}</div>
                            </div>
                          </LocalizedLink>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No earnings data yet</p>
                      </div>
                    )}
                  </section>

                  {/* Earnings by Source */}
                  <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Earnings by Source</h2>
                    
                    {earningsBySource.length > 0 ? (
                      <div className="space-y-4">
                        {earningsBySource.map((source) => {
                          const totalEarnings = earningsBySource.reduce((sum, s) => sum + s.total, 0);
                          const percentage = totalEarnings > 0 ? (source.total / totalEarnings) * 100 : 0;
                          
                          const sourceLabels: Record<string, string> = {
                            'view': 'Video Views', 'subscription': 'Subscriptions', 'tip': 'Tips',
                            'membership': 'Memberships', 'like': 'Likes', 'comment': 'Comments', 'other': 'Other',
                          };
                          
                          const sourceColors: Record<string, string> = {
                            'view': 'bg-[#70C7BA]', 'subscription': 'bg-blue-500', 'tip': 'bg-amber-500',
                            'membership': 'bg-purple-500', 'like': 'bg-pink-500', 'comment': 'bg-green-500', 'other': 'bg-slate-500',
                          };
                          
                          return (
                            <div key={source.type}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm text-slate-300">{sourceLabels[source.type] || source.type}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-white flex items-center gap-1">
                                    <KaspaIcon className="w-3 h-3" />{source.total.toFixed(2)}
                                  </span>
                                  <span className="text-xs text-slate-500">({source.count})</span>
                                </div>
                              </div>
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full ${sourceColors[source.type] || 'bg-slate-500'} transition-all`} style={{ width: `${percentage}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        
                        <div className="pt-3 mt-3 border-t border-slate-700">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-300">Total</span>
                            <span className="text-lg font-bold text-[#70C7BA] flex items-center gap-1">
                              <KaspaIcon className="w-4 h-4" />
                              {earningsBySource.reduce((sum, s) => sum + s.total, 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No source data yet</p>
                      </div>
                    )}
                  </section>
                </div>

                {/* Wallet & Withdrawals */}
                {withdrawOverview && (
                  <section>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <Wallet className="w-5 h-5 text-green-400" />
                      </div>
                      <h2 className="text-lg font-semibold text-white">Wallet & Withdrawals</h2>
                    </div>
                    
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                      <div className="flex items-center justify-end mb-6">
                        <LocalizedLink to="/settings" className="px-4 py-2 bg-[#70C7BA] text-slate-900 text-sm font-medium rounded-lg hover:bg-[#5DB8AA] transition-colors flex items-center gap-2">
                          <ArrowUp className="w-4 h-4" />Withdraw
                        </LocalizedLink>
                      </div>
                      
                      {/* Balance Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                          <div className="text-slate-400 text-sm mb-1">Available Balance</div>
                          <div className="text-2xl font-bold text-[#70C7BA] flex items-center gap-2">
                            <KaspaIcon className="w-5 h-5" />{formatKas(withdrawOverview.currentBalance)}
                          </div>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                          <div className="text-slate-400 text-sm mb-1">Pending</div>
                          <div className="text-2xl font-bold text-amber-400 flex items-center gap-2">
                            <KaspaIcon className="w-5 h-5" />{formatKas(withdrawOverview.pendingBalance)}
                          </div>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                          <div className="text-slate-400 text-sm mb-1">Total Withdrawn</div>
                          <div className="text-2xl font-bold text-white flex items-center gap-2">
                            <KaspaIcon className="w-5 h-5" />{formatKas(withdrawOverview.totalWithdrawn)}
                          </div>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                          <div className="text-slate-400 text-sm mb-1">Withdrawals</div>
                          <div className="text-2xl font-bold text-white">{withdrawOverview.withdrawalCount}</div>
                        </div>
                      </div>
                      
                      {/* Wallet Address */}
                      {withdrawOverview.walletAddress && (
                        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 mb-6">
                          <div className="text-slate-400 text-sm mb-2">Your Wallet Address</div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm text-slate-300 font-mono truncate">{withdrawOverview.walletAddress}</code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(withdrawOverview.walletAddress);
                                setCopiedAddress(true);
                                setTimeout(() => setCopiedAddress(false), 2000);
                              }}
                              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                              title="Copy address"
                            >
                              {copiedAddress ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Recent Withdrawals */}
                      <div>
                        <h3 className="text-sm font-medium text-slate-300 mb-3">Recent Withdrawals</h3>
                        {withdrawOverview.recentWithdrawals.length > 0 ? (
                          <div className="space-y-2">
                            {withdrawOverview.recentWithdrawals.map((withdrawal) => (
                              <div key={withdrawal.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-full ${withdrawal.status === 'completed' ? 'bg-green-500/20' : withdrawal.status === 'pending' ? 'bg-amber-500/20' : 'bg-red-500/20'}`}>
                                    {withdrawal.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-400" /> : withdrawal.status === 'pending' ? <Clock className="w-4 h-4 text-amber-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 text-white font-medium">
                                      <KaspaIcon className="w-4 h-4" />{formatKas(withdrawal.amount)}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                      {new Date(withdrawal.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-xs font-medium px-2 py-1 rounded ${withdrawal.status === 'completed' ? 'bg-green-500/20 text-green-400' : withdrawal.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                                  </div>
                                  {withdrawal.transactionId && (
                                    <a href={`https://explorer.kaspa.org/txs/${withdrawal.transactionId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#70C7BA] hover:underline mt-1 inline-block">
                                      View TX →
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-400">
                            <ArrowUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No withdrawals yet</p>
                            <p className="text-xs text-slate-500 mt-1">Withdraw your earnings from Settings</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB: Reviews */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'reviews' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Star className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Track Reviews</h2>
                    <p className="text-sm text-slate-400">Reviews left by listeners on your tracks</p>
                  </div>
                </div>

                {reviewsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                  </div>
                ) : musicReviews.length === 0 ? (
                  <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <Star className="w-12 h-12 mx-auto mb-3 text-yellow-500/50" />
                    <p className="text-slate-400 mb-2">No reviews yet</p>
                    <p className="text-sm text-slate-500">When listeners review your tracks, they'll appear here</p>
                  </div>
                ) : (
                  <>
                    {/* Reviews Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Star className="w-4 h-4" />
                          Total Reviews
                        </div>
                        <div className="text-2xl font-bold text-white">{musicReviews.length}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          Average Rating
                        </div>
                        <div className="text-2xl font-bold text-yellow-400">
                          {(musicReviews.reduce((sum, r) => sum + r.rating, 0) / musicReviews.length).toFixed(1)}
                        </div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Music className="w-4 h-4" />
                          Tracks Reviewed
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {new Set(musicReviews.map(r => r.trackId)).size}
                        </div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                          <Coins className="w-4 h-4" />
                          Rewards Paid
                        </div>
                        <div className="text-2xl font-bold text-[#70C7BA] flex items-center gap-1">
                          <KaspaIcon className="w-5 h-5" />
                          {musicReviews.reduce((sum, r) => sum + parseFloat(r.rewardKas || '0'), 0).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Reviews List */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                      <h3 className="text-white font-semibold mb-4">Recent Reviews</h3>
                      <div className="space-y-4 max-h-[600px] overflow-y-auto">
                        {musicReviews.map((review) => (
                          <div key={review.id} className="flex gap-4 p-4 bg-slate-700/30 rounded-lg">
                            {/* Track Cover */}
                            <div className="w-16 h-16 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
                              {isValidCoverUrl(review.trackCoverUrl) ? (
                                <img src={review.trackCoverUrl!} alt={review.trackTitle} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Music className="w-8 h-8 text-slate-500" />
                                </div>
                              )}
                            </div>
                            
                            {/* Review Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div>
                                  <h4 className="text-white font-medium truncate">{review.trackTitle}</h4>
                                  <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <span>by {review.reviewerName || 'Anonymous'}</span>
                                    <span>•</span>
                                    <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                                  </div>
                                </div>
                                
                                {/* Star Rating */}
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`w-4 h-4 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              {review.comment && (
                                <p className="text-slate-300 text-sm">{review.comment}</p>
                              )}
                              
                              {review.rewardKas && parseFloat(review.rewardKas) > 0 && (
                                <div className="mt-2 text-xs text-[#70C7BA] flex items-center gap-1">
                                  <KaspaIcon className="w-3 h-3" />
                                  {parseFloat(review.rewardKas).toFixed(2)} KAS reward paid
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <Video className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No analytics yet</h2>
            <p className="text-slate-400 mb-6">Upload your first video to start tracking performance</p>
            <LocalizedLink to="/upload" className="inline-flex px-6 py-3 bg-[#70C7BA] text-slate-900 font-medium rounded-lg hover:bg-[#5DB8AA] transition-colors">
              Upload Video
            </LocalizedLink>
          </div>
        )}
      </main>
    </div>
  );
}
