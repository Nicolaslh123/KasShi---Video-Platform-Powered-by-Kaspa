import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { 
  useVideo, 
  useVideoFeed, 
  useVideoComments,
  formatViews, 
  formatTimeAgo,
  formatDuration,
  DEFAULT_AVATAR,
  DEFAULT_THUMBNAIL,
  Comment
} from "../hooks/useKasShi";
import { useWallet } from "../contexts/WalletContext";
import { usePayment } from "../hooks/usePayment";
import { useAuth } from "@getmocha/users-service/react";
import { WalletModal } from "../components/WalletModal";
import { 
  ThumbsUp, 
  ThumbsDown, 
  Share2, 
  MoreHorizontal, 
  Send,
  CheckCircle,
  Loader2,
  Play,
  Pause,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Gift,
  X,
  Sparkles,
  Crown,
  Copy,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Facebook,
  Flag,
  Trash2,
  Edit3,
  Settings,
  RefreshCw
} from "lucide-react";
import toast from "react-hot-toast";
import { SecurityVerificationModal } from "../components/SecurityVerificationModal";
import { useKasware } from "../hooks/useKasware";
import { ExternalLink } from "lucide-react";
import { KaspaIcon } from "../components/KasShiLogo";

// Fee constants - small utility actions are batched via Merkle tree
// Duration-based view pricing (all tiers above 0.11 KAS to avoid KIP-9 storage mass limit)
function getViewCostForDuration(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  if (minutes >= 30) return 0.25; // 30+ min
  if (minutes >= 20) return 0.20; // 20-29 min
  if (minutes >= 10) return 0.15; // 10-19 min
  return 0.11; // Under 10 min
}
const PAYMENT_VALIDITY_HOURS = 1;


// Helper to get localStorage key for user-specific paid videos
function getPaidVideosKey(userId: string | undefined): string {
  return userId ? `kasshi_paid_videos_${userId}` : "kasshi_paid_videos_anonymous";
}

// Helper to get paid videos from localStorage with timestamps (user-specific)
function getPaidVideos(userId: string | undefined): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(getPaidVideosKey(userId)) || "{}");
  } catch {
    return {};
  }
}

// Helper to check if payment is still valid (within validity period, user-specific)
function isPaymentValid(videoId: string, userId: string | undefined): boolean {
  const paidVideos = getPaidVideos(userId);
  const paidAt = paidVideos[videoId];
  if (!paidAt) return false;
  
  const hoursElapsed = (Date.now() - paidAt) / (1000 * 60 * 60);
  return hoursElapsed < PAYMENT_VALIDITY_HOURS;
}

