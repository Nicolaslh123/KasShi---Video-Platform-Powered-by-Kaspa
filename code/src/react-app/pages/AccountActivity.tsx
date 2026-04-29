import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { useElectronTitleBar } from "../components/ElectronTitleBar";
import LocalizedLink from "../components/LocalizedLink";
import { useLocalizedNavigate } from "../components/LanguageRouter";
import { useWallet } from "../contexts/WalletContext";
import { 
  Heart, 
  MessageSquare,
  Loader2,
  UserPlus,
  Clock,
  Play,
  ChevronLeft
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SubscriberActivity {
  id: number;
  channelId: number;
  channelName: string;
  channelHandle: string;
  channelAvatar: string | null;
  subscribedAt: string;
}

interface LikeActivity {
  id: number;
  videoId: number;
  videoTitle: string;
  videoThumbnail: string | null;
  likerChannelId: number;
  likerChannelName: string;
  likerChannelHandle: string;
  likerChannelAvatar: string | null;
  likedAt: string;
}

interface CommentActivity {
  id: number;
  commentId: number;
  content: string;
  videoId: number;
  videoTitle: string;
  videoThumbnail: string | null;
  commenterChannelId: number;
  commenterChannelName: string;
  commenterChannelHandle: string;
  commenterChannelAvatar: string | null;
  commentedAt: string;
}

type Tab = 'subscribers' | 'likes' | 'comments';

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AccountActivity() {
  const { titleBarPadding } = useElectronTitleBar();
  const navigate = useLocalizedNavigate();
  const { wallet, externalWallet, isConnected } = useWallet();
  
  const [activeTab, setActiveTab] = useState<Tab>('subscribers');
  const [loading, setLoading] = useState(true);
  const [subscribers, setSubscribers] = useState<SubscriberActivity[]>([]);
  const [likes, setLikes] = useState<LikeActivity[]>([]);
  const [comments, setComments] = useState<CommentActivity[]>([]);

  // Check auth
  useEffect(() => {
    if (!isConnected && !externalWallet) {
      navigate('/');
    }
  }, [isConnected, externalWallet, navigate]);

  // Fetch activity data
  useEffect(() => {
    const fetchActivity = async () => {
      if (!wallet?.address && !externalWallet?.address) return;
      
      setLoading(true);
      try {
        const authToken = externalWallet?.authToken;
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`/api/kasshi/activity/${activeTab}`, {
          headers,
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (activeTab === 'subscribers') {
            setSubscribers(data.subscribers || []);
          } else if (activeTab === 'likes') {
            setLikes(data.likes || []);
          } else {
            setComments(data.comments || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [activeTab, wallet?.address, externalWallet?.address, externalWallet?.authToken]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const tabs = [
    { id: 'subscribers' as Tab, label: 'Subscribers', icon: UserPlus, count: subscribers.length },
    { id: 'likes' as Tab, label: 'Likes', icon: Heart, count: likes.length },
    { id: 'comments' as Tab, label: 'Comments', icon: MessageSquare, count: comments.length },
  ];

  return (
    <div className={`min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 ${titleBarPadding}`}>
      <Navbar />
      
      <main className="max-w-5xl mx-auto px-4 pt-20 pb-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Account Activity</h1>
            <p className="text-zinc-400 text-sm mt-1">See who's engaging with your content</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {!loading && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-white/20' : 'bg-zinc-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Subscribers Tab */}
            {activeTab === 'subscribers' && (
              <>
                {subscribers.length === 0 ? (
                  <EmptyState 
                    icon={UserPlus} 
                    title="No subscribers yet"
                    subtitle="When people subscribe to your channel, they'll appear here"
                  />
                ) : (
                  subscribers.map((sub) => (
                    <ActivityCard key={sub.id}>
                      <LocalizedLink 
                        to={`/video/channel/${sub.channelId}`}
                        className="flex items-center gap-4 flex-1"
                      >
                        <img
                          src={sub.channelAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${sub.channelName}`}
                          alt={sub.channelName}
                          className="w-12 h-12 rounded-full object-cover bg-zinc-700"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{sub.channelName}</p>
                          <p className="text-sm text-zinc-500">@{sub.channelHandle}</p>
                        </div>
                      </LocalizedLink>
                      <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        <UserPlus className="w-4 h-4 text-green-500" />
                        <span>Subscribed</span>
                        <span className="text-zinc-600">•</span>
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTimeAgo(sub.subscribedAt)}</span>
                      </div>
                    </ActivityCard>
                  ))
                )}
              </>
            )}

            {/* Likes Tab */}
            {activeTab === 'likes' && (
              <>
                {likes.length === 0 ? (
                  <EmptyState 
                    icon={Heart} 
                    title="No likes yet"
                    subtitle="When people like your videos, they'll appear here"
                  />
                ) : (
                  likes.map((like) => (
                    <ActivityCard key={like.id}>
                      <LocalizedLink 
                        to={`/video/channel/${like.likerChannelId}`}
                        className="flex items-center gap-3"
                      >
                        <img
                          src={like.likerChannelAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${like.likerChannelName}`}
                          alt={like.likerChannelName}
                          className="w-10 h-10 rounded-full object-cover bg-zinc-700"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{like.likerChannelName}</p>
                          <p className="text-xs text-zinc-500">@{like.likerChannelHandle}</p>
                        </div>
                      </LocalizedLink>
                      <div className="flex items-center gap-2 text-zinc-500 text-sm mx-3">
                        <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                        <span>liked your video</span>
                      </div>
                      <LocalizedLink 
                        to={`/video/watch/${like.videoId}`}
                        className="flex items-center gap-3 ml-auto"
                      >
                        <div className="text-right min-w-0 hidden sm:block">
                          <p className="text-sm text-zinc-300 truncate max-w-[200px]">{like.videoTitle}</p>
                          <p className="text-xs text-zinc-500">{formatTimeAgo(like.likedAt)}</p>
                        </div>
                        {like.videoThumbnail && (
                          <img
                            src={like.videoThumbnail}
                            alt={like.videoTitle}
                            className="w-16 h-10 rounded object-cover bg-zinc-700"
                          />
                        )}
                      </LocalizedLink>
                    </ActivityCard>
                  ))
                )}
              </>
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <>
                {comments.length === 0 ? (
                  <EmptyState 
                    icon={MessageSquare} 
                    title="No comments yet"
                    subtitle="When people comment on your videos, they'll appear here"
                  />
                ) : (
                  comments.map((comment) => (
                    <ActivityCard key={comment.id} className="flex-col items-stretch gap-3">
                      <div className="flex items-center justify-between">
                        <LocalizedLink 
                          to={`/video/channel/${comment.commenterChannelId}`}
                          className="flex items-center gap-3"
                        >
                          <img
                            src={comment.commenterChannelAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.commenterChannelName}`}
                            alt={comment.commenterChannelName}
                            className="w-10 h-10 rounded-full object-cover bg-zinc-700"
                          />
                          <div>
                            <p className="font-medium text-white">{comment.commenterChannelName}</p>
                            <p className="text-xs text-zinc-500">@{comment.commenterChannelHandle}</p>
                          </div>
                        </LocalizedLink>
                        <div className="flex items-center gap-2 text-zinc-500 text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatTimeAgo(comment.commentedAt)}</span>
                        </div>
                      </div>
                      <div className="pl-13 ml-[52px]">
                        <p className="text-zinc-300 text-sm line-clamp-2">{comment.content}</p>
                        <LocalizedLink 
                          to={`/video/watch/${comment.videoId}`}
                          className="flex items-center gap-2 mt-2 text-xs text-zinc-500 hover:text-zinc-400"
                        >
                          <Play className="w-3 h-3" />
                          <span className="truncate">on: {comment.videoTitle}</span>
                        </LocalizedLink>
                      </div>
                    </ActivityCard>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ActivityCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center bg-zinc-800/30 hover:bg-zinc-800/50 rounded-xl p-4 transition-colors ${className}`}>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-zinc-600" />
      </div>
      <h3 className="text-lg font-medium text-zinc-400">{title}</h3>
      <p className="text-sm text-zinc-600 mt-1">{subtitle}</p>
    </div>
  );
}