// Helper to get remaining time on payment (user-specific)
function getRemainingTime(videoId: string, userId: string | undefined): string | null {
  const paidVideos = getPaidVideos(userId);
  const paidAt = paidVideos[videoId];
  if (!paidAt) return null;
  
  const expiresAt = paidAt + (PAYMENT_VALIDITY_HOURS * 60 * 60 * 1000);
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return null;
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Helper to save payment timestamp (user-specific)
function savePaidVideo(videoId: string, userId: string | undefined) {
  const paidVideos = getPaidVideos(userId);
  paidVideos[videoId] = Date.now();
  localStorage.setItem(getPaidVideosKey(userId), JSON.stringify(paidVideos));
}

// Recursive comment component for infinite threading
interface CommentItemProps {
  comment: Comment;
  depth: number;
  replyingTo: { id: number; authorName: string; authorWallet?: string } | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<{ id: number; authorName: string; authorWallet?: string } | null>>;
  replyText: string;
  setReplyText: React.Dispatch<React.SetStateAction<string>>;
  isCommenting: boolean;
  handleComment: (e: React.FormEvent, parentComment?: { id: number; authorWallet?: string; authorName: string }) => void;
  handleCommentLike: (commentId: string, commenterWallet: string | undefined, commenterName: string) => void;
  handleCommentDislike: (commentId: string) => void;
  handleDeleteComment: (commentId: string) => void;
  likingCommentId: string | null;
  dislikingCommentId: string | null;
  deletingCommentId: string | null;
  expandedReplies: Set<number>;
  setExpandedReplies: React.Dispatch<React.SetStateAction<Set<number>>>;
  commentInteractions: Record<string, 'like' | 'dislike'>;
  localCommentCounts: Record<string, { likes: number; dislikes: number }>;
  currentUserChannelId: number | null;
}

function CommentItem({
  comment,
  depth,
  replyingTo,
  setReplyingTo,
  replyText,
  setReplyText,
  isCommenting,
  handleComment,
  handleCommentLike,
  handleCommentDislike,
  handleDeleteComment,
  likingCommentId,
  dislikingCommentId,
  deletingCommentId,
  expandedReplies,
  setExpandedReplies,
  commentInteractions,
  localCommentCounts,
  currentUserChannelId,
}: CommentItemProps) {
  const c = comment;
  const maxIndent = 4; // Max visual indent level
  const visualDepth = Math.min(depth, maxIndent);
  
  const isLiked = commentInteractions[String(c.id)] === 'like';
  const isDisliked = commentInteractions[String(c.id)] === 'dislike';
  const localCounts = localCommentCounts[String(c.id)];
  const likeCount = localCounts?.likes ?? c.likeCount;
  const dislikeCount = localCounts?.dislikes ?? (c.dislikeCount || 0);
  
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <img 
          src={c.author.avatarUrl || DEFAULT_AVATAR}
          alt={c.author.name}
          className={`rounded-full object-cover flex-shrink-0 ${depth === 0 ? "w-10 h-10" : "w-8 h-8"}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-white ${depth === 0 ? "text-sm" : "text-xs"}`}>{c.author.name}</span>
            <span className="text-slate-500 text-xs">{formatTimeAgo(c.createdAt)}</span>
            {depth > maxIndent && (
              <span className="text-slate-500 text-xs">· {depth - maxIndent} levels deep</span>
            )}
          </div>
          <p className="text-slate-300 text-sm mt-1 break-words">{c.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <button 
              onClick={() => handleCommentLike(String(c.id), c.author.walletAddress, c.author.name)}
              disabled={likingCommentId === String(c.id)}
              className={`flex items-center gap-1 transition-colors text-xs ${likingCommentId === String(c.id) ? "opacity-50 cursor-wait" : ""} ${isLiked ? "text-teal-400" : "text-slate-400 hover:text-teal-400"}`}
              title={isLiked ? "Click to unlike" : "Like"}
            >
              {likingCommentId === String(c.id) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ThumbsUp className={`w-3 h-3 ${isLiked ? "fill-current" : ""}`} />
              )}
              <span>{likeCount}</span>
            </button>
            <button 
              onClick={() => handleCommentDislike(String(c.id))}
              disabled={dislikingCommentId === String(c.id)}
              className={`flex items-center gap-1 transition-colors text-xs ${dislikingCommentId === String(c.id) ? "opacity-50 cursor-wait" : ""} ${isDisliked ? "text-orange-400" : "text-slate-400 hover:text-orange-400"}`}
              title={isDisliked ? "Click to undislike" : "Dislike"}
            >
              {dislikingCommentId === String(c.id) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ThumbsDown className={`w-3 h-3 ${isDisliked ? "fill-current" : ""}`} />
              )}
              <span>{dislikeCount}</span>
            </button>
            <button 
              onClick={() => setReplyingTo({ id: c.id, authorName: c.author.name, authorWallet: c.author.walletAddress })}
              className="flex items-center gap-1 text-slate-400 hover:text-teal-400 transition-colors text-xs"
            >
              <MessageSquare className="w-3 h-3" />
              Reply
            </button>
            {currentUserChannelId === c.author.id && (
              <button 
                onClick={() => handleDeleteComment(String(c.id))}
                disabled={deletingCommentId === String(c.id)}
                className={`flex items-center gap-1 text-slate-400 hover:text-red-400 transition-colors text-xs ${deletingCommentId === String(c.id) ? "opacity-50 cursor-wait" : ""}`}
                title="Delete comment"
              >
                {deletingCommentId === String(c.id) ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Delete
              </button>
            )}
          </div>
          
          {/* Reply input */}
          {replyingTo?.id === c.id && (
            <form 
              onSubmit={(e) => handleComment(e, { id: c.id, authorWallet: c.author.walletAddress, authorName: c.author.name })} 
              className="mt-3 flex gap-3"
            >
              <CornerDownRight className="w-4 h-4 text-slate-500 flex-shrink-0 mt-2" />
              <div className="flex-1">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to @${c.author.name}...`}
                  className="w-full bg-slate-800/50 border border-slate-700 focus:border-teal-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none transition-colors"
                  autoFocus
                  disabled={isCommenting}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button 
                    type="button"
                    onClick={() => { setReplyingTo(null); setReplyText(""); }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isCommenting || !replyText.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCommenting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    Reply
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
      
      {/* Nested replies - recursive */}
      {c.replies && c.replies.length > 0 && (
        <div className={visualDepth > 0 ? "ml-8" : "ml-14"}>
          <button
            onClick={() => {
              setExpandedReplies(prev => {
                const next = new Set(prev);
                if (next.has(c.id)) {
                  next.delete(c.id);
                } else {
                  next.add(c.id);
                }
                return next;
              });
            }}
            className="flex items-center gap-1 text-teal-400 text-xs font-medium hover:text-teal-300 transition-colors mb-2"
          >
            {expandedReplies.has(c.id) ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {c.replies.length} {c.replies.length === 1 ? "reply" : "replies"}
          </button>
          
          {expandedReplies.has(c.id) && (
            <div className="space-y-4 border-l-2 border-slate-700/50 pl-4">
              {c.replies.map((reply) => (
                <CommentItem 
                  key={reply.id}
                  comment={reply}
                  depth={depth + 1}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  isCommenting={isCommenting}
                  handleComment={handleComment}
                  handleCommentLike={handleCommentLike}
                  handleCommentDislike={handleCommentDislike}
                  handleDeleteComment={handleDeleteComment}
                  likingCommentId={likingCommentId}
                  dislikingCommentId={dislikingCommentId}
                  deletingCommentId={deletingCommentId}
                  expandedReplies={expandedReplies}
                  setExpandedReplies={setExpandedReplies}
                  commentInteractions={commentInteractions}
                  localCommentCounts={localCommentCounts}
                  currentUserChannelId={currentUserChannelId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Watch() {
  const { videoId } = useParams();
  const { video, loading: videoLoading, refetch: refetchVideo } = useVideo(videoId);
  const { videos: relatedVideos } = useVideoFeed(8);
  const { comments, loading: commentsLoading, refetch: refetchComments } = useVideoComments(videoId);
  const { isConnected, wallet, balance: balanceStr, micropay, channel, connectExternalWallet, externalWallet, isLoading: walletLoading } = useWallet();
  const { pay, isExternalWallet } = usePayment();
  const { user, redirectToLogin } = useAuth();
  const kasware = useKasware();
  const balance = balanceStr !== null ? parseFloat(balanceStr) : null;
  
  // Unified payment function that handles both internal and external wallets
  const unifiedPay = useCallback(async (
    toAddress: string,
    amount: number,
    videoIdParam?: string,
    paymentType?: string,
    recipientChannelId?: number,
    commentId?: number
  ) => {
    if (isExternalWallet) {
      // Use KasWare for external wallet payments
      return pay(toAddress, amount, {
        videoId: videoIdParam,
        paymentType,
        recipientChannelId,
        commentId,
      });
    } else {
      // Use internal micropay
      return micropay(toAddress, amount, videoIdParam, paymentType, recipientChannelId, commentId);
    }
  }, [isExternalWallet, pay, micropay]);
  
  // Fee constants - external wallets need 0.1 KAS minimum (KIP-9), internal wallets batch small amounts
  // Micropayment fees - batched for all wallet types until settlement threshold
  const LIKE_COST_KAS = 0.02;
  const COMMENT_COST_KAS = 0.02;
  const DISLIKE_COST_KAS = 0.02;
  const COMMENT_LIKE_COST_KAS = 0.01;
  const COMMENT_DISLIKE_COST_KAS = 0.02;
  const SHARE_COST_KAS = 0.02;
  const REPORT_COST_KAS = 0.0001;
  const UNLIKE_COST_KAS = 0.0001;
  const UNDISLIKE_COST_KAS = 0.0001;
  const DELETE_COMMENT_COST_KAS = 0.0001;
  
  // KasWare authentication state
  const [isKaswareAuthenticating, setIsKaswareAuthenticating] = useState(false);
  
  // Platform wallet for fees (fetched dynamically)
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  
  useEffect(() => {
    fetch("/api/platform-wallet")
      .then(res => res.json())
      .then(data => setPlatformWallet(data.walletAddress))
      .catch(err => console.error("Failed to fetch platform wallet:", err));
  }, []);
  
  const [comment, setComment] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isDisliking, setIsDisliking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);
  const [dislikingCommentId, setDislikingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [commentInteractions, setCommentInteractions] = useState<Record<string, 'like' | 'dislike'>>({});
  const [localCommentCounts, setLocalCommentCounts] = useState<Record<string, { likes: number; dislikes: number }>>({});
  const [replyingTo, setReplyingTo] = useState<{ id: number; authorName: string; authorWallet?: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
  const [showPaymentToast, _setShowPaymentToast] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [isTipping, setIsTipping] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [pendingTip, setPendingTip] = useState<{ amount: number; address: string } | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  // Click outside handler for dropdown menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setShowShareMenu(false);
        setShowMoreMenu(false);
      }
    };
    
    if (showShareMenu || showMoreMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showShareMenu, showMoreMenu]);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(0);
  const [localDislikeCount, setLocalDislikeCount] = useState(0);
  const [localViewCount, setLocalViewCount] = useState(0);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  
  // Pay-per-view state
  const [paymentState, setPaymentState] = useState<"locked" | "paying" | "unlocked">("locked");
  const [isPlaying, setIsPlaying] = useState(false);
  const [_remainingTime, setRemainingTime] = useState<string | null>(null);
  
  // Reset state when navigating to a different video
  useEffect(() => {
    paymentInProgressRef.current = false;
    setPaymentState("locked");
    setIsPlaying(false);
    setRemainingTime(null);
    setIsLiked(false);
    setIsDisliked(false);
    setHasMemberAccess(null);
    setLocalLikeCount(0);
    setLocalDislikeCount(0);
    setLocalViewCount(0);
    setCommentInteractions({});
    setLocalCommentCounts({});
    setCurrentProgress(0);
    setSavedProgress(null);
    setVideoError(null);
    setIsBuffering(false);
    setVideoAspectRatio("16/9");
  }, [videoId]);
  
  // Membership state for members-only videos
  const [hasMemberAccess, setHasMemberAccess] = useState<boolean | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  
  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  
  // Watch progress state
  const [currentProgress, setCurrentProgress] = useState(0);
  const [savedProgress, setSavedProgress] = useState<number | null>(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const lastSavedProgressRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const paymentInProgressRef = useRef(false);
  
  // Playback controls
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem("kasshi_volume");
    return savedVolume ? parseFloat(savedVolume) : 1;
  });
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem("kasshi_muted") === "true";
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Quality controls
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState<string>("Auto");
  const [nativeResolution, setNativeResolution] = useState<{ width: number; height: number } | null>(null);
  
  // Progress bar dragging
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  

  
  // Video error state - for antivirus/blocking issues
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("16/9");
  // Video buffering state - for large video loading indicator
  const [isBuffering, setIsBuffering] = useState(false);


  // Buffering timeout - auto-clear after 15 seconds to prevent stuck state
  useEffect(() => {
    if (!isBuffering || !isPlaying) return;
    
    const timeout = setTimeout(() => {
      console.log("Buffering timeout - clearing stuck buffering state");
      setIsBuffering(false);
    }, 15000);
    
    return () => clearTimeout(timeout);
  }, [isBuffering, isPlaying]);

  // Update local counts when video loads
  useEffect(() => {
    if (video) {
      setLocalLikeCount(video.likeCount);
      setLocalDislikeCount(video.dislikeCount);
      setLocalViewCount(video.viewCount);
    }
  }, [video]);
  
  // Check subscription status
  useEffect(() => {
    const checkSubscription = async () => {
      if (!video?.channel?.handle || !channel?.id) return;
      
      try {
        const response = await fetch(`/api/kasshi/channels/${video.channel.handle}/subscription?subscriberChannelId=${channel.id}`);
        if (response.ok) {
          const data = await response.json();
          setIsSubscribed(data.subscribed);
        }
      } catch (error) {
        console.error("Failed to check subscription:", error);
      }
    };
    
    checkSubscription();
  }, [video?.channel?.handle, channel?.id]);
  
  // Check existing like/dislike status
  useEffect(() => {
    const checkInteraction = async () => {
      if (!videoId) return;
      
      // Build query params - use channel ID if available, otherwise use external wallet user ID
      const params = new URLSearchParams();
      if (channel?.id) {
        params.set("channelId", String(channel.id));
      } else if (externalWallet?.userId) {
        params.set("userId", externalWallet.userId);
      } else {
        return; // No way to identify user
      }
      
      try {
        const headers: HeadersInit = {};
        if (externalWallet?.authToken) {
          headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const response = await fetch(`/api/kasshi/videos/${videoId}/interaction?${params.toString()}`, {
          headers,
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.interaction === 'like') {
            setIsLiked(true);
            setIsDisliked(false);
          } else if (data.interaction === 'dislike') {
            setIsLiked(false);
            setIsDisliked(true);
          }
        }
      } catch (error) {
        console.error("Failed to check interaction:", error);
      }
    };
    
    checkInteraction();
  }, [videoId, channel?.id, externalWallet?.userId]);
  
  // Fetch comment interactions for this video
  useEffect(() => {
    const fetchCommentInteractions = async () => {
      if (!videoId) return;
      
      // Build query params - use channel ID if available, otherwise use external wallet user ID
      const params = new URLSearchParams();
      if (channel?.id) {
        params.set("channelId", String(channel.id));
      } else if (externalWallet?.userId) {
        params.set("userId", externalWallet.userId);
      } else {
        return; // No way to identify user
      }
      
      try {
        const headers: HeadersInit = {};
        if (externalWallet?.authToken) {
          headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const response = await fetch(`/api/kasshi/videos/${videoId}/comment-interactions?${params.toString()}`, {
          headers,
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setCommentInteractions(data.interactions || {});
        }
      } catch (error) {
        console.error("Failed to fetch comment interactions:", error);
      }
    };
    
    fetchCommentInteractions();
  }, [videoId, channel?.id, externalWallet?.userId]);
  
  // Debug: Log when key states change
  useEffect(() => {
    console.log("[Watch] Key state change detected:", {
      videoId,
      hasVideo: !!video,
      videoTitle: video?.title,
      isConnected,
      hasWallet: !!wallet,
      hasExternalWallet: !!externalWallet,
      paymentState,
      videoCanRender: !!(video?.videoUrl && paymentState === "unlocked"),
    });
  }, [video, isConnected, wallet, externalWallet, videoId, paymentState]);
  
  // Debug: Log whenever paymentState specifically changes
  useEffect(() => {
    console.log(`[Watch] PAYMENT STATE CHANGED TO: ${paymentState}`);
  }, [paymentState]);
  
  // Track previous video state to detect when video loads
  const prevVideoRef = useRef<typeof video>(null);
  
  // Auto-pay when video loads (seamless background payment)
  useEffect(() => {
    const autoPayForVideo = async () => {
      // Log when video transitions from null to available
      if (!prevVideoRef.current && video) {
        console.log("[Watch] VIDEO DATA NOW AVAILABLE - triggering payment flow");
      }
      prevVideoRef.current = video;
      
      console.log("[Watch] autoPayForVideo triggered", {
        videoId,
        hasVideo: !!video,
        videoTitle: video?.title,
        isConnected,
        hasWallet: !!wallet,
        hasExternalWallet: !!externalWallet,
        externalWalletProvider: externalWallet?.provider,
        externalWalletAddress: externalWallet?.address,
        externalWalletInternalAddress: externalWallet?.internalAddress,
        balance,
        channelId: channel?.id,
        videoChannelId: video?.channel?.id,
        userId: user?.id,
        paymentInProgress: paymentInProgressRef.current,
        currentPaymentState: paymentState,
      });
      
      if (!videoId || !video) {
        console.log("[Watch] Early return: missing videoId or video", { videoId, video });
        return;
      }
      
      // CRITICAL: Wait for wallet state to be fully restored from localStorage
      // This prevents race condition where payment check runs before externalWallet is loaded
      if (walletLoading) {
        console.log("[Watch] Early return: wallet still loading");
        return;
      }
      
      // Additional check: if localStorage has external wallet but state doesn't, wait for sync
      const storedExternalWallet = localStorage.getItem("kasshi_external_wallet");
      if (storedExternalWallet && !externalWallet) {
        console.log("[Watch] Early return: external wallet in localStorage but not yet in state");
        return;
      }
      
      // Video owner watches for free (but still record view for history)
      if (channel && video.channel?.id === channel.id) {
        console.log("[Watch] UNLOCKING: User is channel owner", { channelId: channel.id, videoChannelId: video.channel?.id });
        setPaymentState("unlocked");
        setRemainingTime(null);
        // Record view without payment for history/stats
        try {
          await fetch(`/api/kasshi/videos/${videoId}/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              viewerChannelId: channel.id,
              transactionId: null,
              amount: 0,
              userId: externalWallet?.userId || user?.id,
            }),
          });
        } catch (e) {
          // Silently fail - owner watching their own video
        }
        return;
      }
      
      // Already paid within validity period (user-specific)
      // For external wallets, use external userId to avoid matching internal wallet payments
      const paymentUserId = externalWallet?.userId || user?.id;
      console.log("[Watch] Checking payment validity", { 
        videoId, 
        paymentUserId, 
        externalWalletUserId: externalWallet?.userId,
        authUserId: user?.id,
        hasExternalWallet: !!externalWallet,
      });
      if (isPaymentValid(videoId, paymentUserId)) {
        console.log("[Watch] UNLOCKING: Payment already valid in localStorage", { videoId, paymentUserId });
        setPaymentState("unlocked");
        setRemainingTime(getRemainingTime(videoId, paymentUserId));
        return;
      }
      console.log("[Watch] Payment NOT valid, proceeding to payment flow");
      
      // CRITICAL: Prevent multiple payment attempts
      // This ref guards against race conditions when balance updates trigger re-renders
      if (paymentInProgressRef.current) {
        console.log("[Watch] Early return: payment already in progress");
        return;
      }
      
      // Not connected - require login to watch
      // Support both internal wallets and external wallets (KasWare/Kastle)
      const hasWalletConnection = isConnected && (wallet || externalWallet);
      console.log("[Watch] Wallet connection check:", {
        isConnected,
        hasWallet: !!wallet,
        hasExternalWallet: !!externalWallet,
        hasWalletConnection,
      });
      
      if (!hasWalletConnection) {
        console.log("[Watch] No wallet connection - setting locked state");
        setPaymentState("locked");
        return;
      }
      
      // Insufficient balance - keep locked and show message
      const viewCost = getViewCostForDuration(video.durationSeconds || 0);
      console.log("[Watch] Balance check:", { balance, viewCost, isBalanceNull: balance === null });
      if (balance !== null && balance < viewCost) {
        setPaymentState("locked");
        toast.error(`Insufficient balance. You need ${viewCost} KAS to watch this video.`, { duration: 5000 });
        return;
      }
      
      // Get creator's wallet address
      const creatorAddress = video.channel?.walletAddress;
      if (!creatorAddress) {
        // No creator wallet - can't process payment, keep locked
        setPaymentState("locked");
        toast.error("This video cannot accept payments. Please try again later.");
        return;
      }
      
      // Mark payment as in progress BEFORE setting state
      paymentInProgressRef.current = true;
      
      // Process payment
      console.log("[Watch] Processing payment:", { creatorAddress, viewCost, videoId, channelId: video.channel.id });
      setPaymentState("paying");
      
      try {
        const txResult = await unifiedPay(creatorAddress, viewCost, videoId, "view", video.channel.id);
        console.log("[Watch] Payment result:", txResult);
        
        if (txResult.success) {
          // Record the view
          await fetch(`/api/kasshi/videos/${videoId}/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              viewerChannelId: channel?.id || null,
              transactionId: txResult.transactionId,
              amount: viewCost,
              userId: externalWallet?.userId || user?.id,
            }),
          });
          
          // Use same paymentUserId for saving as we use for checking
          const saveUserId = externalWallet?.userId || user?.id;
          savePaidVideo(videoId, saveUserId);
          setRemainingTime(getRemainingTime(videoId, saveUserId));
          setLocalViewCount(prev => prev + 1);
          setPaymentState("unlocked");
        } else if (txResult.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          paymentInProgressRef.current = false; // Allow retry
          setPaymentState("locked");
        } else {
          toast.error("Payment failed. Please try again.");
          paymentInProgressRef.current = false; // Allow retry
          setPaymentState("locked");
        }
      } catch (error) {
        console.error("Payment failed:", error);
        toast.error("Payment failed. Please try again.");
        paymentInProgressRef.current = false; // Allow retry
        setPaymentState("locked");
      }
    };
    
    autoPayForVideo();
  }, [videoId, video, isConnected, wallet, externalWallet, balance, micropay, channel?.id, user?.id, channel, video?.channel?.id, walletLoading]);
  
  // Check membership access for members-only videos
  useEffect(() => {
    const checkMembershipAccess = async () => {
      if (!video || !videoId) return;
      
      // If not a members-only video, grant access
      if (!video.isMembersOnly) {
        setHasMemberAccess(true);
        return;
      }
      
      // If user owns this channel, they have access
      if (channel && video.channel?.id === channel.id) {
        setHasMemberAccess(true);
        return;
      }
      
      // Check membership status via API
      if (!channel) {
        setHasMemberAccess(false);
        return;
      }
      
      setMembershipLoading(true);
      try {
        const response = await fetch(`/api/kasshi/videos/${videoId}/access?channelId=${channel.id}`);
        const data = await response.json();
        setHasMemberAccess(data.hasAccess);
      } catch (error) {
        console.error("Failed to check membership access:", error);
        setHasMemberAccess(false);
      } finally {
        setMembershipLoading(false);
      }
    };
    
    checkMembershipAccess();
  }, [video, videoId, channel]);
  
  // Update remaining time display every minute
  // Note: We don't auto-lock the video while the user is watching - 
  // payment only resets if they refresh/leave after 1 hour
  useEffect(() => {
    if (paymentState === "unlocked" && videoId) {
      const interval = setInterval(() => {
        const time = getRemainingTime(videoId, user?.id);
        if (time) {
          setRemainingTime(time);
        } else {
          // Payment expired but user is still watching - just clear the timer display
          // They'll need to pay again if they refresh or leave and come back
          setRemainingTime(null);
        }
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [paymentState, videoId, user?.id]);
  
  // Load saved progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      if (!videoId || !channel?.id) return;
      
      try {
        const response = await fetch(`/api/kasshi/videos/${videoId}/progress?channelId=${channel.id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.progress && data.progress.progressSeconds > 0) {
            setSavedProgress(data.progress.progressSeconds);
            setCurrentProgress(data.progress.progressSeconds);
          }
        }
      } catch (error) {
        console.error("Failed to load progress:", error);
      }
    };
    
    loadProgress();
  }, [videoId, channel?.id]);
  
  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentProgress(Math.floor(videoRef.current.currentTime));
    }
  };
  
  const handleVideoPlay = () => setIsPlaying(true);
  const handleVideoPause = () => {
    setIsPlaying(false);
    setIsBuffering(false);
  };
  const handleVideoEnded = () => setIsPlaying(false);
  
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      // Restore saved progress
      if (savedProgress && savedProgress > 0) {
        videoRef.current.currentTime = savedProgress;
      }
      
      // Apply saved volume and mute settings
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
      
      // Detect native video resolution for quality display
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;
      if (width && height) {
        setNativeResolution({ width, height });
        // Set quality label based on height
        if (height >= 2160) setVideoQuality("4K");
        else if (height >= 1440) setVideoQuality("1440p");
        else if (height >= 1080) setVideoQuality("1080p");
        else if (height >= 720) setVideoQuality("720p");
        else if (height >= 480) setVideoQuality("480p");
        else if (height >= 360) setVideoQuality("360p");
        else setVideoQuality(`${height}p`);
      }
    }
  };
  
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch((err) => {
          console.error("Play failed:", err);
          // Some browsers require muted autoplay - try muted as fallback
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {
              toast.error("Unable to play video. Try clicking the video directly.");
            });
          }
        });
      }
    }
  };
  
  // Seek to position given a clientX coordinate
  const seekToPosition = (clientX: number) => {
    if (!videoRef.current || !video || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const duration = videoRef.current.duration || video.durationSeconds || 600;
    const newTime = percent * duration;
    videoRef.current.currentTime = newTime;
    setCurrentProgress(Math.floor(newTime));
  };
  
  // Progress bar drag handlers
  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekToPosition(e.clientX);
  };
  
  const handleProgressTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    if (e.touches.length > 0) {
      seekToPosition(e.touches[0].clientX);
    }
  };
  
  // Global mouse/touch move and up handlers for dragging
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      seekToPosition(e.clientX);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        seekToPosition(e.touches[0].clientX);
      }
    };
    
    const handleTouchEnd = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, video]);
  
  const changePlaybackSpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };
  
  const toggleMute = () => {
    const newMuted = !isMuted;
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
    setIsMuted(newMuted);
    localStorage.setItem("kasshi_muted", String(newMuted));
  };
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    // Persist volume settings
    localStorage.setItem("kasshi_volume", String(newVolume));
    localStorage.setItem("kasshi_muted", String(newVolume === 0));
  };
  
  const toggleFullscreen = async () => {
    const videoElement = videoRef.current;
    const container = playerContainerRef.current;
    if (!container) return;
    
    // Check current fullscreen state (with webkit prefix for iOS)
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement || 
      (document as any).webkitFullscreenElement
    );
    
    if (!isCurrentlyFullscreen) {
      // Try to enter fullscreen
      try {
        // On mobile, prefer video element fullscreen for native controls
        if (videoElement && (videoElement as any).webkitEnterFullscreen) {
          // iOS Safari - use video element's native fullscreen
          await (videoElement as any).webkitEnterFullscreen();
        } else if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          // Safari desktop fallback
          await (container as any).webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } catch (error) {
        console.error("Fullscreen request failed:", error);
      }
    } else {
      // Exit fullscreen
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
      } catch (error) {
        console.error("Exit fullscreen failed:", error);
      }
    }
  };
  
  // Listen for fullscreen changes (with webkit prefix support)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Keyboard shortcuts for video player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (!videoRef.current) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (videoRef.current.paused) {
            videoRef.current.play().catch(console.error);
            setIsPlaying(true);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          setCurrentProgress(Math.floor(videoRef.current.currentTime));
          break;
        case 'ArrowRight':
          e.preventDefault();
          const duration = videoRef.current.duration || video?.durationSeconds || 600;
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
          setCurrentProgress(Math.floor(videoRef.current.currentTime));
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [video?.durationSeconds]);
  
  // Save progress periodically (every 10 seconds) and on unmount
  useEffect(() => {
    const saveProgress = async () => {
      if (!videoId || !channel?.id || currentProgress === 0) return;
      if (currentProgress === lastSavedProgressRef.current) return;
      
      try {
        await fetch(`/api/kasshi/videos/${videoId}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            channelId: channel?.id,
            userId: user?.id,
            progressSeconds: currentProgress,
            durationSeconds: video?.durationSeconds || 600,
          }),
        });
        lastSavedProgressRef.current = currentProgress;
      } catch (error) {
        console.error("Failed to save progress:", error);
      }
    };
    
    // Save every 10 seconds while playing
    const interval = setInterval(saveProgress, 10000);
    
    // Save on unmount
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [videoId, channel?.id, currentProgress, video?.durationSeconds]);

  // KasWare connection handler for Watch page
  const handleKaswareConnect = async () => {
    if (!kasware.isAvailable) {
      window.open("https://kasware.xyz", "_blank");
      return;
    }
    
    setIsKaswareAuthenticating(true);
    try {
      // Connect to KasWare
      const connectResult = await kasware.connect();
      if (!connectResult.success || !connectResult.address) {
        toast.error(connectResult.error || "Failed to connect to KasWare");
        setIsKaswareAuthenticating(false);
        return;
      }
      
      // Get a challenge message from the server
      const challengeRes = await fetch("/api/wallet-auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: connectResult.address }),
      });
      
      if (!challengeRes.ok) {
        toast.error("Failed to get authentication challenge");
        setIsKaswareAuthenticating(false);
        return;
      }
      
      const { challenge } = await challengeRes.json();
      
      // Sign the challenge message
      const signResult = await kasware.signMessage(challenge);
      if (!signResult.success || !signResult.signature) {
        toast.error(signResult.error || "Failed to sign message");
        setIsKaswareAuthenticating(false);
        return;
      }
      
      // Verify signature and authenticate
      const authResult = await connectExternalWallet(
        connectResult.address,
        signResult.signature,
        challenge,
        kasware.publicKey || undefined
      );
      
      if (!authResult.success) {
        toast.error(authResult.error || "Authentication failed");
      } else {
        toast.success("Wallet connected!");
      }
    } catch (error) {
      console.error("KasWare auth error:", error);
      toast.error("Failed to connect wallet");
    }
    setIsKaswareAuthenticating(false);
  };

  const handleLike = async () => {
    // Must be connected
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to like videos");
      return;
    }
    
    setIsLiking(true);
    
    try {
      // If already liked, unlike (costs UNLIKE_COST_KAS)
      if (isLiked) {
        if (balance === null || balance < UNLIKE_COST_KAS) {
          toast.error("Insufficient balance");
          return;
        }
        
        // Pay platform for unlike
        if (!platformWallet) {
          toast.error("Platform wallet not configured");
          return;
        }
        await unifiedPay(platformWallet, UNLIKE_COST_KAS, videoId || "", "unlike", undefined, undefined);
        
        const deleteHeaders: HeadersInit = { "Content-Type": "application/json" };
        if (externalWallet?.authToken) {
          deleteHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch(`/api/kasshi/videos/${videoId}/interact`, {
          method: "DELETE",
          headers: deleteHeaders,
          credentials: "include",
          body: JSON.stringify({
            channelId: channel?.id,
            userId: externalWallet?.userId || user?.id,
            interactionType: "like"
          })
        });
        
        if (res.ok) {
          setIsLiked(false);
          setLocalLikeCount(prev => Math.max(0, prev - 1));
          toast.success("Like removed");
        }
        return;
      }
      
      // Likes go to platform
      let result: { success: boolean; transactionId?: string; error?: string; needsConsolidation?: boolean; requiresChannel?: boolean } = { success: true };
      
      // Require platform wallet for payment
      if (!platformWallet) {
        toast.error("Platform wallet not configured");
        return;
      }
      
      // Check balance
      if (balance === null || balance < LIKE_COST_KAS) {
        toast.error("Insufficient balance");
        return;
      }
      
      // Send payment to platform
      result = await unifiedPay(platformWallet, LIKE_COST_KAS, videoId || "", "like");
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to like videos. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      // Save the interaction to database
      const likeHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        likeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const interactRes = await fetch(`/api/kasshi/videos/${videoId}/interact`, {
        method: "POST",
        headers: likeHeaders,
        credentials: "include",
        body: JSON.stringify({
          channelId: channel?.id,
          userId: externalWallet?.userId || user?.id,
          interactionType: "like",
          transactionId: result?.transactionId
        })
      });
      
      if (!interactRes.ok) {
        console.error("Failed to save interaction");
      }
      
      // Update UI
      setIsLiked(true);
      setIsDisliked(false);
      setLocalLikeCount(prev => prev + 1);
      if (isDisliked) setLocalDislikeCount(prev => prev - 1);
      
      toast.success("Liked!");
    } catch (error) {
      console.error("Like payment failed:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsLiking(false);
    }
  };

  const handleDislike = async () => {
    // Must be connected
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to dislike videos");
      return;
    }
    
    setIsDisliking(true);
    
    try {
      // If already disliked, remove dislike (costs UNLIKE_COST_KAS)
      if (isDisliked) {
        if (balance === null || balance < UNLIKE_COST_KAS) {
          toast.error("Insufficient balance");
          return;
        }
        
        // Pay platform for undislike
        if (!platformWallet) {
          toast.error("Platform wallet not configured");
          return;
        }
        await unifiedPay(platformWallet, UNDISLIKE_COST_KAS, videoId || "", "undislike", undefined, undefined);
        
        const undislikeHeaders: HeadersInit = { "Content-Type": "application/json" };
        if (externalWallet?.authToken) {
          undislikeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const res = await fetch(`/api/kasshi/videos/${videoId}/interact`, {
          method: "DELETE",
          headers: undislikeHeaders,
          credentials: "include",
          body: JSON.stringify({
            channelId: channel?.id,
            userId: externalWallet?.userId || user?.id,
            interactionType: "dislike"
          })
        });
        
        if (res.ok) {
          setIsDisliked(false);
          setLocalDislikeCount(prev => Math.max(0, prev - 1));
          toast.success("Dislike removed");
        }
        return;
      }
      
      // Check balance for new dislike
      if (balance === null || balance < DISLIKE_COST_KAS) {
        toast.error("Insufficient balance");
        return;
      }
      
      // Send payment to platform
      if (!platformWallet) {
        toast.error("Platform wallet not configured");
        return;
      }
      const result = await unifiedPay(platformWallet, DISLIKE_COST_KAS, videoId || "", "dislike", undefined, undefined);
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to interact with videos. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      // Save the interaction to database
      const dislikeHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        dislikeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const interactRes = await fetch(`/api/kasshi/videos/${videoId}/interact`, {
        method: "POST",
        headers: dislikeHeaders,
        credentials: "include",
        body: JSON.stringify({
          channelId: channel?.id,
          userId: externalWallet?.userId || user?.id,
          interactionType: "dislike",
          transactionId: result?.transactionId
        })
      });
      
      if (!interactRes.ok) {
        console.error("Failed to save interaction");
      }
      
      // Update UI
      setIsDisliked(true);
      setIsLiked(false);
      setLocalDislikeCount(prev => prev + 1);
      if (isLiked) setLocalLikeCount(prev => prev - 1);
      
      toast.success("Disliked");
    } catch (error) {
      console.error("Dislike payment failed:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsDisliking(false);
    }
  };

  const handleComment = async (e: React.FormEvent, parentComment?: { id: number; authorWallet?: string; authorName: string }) => {
    e.preventDefault();
    const textToPost = parentComment ? replyText.trim() : comment.trim();
    if (!textToPost) return;
    
    // Must be connected to comment
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to comment");
      return;
    }
    
    // Must have a channel to comment
    if (!channel?.id) {
      toast.error("You need to create a channel first to comment");
      return;
    }
    
    // Original comments go to platform, replies go to parent commenter
    let result: { success: boolean; transactionId?: string; error?: string; needsConsolidation?: boolean; requiresChannel?: boolean } = { success: true };
    
    setIsCommenting(true);
    
    try {
      // Determine payment recipient
      const isReply = !!parentComment;
      const recipientAddress = isReply ? parentComment.authorWallet : platformWallet;
      
      // Check if recipient wallet is configured
      if (!recipientAddress) {
        toast.error(isReply ? "Commenter has no wallet configured" : "Platform wallet not configured");
        setIsCommenting(false);
        return;
      }
      
      // Check balance
      if (balance === null || balance < COMMENT_COST_KAS) {
        toast.error("Insufficient balance");
        setIsCommenting(false);
        return;
      }
      
      // Send payment
      result = await unifiedPay(recipientAddress, COMMENT_COST_KAS, videoId || "", isReply ? "comment_reply" : "comment");
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to comment. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      // Save comment to database
      const commentRes = await fetch(`/api/kasshi/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel?.id,
          userId: user?.id,
          content: textToPost,
          parentId: parentComment?.id || null,
        }),
      });
      
      if (!commentRes.ok) {
        throw new Error("Failed to save comment");
      }
      
      // Refresh comments list
      refetchComments();
      
      // Clear the appropriate input
      if (parentComment) {
        setReplyText("");
        setReplyingTo(null);
        // Expand replies to show the new reply
        setExpandedReplies(prev => new Set(prev).add(parentComment.id));
      } else {
        setComment("");
      }
      
      toast.success(`${parentComment ? "Reply" : "Comment"} posted!`);
    } catch (error) {
      console.error("Comment payment failed:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsCommenting(false);
    }
  };

  const handleCommentLike = async (commentId: string, commenterWallet: string | undefined, _commenterName: string) => {
    // Must be connected to like
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to like comments");
      return;
    }
    
    const currentInteraction = commentInteractions[commentId];
    const isAlreadyLiked = currentInteraction === 'like';
    
    // If already liked, unlike (free)
    if (isAlreadyLiked) {
      setLikingCommentId(commentId);
      try {
        // Charge small fee for unlike
        if (!platformWallet) {
          toast.error("Platform wallet not configured");
          return;
        }
        const result = await unifiedPay(platformWallet, UNLIKE_COST_KAS, videoId || "", "comment_unlike", undefined, parseInt(commentId));
        
        if (!result.success) {
          if (result.needsConsolidation) {
            toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
            return;
          }
          if (result.requiresChannel) {
            toast.error("Create a channel first to interact. Go to Settings → Create Channel", { duration: 6000 });
            return;
          }
          throw new Error(result.error || "Payment failed");
        }
        
        const unlikeParams = new URLSearchParams();
        if (channel?.id) unlikeParams.set("channelId", String(channel.id));
        else if (externalWallet?.userId) unlikeParams.set("userId", externalWallet.userId);
        const unlikeHeaders: HeadersInit = {};
        if (externalWallet?.authToken) {
          unlikeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const response = await fetch(`/api/kasshi/comments/${commentId}/interact?${unlikeParams.toString()}`, {
          method: "DELETE",
          headers: unlikeHeaders,
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setCommentInteractions(prev => {
            const updated = { ...prev };
            delete updated[commentId];
            return updated;
          });
          setLocalCommentCounts(prev => ({
            ...prev,
            [commentId]: { likes: data.likeCount, dislikes: data.dislikeCount }
          }));
          toast.success("Unliked!");
        }
      } catch (error) {
        console.error("Comment unlike failed:", error);
        toast.error(error instanceof Error ? error.message : "Unlike failed");
      } finally {
        setLikingCommentId(null);
      }
      return;
    }
    
    setLikingCommentId(commentId);
    
    try {
      // Only charge payment if commenter has a wallet configured
      let result: { success: boolean; transactionId?: string; error?: string; needsConsolidation?: boolean; requiresChannel?: boolean } = { success: true };
      
      if (commenterWallet) {
        // Check balance for new like
        if (balance === null || balance < COMMENT_LIKE_COST_KAS) {
          toast.error("Insufficient balance");
          setLikingCommentId(null);
          return;
        }
        
        // Send payment to commenter
        result = await unifiedPay(commenterWallet, COMMENT_LIKE_COST_KAS, videoId || "", "comment_like", undefined, parseInt(commentId));
      }
      // If no commenter wallet, allow free comment likes (no payment needed)
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to interact. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      // Persist to backend
      const commentLikeHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        commentLikeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const response = await fetch(`/api/kasshi/comments/${commentId}/interact`, {
        method: "POST",
        headers: commentLikeHeaders,
        credentials: "include",
        body: JSON.stringify({ channelId: channel?.id, userId: externalWallet?.userId || user?.id, interactionType: "like" }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setCommentInteractions(prev => ({ ...prev, [commentId]: 'like' }));
        setLocalCommentCounts(prev => ({
          ...prev,
          [commentId]: { likes: data.likeCount, dislikes: data.dislikeCount }
        }));
        toast.success("Liked!");
      }
    } catch (error) {
      console.error("Comment like payment failed:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setLikingCommentId(null);
    }
  };

  const handleCommentDislike = async (commentId: string) => {
    // Must be connected to dislike
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to dislike comments");
      return;
    }
    
    const currentInteraction = commentInteractions[commentId];
    const isAlreadyDisliked = currentInteraction === 'dislike';
    
    // If already disliked, un-dislike (small fee)
    if (isAlreadyDisliked) {
      setDislikingCommentId(commentId);
      try {
        // Platform fee for undislike
        if (!platformWallet) {
          toast.error("Platform wallet not configured");
          return;
        }
        const result = await unifiedPay(platformWallet, UNDISLIKE_COST_KAS, videoId || "", "comment_undislike", undefined, parseInt(commentId));
        
        if (!result.success) {
          if (result.needsConsolidation) {
            toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
            return;
          }
          if (result.requiresChannel) {
            toast.error("Create a channel first to interact. Go to Settings → Create Channel", { duration: 6000 });
            return;
          }
          throw new Error(result.error || "Payment failed");
        }
        
        const undislikeParams = new URLSearchParams();
        if (channel?.id) undislikeParams.set("channelId", String(channel.id));
        else if (externalWallet?.userId) undislikeParams.set("userId", externalWallet.userId);
        const undislikeHeaders: HeadersInit = {};
        if (externalWallet?.authToken) {
          undislikeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
        }
        const response = await fetch(`/api/kasshi/comments/${commentId}/interact?${undislikeParams.toString()}`, {
          method: "DELETE",
          headers: undislikeHeaders,
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setCommentInteractions(prev => {
            const updated = { ...prev };
            delete updated[commentId];
            return updated;
          });
          setLocalCommentCounts(prev => ({
            ...prev,
            [commentId]: { likes: data.likeCount, dislikes: data.dislikeCount }
          }));
          toast.success("Undisliked!");
        }
      } catch (error) {
        console.error("Comment undislike failed:", error);
        toast.error(error instanceof Error ? error.message : "Undislike failed");
      } finally {
        setDislikingCommentId(null);
      }
      return;
    }
    
    // Check balance for new dislike
    if (balance === null || balance < COMMENT_DISLIKE_COST_KAS) {
      toast.error("Insufficient balance");
      return;
    }
    
    setDislikingCommentId(commentId);
    
    try {
      // Send payment to platform
      if (!platformWallet) {
        toast.error("Platform wallet not configured");
        return;
      }
      const result = await unifiedPay(platformWallet, COMMENT_DISLIKE_COST_KAS, videoId || "", "comment_dislike", undefined, parseInt(commentId));
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to interact. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      // Persist to backend
      const commentDislikeHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (externalWallet?.authToken) {
        commentDislikeHeaders["Authorization"] = `Bearer ${externalWallet.authToken}`;
      }
      const response = await fetch(`/api/kasshi/comments/${commentId}/interact`, {
        method: "POST",
        headers: commentDislikeHeaders,
        credentials: "include",
        body: JSON.stringify({ channelId: channel?.id, userId: externalWallet?.userId || user?.id, interactionType: "dislike" }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setCommentInteractions(prev => ({ ...prev, [commentId]: 'dislike' }));
        setLocalCommentCounts(prev => ({
          ...prev,
          [commentId]: { likes: data.likeCount, dislikes: data.dislikeCount }
        }));
        toast.success("Disliked!");
      }
    } catch (error) {
      console.error("Comment dislike payment failed:", error);
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setDislikingCommentId(null);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!isConnected) {
      setIsWalletModalOpen(true);
      toast.error("Connect wallet to delete comments");
      return;
    }
    
    if (balance === null || balance < DELETE_COMMENT_COST_KAS) {
      toast.error("Insufficient balance");
      return;
    }
    
    setDeletingCommentId(commentId);
    
    try {
      // Pay deletion fee to platform
      if (!platformWallet) {
        toast.error("Platform wallet not configured");
        return;
      }
      const result = await unifiedPay(platformWallet, DELETE_COMMENT_COST_KAS, videoId || "", "comment_delete", undefined, parseInt(commentId));
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to manage comments. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      // Delete the comment
      const response = await fetch(`/api/kasshi/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (response.ok) {
        toast.success("Comment deleted");
        refetchComments();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || "Failed to delete comment");
      }
    } catch (error) {
      console.error("Comment delete failed:", error);
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleTip = async () => {
    const amount = parseFloat(tipAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid tip amount");
      return;
    }
    
    // Must be connected
    if (!isConnected) {
      setIsWalletModalOpen(true);
      setShowTipModal(false);
      toast.error("Connect wallet to tip");
      return;
    }
    
    // Check balance
    if (balance === null || balance < amount) {
      toast.error("Insufficient balance");
      return;
    }
    
    // Creator wallet required for tips
    const creatorAddress = video?.channel.walletAddress;
    if (!creatorAddress) {
      toast.error("This creator hasn't configured their wallet yet. Tips are unavailable.");
      return;
    }
    
    // Store pending tip and show security modal
    setPendingTip({ amount, address: creatorAddress });
    setShowTipModal(false);
    setShowSecurityModal(true);
  };

  const executeTip = useCallback(async () => {
    if (!pendingTip) return;
    
    setShowSecurityModal(false);
    setIsTipping(true);
    
    try {
      const result = await unifiedPay(pendingTip.address, pendingTip.amount, videoId || "", "tip", video?.channel.id);
      
      if (!result.success) {
        if (result.needsConsolidation) {
          toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
          return;
        }
        if (result.requiresChannel) {
          toast.error("Create a channel first to send tips. Go to Settings → Create Channel", { duration: 6000 });
          return;
        }
        throw new Error(result.error || "Payment failed");
      }
      
      toast.success("Tip sent!");
      setTipAmount("");
      refetchVideo();
    } catch (error) {
      console.error("Tip failed:", error);
      toast.error(error instanceof Error ? error.message : "Tip failed");
    } finally {
      setIsTipping(false);
      setPendingTip(null);
    }
  }, [pendingTip, micropay, videoId, video?.channel.name, refetchVideo]);

  if (videoLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col">
        <Navbar />
        <div className="flex items-center justify-center pt-40">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col">
        <Navbar />
        <div className="flex flex-col items-center justify-center pt-40">
          <h1 className="text-2xl font-bold text-white mb-2">Video not found</h1>
          <p className="text-slate-400 mb-6">This video may have been removed or doesn't exist.</p>
          <Link to="/" className="px-6 py-2 bg-teal-500 hover:bg-teal-400 text-white rounded-full font-medium transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const thumbnail = video.thumbnailUrl || DEFAULT_THUMBNAIL;
  const channelAvatar = video.channel.avatarUrl || DEFAULT_AVATAR;
  const filteredRelated = relatedVideos.filter(v => v.id !== video.id).slice(0, 8);

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-20 pb-8 px-4 lg:px-6 xl:px-8 max-w-[1800px] mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Video player */}
            <div 
              ref={playerContainerRef}
              className="bg-black rounded-xl overflow-hidden relative group w-full"
              style={{ 
                aspectRatio: videoAspectRatio,
                maxHeight: 'calc(100vh - 180px)'
              }}
            >
              {/* Actual video element - only render when payment confirmed */}
              {video.videoUrl && paymentState === "unlocked" ? (
                <>
                  <video
                    ref={videoRef}
                    src={video.videoUrl}
                    poster={thumbnail}
                    className="w-full h-full bg-black"
                    style={{
                      // Video fills container (container matches video aspect ratio)
                      objectFit: 'cover',
                      // Force hardware acceleration
                      willChange: 'transform',
                      transform: 'translateZ(0)',
                    }}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onEnded={handleVideoEnded}
                    onLoadedMetadata={(e) => {
                      handleLoadedMetadata();
                      // Check if video track is available and set aspect ratio
                      const vid = e.currentTarget;
                      if (vid.videoWidth === 0 || vid.videoHeight === 0) {
                        console.error("Video has no video track - audio only or corrupted");
                        setVideoError("Video track unavailable. The video may be audio-only or the video stream is being blocked.");
                      } else {
                        // Set container aspect ratio to match video
                        setVideoAspectRatio(`${vid.videoWidth}/${vid.videoHeight}`);
                      }
                    }}
                    onError={(e) => {
                      console.error("Video load error:", e);
                      setVideoError("Video failed to load. This may be caused by antivirus software or browser settings blocking the video stream.");
                    }}
                    onStalled={() => {
                      // Video stalled - could be network or blocking issue
                      console.warn("Video playback stalled - buffering");
                      setIsBuffering(true);
                    }}
                    onWaiting={() => {
                      // Video is waiting for more data
                      console.log("Video waiting for data - buffering");
                      setIsBuffering(true);
                    }}
                    onCanPlay={() => {
                      // Video has enough data to play
                      setIsBuffering(false);
                    }}
                    onCanPlayThrough={() => {
                      // Video can play through without buffering
                      setIsBuffering(false);
                    }}
                    onLoadedData={() => {
                      // Video data loaded
                      setIsBuffering(false);
                    }}
                    onPlaying={() => {
                      // Video is playing
                      setIsBuffering(false);
                    }}

                    onProgress={(e) => {
                      // Track buffered progress
                      const vid = e.currentTarget;
                      if (vid.buffered.length > 0 && vid.duration > 0) {
                        const bufferedEnd = vid.buffered.end(vid.buffered.length - 1);
                        setBufferedPercent((bufferedEnd / vid.duration) * 100);
                      }
                    }}
                    preload="metadata"
                    playsInline
                  />
                  {/* Buffering overlay - shows spinner only when actively playing and waiting for data */}
                  {isBuffering && isPlaying && !videoError && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-5 pointer-events-none">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span className="text-white/80 text-sm font-medium">Buffering...</span>
                      </div>
                    </div>
                  )}
                  {/* Video error overlay */}
                  {videoError && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 z-10">
                      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <h3 className="text-white font-semibold text-lg mb-2">Video Playback Issue</h3>
                      <p className="text-slate-400 text-center max-w-md mb-4">{videoError}</p>
                      <div className="text-sm text-slate-500 text-center space-y-1">
                        <p>Try these fixes:</p>
                        <ul className="list-disc list-inside text-left">
                          <li>Disable antivirus real-time scanning temporarily</li>
                          <li>Add this site to your antivirus whitelist</li>
                          <li>Try a different browser</li>
                          <li>Download the video and play locally</li>
                        </ul>
                      </div>
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => {
                            setVideoError(null);
                            if (videoRef.current) {
                              // Add cache-busting parameter to force fresh fetch
                              const currentSrc = videoRef.current.src;
                              const cacheBuster = `?t=${Date.now()}`;
                              const newSrc = currentSrc.includes('?') 
                                ? currentSrc.split('?')[0] + cacheBuster 
                                : currentSrc + cacheBuster;
                              videoRef.current.src = newSrc;
                              videoRef.current.load();
                            }
                          }}
                          className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors"
                        >
                          Try Again
                        </button>
                        <button
                          onClick={() => {
                            // Open video in new tab - sometimes bypasses antivirus scanning
                            if (video.videoUrl) {
                              window.open(video.videoUrl, '_blank');
                            }
                          }}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          Open in New Tab
                        </button>
                        {video.videoUrl && (
                          <a
                            href={video.videoUrl}
                            download={`${video.title || 'video'}.mp4`}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <img 
                  src={thumbnail} 
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
              )}
              
              {/* Members-only overlay - needs membership */}
              {video.isMembersOnly && hasMemberAccess === false && paymentState === "locked" && (
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60 flex flex-col items-center justify-center p-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 backdrop-blur-sm flex items-center justify-center mb-6 border border-purple-500/50">
                    <Crown className="w-10 h-10 text-purple-400" />
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <h2 className="text-2xl font-bold text-white text-center">Members Only</h2>
                    <Sparkles className="w-5 h-5 text-purple-400" />
                  </div>
                  <p className="text-slate-400 mb-6 text-center max-w-md">
                    This exclusive content is only available to {video.channel.name}'s members.
                  </p>
                  
                  {/* Membership CTA */}
                  <div className="bg-slate-800/80 backdrop-blur-sm px-6 py-4 rounded-2xl border border-purple-500/30 mb-6">
                    <p className="text-purple-300 text-center mb-2">Join the community!</p>
                    <p className="text-slate-400 text-sm text-center">Get access to exclusive videos, behind-the-scenes content, and more.</p>
                  </div>
                  
                  <Link
                    to={`/channel/${video.channel.handle}`}
                    className="flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-full font-semibold transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                  >
                    <Crown className="w-5 h-5" />
                    View Membership Options
                  </Link>
                </div>
              )}
              
              {/* Membership loading state */}
              {video.isMembersOnly && membershipLoading && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
                  <p className="text-slate-400">Checking membership access...</p>
                </div>
              )}
              
              {/* Payment required overlay - for authenticated users with failed payment */}
              {paymentState === "locked" && isConnected && !video.isMembersOnly && (
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60 flex flex-col items-center justify-center p-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-500/30 to-emerald-500/30 backdrop-blur-sm flex items-center justify-center mb-6 border border-teal-500/50">
                    <Play className="w-10 h-10 text-teal-400 ml-1" />
                  </div>
                  
                  <h2 className="text-2xl font-bold text-white text-center mb-2">Pay to Watch</h2>
                  <p className="text-slate-400 mb-6 text-center max-w-md">
                    This video requires a small payment to watch. Your KAS goes directly to the creator.
                  </p>
                  
                  <div className="bg-slate-800/80 backdrop-blur-sm px-6 py-4 rounded-2xl border border-teal-500/30 mb-6">
                    <p className="text-teal-300 text-center mb-1">{getViewCostForDuration(video?.durationSeconds || 0)} KAS per view</p>
                    <p className="text-slate-400 text-sm text-center">
                      Your balance: {balance !== null ? balance.toFixed(4) : "..."} KAS
                    </p>
                  </div>
                  
                  <button
                    onClick={() => window.location.reload()}
                    className="flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-full font-semibold transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Retry Payment
                  </button>
                  
                  {balance !== null && balance < getViewCostForDuration(video?.durationSeconds || 0) && (
                    <p className="text-amber-400 text-sm mt-4 text-center">
                      Add more KAS to your wallet to watch this video
                    </p>
                  )}
                </div>
              )}
              
              {/* Login required overlay - for non-authenticated users */}
              {paymentState === "locked" && !isConnected && !video.isMembersOnly && (
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60 flex flex-col items-center justify-center p-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-500/30 to-emerald-500/30 backdrop-blur-sm flex items-center justify-center mb-6 border border-teal-500/50">
                    <Play className="w-10 h-10 text-teal-400 ml-1" />
                  </div>
                  
                  <h2 className="text-2xl font-bold text-white text-center mb-2">Sign in to Watch</h2>
                  <p className="text-slate-400 mb-4 text-center max-w-md">
                    Create an account or sign in to watch videos on KasShi. Each view supports creators directly with KAS.
                  </p>
                  
                  <div className="bg-slate-800/80 backdrop-blur-sm px-6 py-4 rounded-2xl border border-teal-500/30 mb-6">
                    <p className="text-teal-300 text-center mb-1">{getViewCostForDuration(video?.durationSeconds || 0)} KAS per view</p>
                    <p className="text-slate-400 text-sm text-center">95% goes directly to the creator</p>
                  </div>
                  
                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    {/* Google Sign In */}
                    <button
                      onClick={() => redirectToLogin()}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-full font-semibold transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                    >
                      Sign in with Google
                    </button>
                    <p className="text-slate-500 text-xs text-center">Wallet auto-created • Best for newcomers</p>
                    
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-slate-600" />
                      <span className="text-slate-500 text-sm">OR</span>
                      <div className="flex-1 h-px bg-slate-600" />
                    </div>
                    
                    {/* KasWare Wallet */}
                    <button
                      onClick={handleKaswareConnect}
                      disabled={isKaswareAuthenticating}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-700/80 hover:bg-slate-600/80 border border-slate-600 text-white rounded-full font-semibold transition-all disabled:opacity-50"
                    >
                      {isKaswareAuthenticating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Connecting...
                        </>
                      ) : kasware.isAvailable ? (
                        <>
                          <KaspaIcon className="w-5 h-5" />
                          Connect KasWare Wallet
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-5 h-5" />
                          Install KasWare Wallet
                        </>
                      )}
                    </button>
                    <p className="text-slate-500 text-xs text-center">Use your own wallet • Full control</p>
                  </div>
                </div>
              )}
              
              {/* Paying state */}
              {paymentState === "paying" && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-full border-4 border-slate-700 border-t-teal-500 animate-spin" />
                    <Sparkles className="w-8 h-8 text-teal-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">Processing Payment</h2>
                  <p className="text-slate-400">Loading video...</p>
                </div>
              )}
              
              {/* Click to play/pause overlay */}
              {paymentState === "unlocked" && video.videoUrl && (
                <div 
                  className="absolute inset-0 cursor-pointer"
                  onClick={togglePlay}
                >
                  {/* Center play button (only when paused) */}
                  {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                        <Play className="w-10 h-10 text-white fill-white ml-1" />
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Video controls bar */}
              {paymentState === "unlocked" && video.videoUrl && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pb-2 pt-8">
                  {/* Progress bar - draggable */}
                  <div 
                    ref={progressBarRef}
                    className={`mx-4 mb-2 h-1 bg-white/30 rounded-full cursor-pointer hover:h-2 transition-all group/progress relative ${isDragging ? 'h-2' : ''}`}
                    onMouseDown={handleProgressMouseDown}
                    onTouchStart={handleProgressTouchStart}
                  >
                    {/* Buffered indicator */}
                    <div 
                      className="absolute inset-y-0 left-0 bg-white/40 rounded-full pointer-events-none"
                      style={{ width: `${bufferedPercent}%` }}
                    />
                    {/* Played progress */}
                    <div 
                      className="h-full bg-teal-500 rounded-full relative pointer-events-none z-10"
                      style={{ width: `${((currentProgress / (videoRef.current?.duration || video.durationSeconds || 600)) * 100)}%` }}
                    >
                      <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-teal-400 rounded-full transition-opacity ${isDragging ? 'opacity-100 scale-125' : 'opacity-0 group-hover/progress:opacity-100'}`} />
                    </div>
                  </div>
                  
                  {/* Controls row */}
                  <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                      {/* Play/Pause */}
                      <button onClick={togglePlay} className="text-white hover:text-teal-400 transition-colors">
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                      </button>
                      
                      {/* Volume - note: iOS doesn't allow programmatic volume control */}
                      <div className="flex items-center gap-1 group/volume relative">
                        <button 
                          onClick={toggleMute} 
                          className="text-white hover:text-teal-400 transition-colors"
                          title={/iPad|iPhone|iPod/.test(navigator.userAgent) ? "Use device volume buttons" : "Toggle mute"}
                        >
                          {isMuted || volume === 0 ? (
                            <VolumeX className="w-5 h-5" />
                          ) : volume < 0.5 ? (
                            <Volume1 className="w-5 h-5" />
                          ) : (
                            <Volume2 className="w-5 h-5" />
                          )}
                        </button>
                        {/* Hide slider on iOS since programmatic volume control doesn't work */}
                        {!/iPad|iPhone|iPod/.test(navigator.userAgent) && (
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="w-0 group-hover/volume:w-20 transition-all duration-200 accent-teal-500 cursor-pointer"
                          />
                        )}
                      </div>
                      
                      {/* Time display */}
                      <span className="text-white text-sm">
                        {formatDuration(currentProgress)} / {formatDuration(videoRef.current?.duration || video.durationSeconds)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Quality indicator */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowQualityMenu(!showQualityMenu);
                            setShowSpeedMenu(false);
                          }}
                          className="text-white hover:text-teal-400 transition-colors text-sm font-medium px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1"
                        >
                          <Settings className="w-4 h-4" />
                          {videoQuality}
                        </button>
                        {showQualityMenu && (
                          <div className="absolute bottom-full right-0 mb-2 bg-slate-900 rounded-lg shadow-xl border border-white/10 py-2 min-w-[140px]">
                            <div className="px-3 pb-2 mb-2 border-b border-white/10">
                              <span className="text-xs text-gray-400 uppercase tracking-wide">Quality</span>
                            </div>
                            <div className="px-3 py-1.5 text-sm text-teal-400 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                              {videoQuality}
                              {nativeResolution && (
                                <span className="text-gray-500 text-xs">
                                  ({nativeResolution.width}×{nativeResolution.height})
                                </span>
                              )}
                            </div>
                            <div className="px-3 pt-2 mt-2 border-t border-white/10">
                              <span className="text-xs text-gray-500">
                                Original quality • No transcoding
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Playback speed */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowSpeedMenu(!showSpeedMenu);
                            setShowQualityMenu(false);
                          }}
                          className="text-white hover:text-teal-400 transition-colors text-sm font-medium px-2 py-1 rounded hover:bg-white/10"
                        >
                          {playbackSpeed}x
                        </button>
                        {showSpeedMenu && (
                          <div className="absolute bottom-full right-0 mb-2 bg-slate-900 rounded-lg shadow-xl border border-white/10 py-1 min-w-[80px]">
                            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                              <button
                                key={speed}
                                onClick={() => changePlaybackSpeed(speed)}
                                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-white/10 transition-colors ${
                                  playbackSpeed === speed ? 'text-teal-400' : 'text-white'
                                }`}
                              >
                                {speed}x
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Fullscreen */}
                      <button onClick={toggleFullscreen} className="text-white hover:text-teal-400 transition-colors">
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Duration badge (when no video URL or not hovering) */}
              {(!video.videoUrl || paymentState !== "unlocked") && (
                <div className="absolute bottom-4 right-4 bg-black/80 text-white text-sm px-2 py-1 rounded">
                  {formatDuration(video.durationSeconds)}
                </div>
              )}
              
              {/* Resume indicator (when has saved progress but not yet playing) */}
              {savedProgress !== null && savedProgress > 0 && !isPlaying && paymentState === "unlocked" && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-full flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Resume from {formatDuration(savedProgress)}
                </div>
              )}
              

            </div>

            {/* Video info */}
            <h1 className="text-xl font-bold text-white mt-4">{video.title}</h1>
            
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
              {/* Channel info */}
              <div className="flex items-center gap-4">
                <Link to={`/channel/${video.channel.handle}`}>
                  <img 
                    src={channelAvatar} 
                    alt={video.channel.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                </Link>
                <div>
                  <Link 
                    to={`/channel/${video.channel.handle}`}
                    className="font-semibold text-white hover:text-teal-400 transition-colors flex items-center gap-1"
                  >
                    {video.channel.name}
                    
                  </Link>
                  <p className="text-sm text-slate-400">
                    {video.channel.subscriberCount?.toLocaleString() || 0} subscribers
                  </p>
                </div>
                {channel?.id === video.channel.id && (
                  <Link
                    to={`/edit/${video.publicId || video.id}`}
                    className="px-4 py-2 rounded-full font-medium text-sm bg-teal-600 text-white hover:bg-teal-500 transition-colors flex items-center gap-1"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </Link>
                )}
                {channel?.id !== video.channel.id && (
                  <button 
                    onClick={async () => {
                      if (!isConnected) {
                        toast.error("Please sign in to subscribe to channels");
                        return;
                      }
                      if (!channel) {
                        toast.error("You need to create a channel first before subscribing to others. Go to Settings to create your channel.");
                        return;
                      }
                      setIsSubscribing(true);
                      try {
                        const response = await fetch(`/api/kasshi/channels/${video.channel.handle}/subscribe`, {
                          method: "POST",
                          headers: { 
                            "Content-Type": "application/json",
                            ...(externalWallet?.authToken ? { "Authorization": `Bearer ${externalWallet.authToken}` } : {})
                          },
                          credentials: "include",
                          body: JSON.stringify({ subscriberChannelId: channel.id }),
                        });
                        if (response.ok) {
                          setIsSubscribed(!isSubscribed);
                        }
                      } catch (error) {
                        console.error("Subscription error:", error);
                      } finally {
                        setIsSubscribing(false);
                      }
                    }}
                    disabled={isSubscribing}
                    className={`px-4 py-2 rounded-full font-medium text-sm transition-colors ${
                      isSubscribed 
                        ? "bg-slate-700 text-white hover:bg-slate-600" 
                        : "bg-white text-slate-900 hover:bg-slate-200"
                    } ${isSubscribing ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {isSubscribing ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : isSubscribed ? (
                      "Subscribed"
                    ) : (
                      "Subscribe"
                    )}
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-800 rounded-full">
                  <button 
                    onClick={handleLike}
                    disabled={isLiking}
                    className={`flex items-center gap-2 px-4 py-2 rounded-l-full border-r border-slate-700 transition-colors ${
                      isLiked ? "text-teal-400" : "text-white hover:bg-slate-700"
                    } ${isLiking ? "opacity-50 cursor-wait" : ""}`}
                    title="Like"
                  >
                    {isLiking ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ThumbsUp className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`} />
                    )}
                    <span className="text-sm">{formatViews(localLikeCount)}</span>
                  </button>
                  <button 
                    onClick={handleDislike}
                    disabled={isDisliking}
                    className={`flex items-center gap-1 px-4 py-2 rounded-r-full transition-colors ${
                      isDisliked ? "text-red-400" : "text-white hover:bg-slate-700"
                    } ${isDisliking ? "opacity-50 cursor-wait" : ""}`}
                    title="Dislike"
                  >
                    {isDisliking ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ThumbsDown className={`w-5 h-5 ${isDisliked ? "fill-current" : ""}`} />
                    )}
                    <span className="text-sm">{formatViews(localDislikeCount)}</span>
                  </button>
                </div>

                {/* Share dropdown */}
                <div className="relative" data-dropdown>
                  <button 
                    onClick={() => { setShowShareMenu(!showShareMenu); setShowMoreMenu(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                    <span className="text-sm hidden sm:inline">Share</span>
                  </button>
                  {showShareMenu && (
                    <div className="absolute top-12 right-0 w-56 bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-2 z-50">

                      <button
                        onClick={async () => {
                          if (!isConnected) {
                            setIsWalletModalOpen(true);
                            toast.error("Connect wallet to share");
                            return;
                          }
                          if (balance === null || balance < SHARE_COST_KAS) {
                            toast.error("Insufficient balance");
                            return;
                          }
                          setIsSharing(true);
                          try {
                            if (!platformWallet) {
                              toast.error("Platform wallet not configured");
                              return;
                            }
                            const result = await unifiedPay(platformWallet, SHARE_COST_KAS, videoId || "", "share");
                            if (!result.success) {
                              if (result.needsConsolidation) {
                                toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
                                return;
                              }
                              if (result.requiresChannel) {
                                toast.error("Create a channel first to share. Go to Settings → Create Channel", { duration: 6000 });
                                return;
                              }
                              throw new Error(result.error || "Payment failed");
                            }
                            navigator.clipboard.writeText(window.location.href);
                            toast.success("Link copied!");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Share failed");
                          } finally {
                            setIsSharing(false);
                            setShowShareMenu(false);
                          }
                        }}
                        disabled={isSharing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 text-white text-sm transition-colors disabled:opacity-50"
                      >
                        {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        Copy link
                      </button>
                      <button
                        onClick={async () => {
                          if (!isConnected) {
                            setIsWalletModalOpen(true);
                            toast.error("Connect wallet to share");
                            return;
                          }
                          if (balance === null || balance < SHARE_COST_KAS) {
                            toast.error("Insufficient balance");
                            return;
                          }
                          setIsSharing(true);
                          try {
                            if (!platformWallet) {
                              toast.error("Platform wallet not configured");
                              return;
                            }
                            const result = await unifiedPay(platformWallet, SHARE_COST_KAS, videoId || "", "share");
                            if (!result.success) {
                              if (result.needsConsolidation) {
                                toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
                                return;
                              }
                              if (result.requiresChannel) {
                                toast.error("Create a channel first to share. Go to Settings → Create Channel", { duration: 6000 });
                                return;
                              }
                              throw new Error(result.error || "Payment failed");
                            }
                            window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(video.title)}`, '_blank');
                            toast.success("Shared!");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Share failed");
                          } finally {
                            setIsSharing(false);
                            setShowShareMenu(false);
                          }
                        }}
                        disabled={isSharing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 text-white text-sm transition-colors disabled:opacity-50"
                      >
                        {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                        Share on X
                      </button>
                      <button
                        onClick={async () => {
                          if (!isConnected) {
                            setIsWalletModalOpen(true);
                            toast.error("Connect wallet to share");
                            return;
                          }
                          if (balance === null || balance < SHARE_COST_KAS) {
                            toast.error("Insufficient balance");
                            return;
                          }
                          setIsSharing(true);
                          try {
                            if (!platformWallet) {
                              toast.error("Platform wallet not configured");
                              return;
                            }
                            const result = await unifiedPay(platformWallet, SHARE_COST_KAS, videoId || "", "share");
                            if (!result.success) {
                              if (result.needsConsolidation) {
                                toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
                                return;
                              }
                              if (result.requiresChannel) {
                                toast.error("Create a channel first to share. Go to Settings → Create Channel", { duration: 6000 });
                                return;
                              }
                              throw new Error(result.error || "Payment failed");
                            }
                            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank');
                            toast.success("Shared!");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Share failed");
                          } finally {
                            setIsSharing(false);
                            setShowShareMenu(false);
                          }
                        }}
                        disabled={isSharing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 text-white text-sm transition-colors disabled:opacity-50"
                      >
                        {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
                        Share on Facebook
                      </button>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setShowTipModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 rounded-full text-white font-medium transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                >
                  <Gift className="w-5 h-5" />
                  <span className="text-sm">Tip</span>
                </button>

                {/* More options dropdown */}
                <div className="relative" data-dropdown>
                  <button 
                    onClick={() => { setShowMoreMenu(!showMoreMenu); setShowShareMenu(false); }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute top-12 right-0 w-48 bg-slate-800 rounded-xl shadow-xl border border-slate-700 py-2 z-50">
                      <button
                        onClick={() => {
                          setShowReportModal(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 text-white text-sm transition-colors"
                      >
                        <Flag className="w-4 h-4" />
                        Report video
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Video description - expandable */}
            <div 
              onClick={() => setDescriptionExpanded(!descriptionExpanded)}
              className="mt-4 p-4 bg-slate-900/50 hover:bg-slate-800/50 rounded-xl cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-4 text-sm text-slate-400 mb-2">
                <span>{formatViews(localViewCount)} views</span>
                <span>•</span>
                <span>{formatTimeAgo(video.createdAt)}</span>
              </div>
              {descriptionExpanded ? (
                <>
                  <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {video.description || "No description available."}
                  </p>
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        <span>Uploaded {new Date(video.createdAt).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}</span>
                        <span className="mx-2">•</span>
                        <span>Recorded on the Kaspa BlockDAG</span>
                      </div>
                      <button className="text-sm text-slate-400 hover:text-white flex items-center gap-1">
                        Show less <ChevronUp className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-slate-300 text-sm leading-relaxed line-clamp-2 flex-1">
                    {video.description || "No description available."}
                  </p>
                  <span className="text-sm text-slate-400 ml-2 flex-shrink-0">...more</span>
                </div>
              )}
            </div>

            {/* Comments section */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-white mb-4">
                {video.commentCount} Comments
              </h2>

              {/* Comment input */}
              <form onSubmit={handleComment} className="flex gap-4 mb-8">
                <img 
                  src={channel?.avatarUrl || DEFAULT_AVATAR}
                  alt="You"
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full bg-transparent border-b border-slate-700 focus:border-teal-500 pb-2 text-white placeholder-slate-500 focus:outline-none transition-colors"
                    disabled={isCommenting}
                  />
                  {comment && (
                    <div className="flex justify-end gap-2 mt-2">
                      <button 
                        type="button"
                        onClick={() => setComment("")}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        disabled={isCommenting}
                        className={`flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-white rounded-full text-sm font-medium transition-colors ${isCommenting ? "opacity-50 cursor-wait" : ""}`}
                      >
                        {isCommenting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Comment
                      </button>
                    </div>
                  )}
                </div>
              </form>

              {/* Comments list */}
              {commentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-6">
                  {comments.map((c) => {
                    const topLevelIsLiked = commentInteractions[String(c.id)] === 'like';
                    const topLevelIsDisliked = commentInteractions[String(c.id)] === 'dislike';
                    const topLevelCounts = localCommentCounts[String(c.id)];
                    const topLevelLikeCount = topLevelCounts?.likes ?? c.likeCount;
                    const topLevelDislikeCount = topLevelCounts?.dislikes ?? (c.dislikeCount || 0);
                    
                    return (
                    <div key={c.id} className="space-y-3">
                      {/* Main comment */}
                      <div className="flex gap-4">
                        <img 
                          src={c.author.avatarUrl || DEFAULT_AVATAR}
                          alt={c.author.name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{c.author.name}</span>
                            <span className="text-slate-500 text-xs">{formatTimeAgo(c.createdAt)}</span>
                          </div>
                          <p className="text-slate-300 text-sm mt-1">{c.content}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <button 
                              onClick={() => handleCommentLike(String(c.id), c.author.walletAddress, c.author.name)}
                              disabled={likingCommentId === String(c.id)}
                              className={`flex items-center gap-1 transition-colors ${likingCommentId === String(c.id) ? "opacity-50 cursor-wait" : ""} ${topLevelIsLiked ? "text-teal-400" : "text-slate-400 hover:text-teal-400"}`}
                              title={topLevelIsLiked ? "Click to unlike" : "Like"}
                            >
                              {likingCommentId === String(c.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ThumbsUp className={`w-4 h-4 ${topLevelIsLiked ? "fill-current" : ""}`} />
                              )}
                              <span className="text-xs">{topLevelLikeCount}</span>
                            </button>
                            <button 
                              onClick={() => handleCommentDislike(String(c.id))}
                              disabled={dislikingCommentId === String(c.id)}
                              className={`flex items-center gap-1 transition-colors ${dislikingCommentId === String(c.id) ? "opacity-50 cursor-wait" : ""} ${topLevelIsDisliked ? "text-orange-400" : "text-slate-400 hover:text-orange-400"}`}
                              title={topLevelIsDisliked ? "Click to undislike" : "Dislike"}
                            >
                              {dislikingCommentId === String(c.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ThumbsDown className={`w-4 h-4 ${topLevelIsDisliked ? "fill-current" : ""}`} />
                              )}
                              <span className="text-xs">{topLevelDislikeCount}</span>
                            </button>
                            <button 
                              onClick={() => setReplyingTo({ id: c.id, authorName: c.author.name, authorWallet: c.author.walletAddress })}
                              className="flex items-center gap-1 text-slate-400 hover:text-teal-400 transition-colors text-xs"
                            >
                              <MessageSquare className="w-4 h-4" />
                              Reply
                            </button>
                            {channel?.id === c.author.id && (
                              <button 
                                onClick={() => handleDeleteComment(String(c.id))}
                                disabled={deletingCommentId === String(c.id)}
                                className={`flex items-center gap-1 text-slate-400 hover:text-red-400 transition-colors text-xs ${deletingCommentId === String(c.id) ? "opacity-50 cursor-wait" : ""}`}
                                title="Delete comment"
                              >
                                {deletingCommentId === String(c.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                                Delete
                              </button>
                            )}
                          </div>
                          
                          {/* Reply input for this comment */}
                          {replyingTo?.id === c.id && (
                            <form 
                              onSubmit={(e) => handleComment(e, { id: c.id, authorWallet: c.author.walletAddress, authorName: c.author.name })} 
                              className="mt-3 flex gap-3"
                            >
                              <CornerDownRight className="w-4 h-4 text-slate-500 flex-shrink-0 mt-2" />
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder={`Reply to @${c.author.name}...`}
                                  className="w-full bg-slate-800/50 border border-slate-700 focus:border-teal-500 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none transition-colors"
                                  autoFocus
                                  disabled={isCommenting}
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                  <button 
                                    type="button"
                                    onClick={() => { setReplyingTo(null); setReplyText(""); }}
                                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    type="submit"
                                    disabled={isCommenting || !replyText.trim()}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                                  >
                                    {isCommenting ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </form>
                          )}
                        </div>
                      </div>
                      
                      {/* Replies - recursive component */}
                      {c.replies && c.replies.length > 0 && (
                        <div className="ml-14">
                          <button
                            onClick={() => {
                              setExpandedReplies(prev => {
                                const next = new Set(prev);
                                if (next.has(c.id)) {
                                  next.delete(c.id);
                                } else {
                                  next.add(c.id);
                                }
                                return next;
                              });
                            }}
                            className="flex items-center gap-1 text-teal-400 text-xs font-medium hover:text-teal-300 transition-colors mb-2"
                          >
                            {expandedReplies.has(c.id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            {c.replies.length} {c.replies.length === 1 ? "reply" : "replies"}
                          </button>
                          
                          {expandedReplies.has(c.id) && (
                            <div className="space-y-4 border-l-2 border-slate-700/50 pl-4">
                              {c.replies.map((reply) => (
                                <CommentItem 
                                  key={reply.id}
                                  comment={reply}
                                  depth={1}
                                  replyingTo={replyingTo}
                                  setReplyingTo={setReplyingTo}
                                  replyText={replyText}
                                  setReplyText={setReplyText}
                                  isCommenting={isCommenting}
                                  handleComment={handleComment}
                                  handleCommentLike={handleCommentLike}
                                  handleCommentDislike={handleCommentDislike}
                                  handleDeleteComment={handleDeleteComment}
                                  likingCommentId={likingCommentId}
                                  dislikingCommentId={dislikingCommentId}
                                  deletingCommentId={deletingCommentId}
                                  expandedReplies={expandedReplies}
                                  setExpandedReplies={setExpandedReplies}
                                  commentInteractions={commentInteractions}
                                  localCommentCounts={localCommentCounts}
                                  currentUserChannelId={channel?.id ?? null}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-8">No comments yet. Be the first to comment!</p>
              )}
            </div>
          </div>

          {/* Sidebar - Related videos */}
          <aside className="lg:w-[380px] xl:w-[400px] flex-shrink-0">
            <h3 className="text-lg font-semibold text-white mb-4">Related Videos</h3>
            {filteredRelated.length > 0 ? (
              <div className="space-y-4">
                {filteredRelated.map((v) => (
                  <Link key={v.id} to={`/watch/${v.publicId || v.id}`} className="flex gap-3 group">
                    <div className="relative w-40 flex-shrink-0">
                      <img 
                        src={v.thumbnailUrl || DEFAULT_THUMBNAIL}
                        alt={v.title}
                        className="w-full aspect-video object-cover rounded-lg"
                      />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
                        {formatDuration(v.durationSeconds)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white line-clamp-2 group-hover:text-teal-400 transition-colors">
                        {v.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">{v.channel.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatViews(v.viewCount)} views • {formatTimeAgo(v.createdAt)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No related videos yet.</p>
            )}
          </aside>
        </div>
      </main>

      {/* Payment toast */}
      {showPaymentToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-3 rounded-full shadow-lg shadow-teal-500/25 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Thank you for watching!</span>
        </div>
      )}

      {/* Wallet Modal */}
      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />

      {/* Security Verification Modal for Tips */}
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

      {/* Tip Modal */}
      {showTipModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowTipModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Tip Creator</h2>
              <button 
                onClick={() => setShowTipModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl">
              <img 
                src={video?.channel.avatarUrl || DEFAULT_AVATAR} 
                alt={video?.channel.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <div>
                <p className="font-medium text-white">{video?.channel.name}</p>
                <p className="text-sm text-slate-400">@{video?.channel.handle}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-2 block">Tip Amount (KAS)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <KaspaIcon size={20} />
                </div>
                <input
                  type="number"
                  value={tipAmount}
                  onChange={e => setTipAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {balance !== null && (
                <p className="text-sm text-slate-500 mt-2">
                  Balance: {balance.toFixed(4)} KAS
                </p>
              )}
            </div>

            <div className="flex gap-2 mb-6">
              {[1, 5, 10, 25].map(amount => (
                <button
                  key={amount}
                  onClick={() => setTipAmount(amount.toString())}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-teal-400 transition-colors"
                >
                  {amount} KAS
                </button>
              ))}
            </div>

            <button
              onClick={handleTip}
              disabled={isTipping || !tipAmount || parseFloat(tipAmount) <= 0}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
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

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-400" />
                Report Video
              </h3>
              <button
                onClick={() => { setShowReportModal(false); setReportReason(""); }}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-400 text-sm mb-4">
              Select a reason for reporting this video.
            </p>

            <div className="space-y-2 mb-6">
              {[
                "Spam or misleading",
                "Hateful or abusive content",
                "Harmful or dangerous acts",
                "Sexual content",
                "Copyright violation",
                "Privacy violation",
                "Other"
              ].map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                    reportReason === reason
                      ? "bg-teal-500/20 border-2 border-teal-500 text-teal-400"
                      : "bg-slate-800 border-2 border-transparent hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowReportModal(false); setReportReason(""); }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!reportReason) {
                    toast.error("Please select a reason");
                    return;
                  }
                  if (!isConnected) {
                    setIsWalletModalOpen(true);
                    setShowReportModal(false);
                    toast.error("Connect wallet to report");
                    return;
                  }
                  if (balance === null || balance < REPORT_COST_KAS) {
                    toast.error("Insufficient balance");
                    return;
                  }
                  setIsReporting(true);
                  try {
                    // Pay report fee to platform
                    if (!platformWallet) {
                      toast.error("Platform wallet not configured");
                      return;
                    }
                    const result = await unifiedPay(platformWallet, REPORT_COST_KAS, videoId || "", "report", undefined, undefined);
                    if (!result.success) {
                      if (result.needsConsolidation) {
                        toast.error("Your wallet has too many small transactions. Please consolidate your wallet in Settings.", { duration: 6000 });
                        return;
                      }
                      throw new Error(result.error || "Payment failed");
                    }
                    
                    const res = await fetch(`/api/kasshi/videos/${videoId}/report`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ reason: reportReason }),
                    });
                    if (res.ok) {
                      toast.success("Report submitted. We'll review it shortly.");
                      setShowReportModal(false);
                      setReportReason("");
                    } else {
                      let data;
                      try {
                        data = await res.json();
                        toast.error(data.error || "Failed to submit report");
                      } catch {
                        toast.error("Server error. Please try again.");
                      }
                    }
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to submit report");
                  } finally {
                    setIsReporting(false);
                  }
                }}
                disabled={!reportReason || isReporting}
                className="flex-1 py-3 bg-red-500 hover:bg-red-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isReporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
