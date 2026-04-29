import { useEffect, useState, useRef, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import { useSearchParams } from "react-router-dom";
import { SuperReactModal } from "./SuperReactModal";
import TopSuperReacts from "./TopSuperReacts";
import { Flame, Play, Volume2, VolumeX, Loader2, ArrowLeft, Video, Music, Heart, MessageCircle, Share2, Check, X, Send, ThumbsUp, Reply } from "lucide-react";
import LocalizedLink from "@/react-app/components/LocalizedLink";
import { useLocalizedNavigate } from "@/react-app/components/LanguageRouter";
import { useWallet } from "@/react-app/contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import { useAudioPlayer } from "@/react-app/contexts/AudioPlayerContext";
import { usePayment } from "@/react-app/hooks/usePayment";
import Hls from "hls.js";

// Clip interaction costs (same as videos)
const LIKE_COST_KAS = 0.02;
const COMMENT_COST_KAS = 0.02;
// Using direct video element for clips instead of VideoPlayer

const PRELOAD_COUNT = 8; // Number of clips to preload ahead

// Animated background particles for the clips page
function ClipsBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-950 to-black" />
      
      {/* Animated gradient orbs */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-orange-600/20 via-red-500/10 to-transparent blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-gradient-to-tl from-purple-600/15 via-pink-500/10 to-transparent blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-r from-orange-500/5 via-red-500/10 to-purple-500/5 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      
      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-orange-400/40"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
          }}
        />
      ))}
      
      {/* Grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />
      
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { transform: translateY(-20px) scale(1.2); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

interface Clip {
  id: number;
  publicId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  priceKas: string;
  cropX: number | null;
  cropY: number | null;
  cropZoom: number | null;
  bunnyVideoId: string | null;
  createdAt: string;
  channel: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
    walletAddress: string | null;
  };
}

interface ClipComment {
  id: number | string;
  content: string;
  likeCount: number;
  createdAt: string;
  parentId?: number;
  isSuperReact?: boolean;
  superReactAmount?: number;
  isAnonymous?: boolean;
  channel: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
  };
  replies?: ClipComment[];
}

export default function ClipsFeed() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [superReactOpen, setSuperReactOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false); // Try with sound first, fallback to muted if blocked
  const [isPlaying, setIsPlaying] = useState(false); // Start false, will be set true when video is ready
  const [volume, setVolume] = useState(1); // 0-1 volume level
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [likedClips, setLikedClips] = useState<Set<number>>(new Set());
  const [commentOpen, setCommentOpen] = useState(false);
  const [comments, setComments] = useState<ClipComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likedComments, setLikedComments] = useState<Set<number | string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<ClipComment | null>(null);
  
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const hlsRefs = useRef<Map<number, Hls>>(new Map());
  const preloadedHlsRefs = useRef<Map<number, Hls>>(new Map()); // For preloaded clips
  const userPausedRef = useRef(false); // Track if user manually paused
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useLocalizedNavigate();
  const [searchParams] = useSearchParams();
  const initialClipId = searchParams.get("v"); // Get specific clip from URL
  const [initialClipLoaded, setInitialClipLoaded] = useState(false);
  
  const { wallet, externalWallet } = useWallet();
  const walletAddress = wallet?.address || externalWallet?.address || null;
  const { user } = useAuth();
  const { setIsPlaying: setGlobalMusicPlaying, isPlaying: isGlobalMusicPlaying } = useAudioPlayer();
  const { pay } = usePayment();
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  
  // Fetch platform wallet for payments
  useEffect(() => {
    fetch("/api/platform-wallet")
      .then(res => res.json())
      .then(data => setPlatformWallet(data.walletAddress))
      .catch(err => console.error("Failed to fetch platform wallet:", err));
  }, []);

  const { ref: loadMoreRef, inView } = useInView({ threshold: 0.5 });

  // Pause global music player when clips page loads
  useEffect(() => {
    if (isGlobalMusicPlaying) {
      setGlobalMusicPlaying(false);
    }
  }, []);

  // First interaction helper - unmute and play on first touch/click (required for mobile)
  useEffect(() => {
    const handleFirstInteraction = () => {
      const currentClip = clips[currentIndex];
      if (!currentClip) return;
      const video = videoRefs.current.get(currentClip.id);
      if (video) {
        // Unmute on first interaction - mobile browsers allow audio after user gesture
        video.muted = false;
        video.volume = volume;
        setIsMuted(false);
        
        if (video.paused && !userPausedRef.current) {
          video.play().catch(() => {});
        }
      }
    };
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
    document.addEventListener('click', handleFirstInteraction, { once: true });
    return () => {
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, [clips, currentIndex, volume]);

  // Cleanup HLS instances on unmount
  useEffect(() => {
    return () => {
      hlsRefs.current.forEach((hls) => {
        hls.destroy();
      });
      hlsRefs.current.clear();
      preloadedHlsRefs.current.forEach((hls) => {
        hls.destroy();
      });
      preloadedHlsRefs.current.clear();
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/kasshi/clips?page=${page}&limit=15`);
      const data = await res.json();
      
      if (data.clips && data.clips.length > 0) {
        // Dedupe clips to avoid duplicate key errors
        setClips(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newClips = data.clips.filter((c: Clip) => !existingIds.has(c.id));
          return [...prev, ...newClips];
        });
        setPage(prev => prev + 1);
        
        // Note: Preloading is handled by the HLS instances
        setHasMore(data.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load clips:", err);
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore]);

  // Load specific clip from URL if provided
  const loadSpecificClip = useCallback(async (clipPublicId: string) => {
    try {
      const res = await fetch(`/api/kasshi/clips?v=${clipPublicId}&limit=15`);
      const data = await res.json();
      
      if (data.clips && data.clips.length > 0) {
        // Find the target clip index
        const targetIndex = data.clips.findIndex((c: Clip) => c.publicId === clipPublicId);
        
        setClips(data.clips);
        setPage(2);
        setHasMore(data.hasMore);
        
        // Set current index to the specific clip
        if (targetIndex >= 0) {
          setCurrentIndex(targetIndex);
          // Scroll to it after a brief delay
          setTimeout(() => {
            const container = containerRef.current;
            if (container) {
              const itemHeight = container.clientHeight;
              container.scrollTo({ top: itemHeight * targetIndex, behavior: 'instant' });
            }
          }, 100);
        }
      }
    } catch (err) {
      console.error("Failed to load specific clip:", err);
      // Fall back to normal load
      loadMore();
    } finally {
      setInitialClipLoaded(true);
    }
  }, [loadMore]);

  // Initial load - check for specific clip in URL
  useEffect(() => {
    if (initialClipId && !initialClipLoaded) {
      loadSpecificClip(initialClipId);
    } else if (!initialClipId) {
      loadMore();
      setInitialClipLoaded(true);
    }
  }, [initialClipId]);

  // Fetch user's liked clips
  useEffect(() => {
    const fetchLikedClips = async () => {
      if (!walletAddress && !user?.id) return;
      
      try {
        const params = new URLSearchParams();
        if (walletAddress) params.set("walletAddress", walletAddress);
        if (user?.id) params.set("userId", user.id);
        
        const res = await fetch(`/api/kasshi/clips/liked?${params}`);
        const data = await res.json();
        
        if (data.likedClipIds && data.likedClipIds.length > 0) {
          setLikedClips(new Set(data.likedClipIds));
        }
      } catch (err) {
        console.error("Failed to fetch liked clips:", err);
      }
    };
    
    fetchLikedClips();
  }, [walletAddress, user?.id]);

  // Auto-play is now triggered by MANIFEST_PARSED or canplay events when video is ready

  // Load more when bottom is in view
  useEffect(() => {
    if (inView && !loading && hasMore) {
      loadMore();
    }
  }, [inView, loading, hasMore, loadMore]);

  // Handle video playback when scrolling to new clip
  useEffect(() => {
    const currentClip = clips[currentIndex];
    if (!currentClip) return;
    
    // Pause ALL other videos
    videoRefs.current.forEach((video, clipId) => {
      if (clipId !== currentClip.id) {
        video.pause();
        video.currentTime = 0;
      }
    });
    
    // Don't auto-play if user manually paused
    if (userPausedRef.current) return;
    
    // Play current video - try with sound first
    const currentVideo = videoRefs.current.get(currentClip.id);
    if (currentVideo) {
      currentVideo.volume = volume;
      // Try unmuted first
      currentVideo.muted = false;
      currentVideo.play().then(() => {
        setIsMuted(false);
      }).catch(() => {
        // Browser blocked unmuted autoplay, try muted
        currentVideo.muted = true;
        setIsMuted(true);
        currentVideo.play().catch(() => {});
      });
    }
  }, [currentIndex, clips]); // Only run when switching clips
  
  // Sync volume/mute changes to current video
  useEffect(() => {
    const currentClip = clips[currentIndex];
    if (!currentClip) return;
    const currentVideo = videoRefs.current.get(currentClip.id);
    if (currentVideo) {
      currentVideo.muted = isMuted;
      currentVideo.volume = volume;
    }
  }, [isMuted, volume, currentIndex, clips]);

  // Scroll snap detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const itemHeight = container.clientHeight;
      const newIndex = Math.round(scrollTop / itemHeight);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < clips.length) {
        userPausedRef.current = false; // Reset pause state for new clip
        setCurrentIndex(newIndex);
        // The currentIndex useEffect will handle starting playback
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [currentIndex, clips.length]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    const currentClip = clips[currentIndex];
    const video = currentClip ? videoRefs.current.get(currentClip.id) : null;
    if (video) {
      video.muted = newMuted;
      if (!newMuted) {
        video.volume = volume;
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    const currentClip = clips[currentIndex];
    const video = currentClip ? videoRefs.current.get(currentClip.id) : null;
    if (video) {
      video.volume = newVolume;
      video.muted = newVolume === 0;
    }
  };

  const handleShare = (clip: Clip) => {
    const shareUrl = `https://kasshi.io/clips?v=${clip.publicId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Update URL when scrolling to different clips (without page reload)
  useEffect(() => {
    if (clips.length > 0 && initialClipLoaded) {
      const currentClip = clips[currentIndex];
      if (currentClip) {
        const newUrl = `/clips?v=${currentClip.publicId}`;
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [currentIndex, clips, initialClipLoaded]);

  const handleLike = async (clip: Clip) => {
    if (!walletAddress && !user?.id) {
      navigate("/settings");
      return;
    }

    const wasLiked = likedClips.has(clip.id);
    
    // Only charge for new likes, unlikes are free
    if (!wasLiked) {
      if (!platformWallet) {
        console.error("Platform wallet not loaded");
        return;
      }
      
      try {
        // Pay first
        const payResult = await pay(platformWallet, LIKE_COST_KAS, {
          videoId: clip.id.toString(),
          paymentType: "clip_like",
        });
        
        if (!payResult.success) {
          console.error("Payment failed:", payResult.error);
          return;
        }
      } catch (err) {
        console.error("Payment error:", err);
        return;
      }
    }
    
    // Optimistic update
    setLikedClips(prev => {
      const next = new Set(prev);
      if (wasLiked) {
        next.delete(clip.id);
      } else {
        next.add(clip.id);
      }
      return next;
    });
    
    setClips(prev => prev.map(c => 
      c.id === clip.id 
        ? { ...c, likeCount: wasLiked ? Math.max(0, c.likeCount - 1) : c.likeCount + 1 }
        : c
    ));

    try {
      const res = await fetch(`/api/kasshi/clips/${clip.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, userId: user?.id })
      });
      const data = await res.json();
      if (!res.ok) {
        // Revert on error
        setLikedClips(prev => {
          const next = new Set(prev);
          if (wasLiked) next.add(clip.id);
          else next.delete(clip.id);
          return next;
        });
        setClips(prev => prev.map(c => 
          c.id === clip.id ? { ...c, likeCount: clip.likeCount } : c
        ));
      } else {
        // Update with server count
        setClips(prev => prev.map(c => 
          c.id === clip.id ? { ...c, likeCount: data.likeCount } : c
        ));
      }
    } catch {
      // Revert on error
      setLikedClips(prev => {
        const next = new Set(prev);
        if (wasLiked) next.add(clip.id);
        else next.delete(clip.id);
        return next;
      });
    }
  };

  const openComments = async (clip: Clip) => {
    setSelectedClip(clip);
    setCommentOpen(true);
    setLoadingComments(true);
    setComments([]);
    setLikedComments(new Set());
    
    try {
      const res = await fetch(`/api/kasshi/clips/${clip.id}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
      
      // Fetch liked comments for this user
      if (walletAddress || user?.id) {
        const params = new URLSearchParams();
        if (walletAddress) params.set("walletAddress", walletAddress);
        if (user?.id) params.set("userId", user.id);
        
        const likedRes = await fetch(`/api/kasshi/clips/comments/liked?${params}`);
        const likedData = await likedRes.json();
        if (likedData.likedCommentIds) {
          setLikedComments(new Set(likedData.likedCommentIds));
        }
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!selectedClip || !commentText.trim()) return;
    if (!walletAddress && !user?.id) {
      navigate("/settings");
      return;
    }

    if (!platformWallet) {
      console.error("Platform wallet not loaded");
      return;
    }

    setSubmittingComment(true);
    try {
      // Pay first
      const payResult = await pay(platformWallet, COMMENT_COST_KAS, {
        videoId: selectedClip.id.toString(),
        paymentType: "clip_comment",
      });
      
      if (!payResult.success) {
        console.error("Payment failed:", payResult.error);
        setSubmittingComment(false);
        return;
      }

      const res = await fetch(`/api/kasshi/clips/${selectedClip.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          walletAddress, 
          userId: user?.id,
          content: commentText.trim(),
          parentId: replyingTo?.id || null
        })
      });
      const data = await res.json();
      
      if (res.ok && data.comment) {
        if (replyingTo) {
          // Add reply to parent comment
          setComments(prev => prev.map(c => 
            c.id === replyingTo.id 
              ? { ...c, replies: [...(c.replies || []), data.comment] }
              : c
          ));
          setReplyingTo(null);
        } else {
          setComments(prev => [data.comment, ...prev]);
        }
        setCommentText("");
        // Update comment count
        setClips(prev => prev.map(c => 
          c.id === selectedClip.id ? { ...c, commentCount: data.commentCount } : c
        ));
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleLikeComment = async (comment: ClipComment) => {
    if (!walletAddress && !user?.id) {
      navigate("/settings");
      return;
    }
    
    const isLiked = likedComments.has(comment.id);
    
    // Optimistic update
    setLikedComments(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(comment.id);
      else next.add(comment.id);
      return next;
    });
    
    setComments(prev => prev.map(c => {
      if (c.id === comment.id) {
        return { ...c, likeCount: c.likeCount + (isLiked ? -1 : 1) };
      }
      if (c.replies) {
        return {
          ...c,
          replies: c.replies.map(r => 
            r.id === comment.id 
              ? { ...r, likeCount: r.likeCount + (isLiked ? -1 : 1) }
              : r
          )
        };
      }
      return c;
    }));
    
    try {
      await fetch(`/api/kasshi/clips/comments/${comment.id}/like`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, userId: user?.id })
      });
    } catch (e) {
      // Revert on error
      setLikedComments(prev => {
        const next = new Set(prev);
        if (isLiked) next.add(comment.id);
        else next.delete(comment.id);
        return next;
      });
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Preload HLS for upcoming clips (without attaching to video element)
  const preloadClip = useCallback((clip: Clip, index: number) => {
    // Skip if already preloaded or already has active HLS
    if (preloadedHlsRefs.current.has(index) || hlsRefs.current.has(index)) return;
    
    const url = clip.videoUrl;
    
    if (!url || !url.includes('.m3u8') || !Hls.isSupported()) return;
    
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startLevel: -1,
      autoStartLoad: true,
      capLevelToPlayerSize: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });
    
    hls.loadSource(url);
    
    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // Force highest quality level for preload too
      const highestLevel = data.levels.length - 1;
      hls.currentLevel = highestLevel;
      hls.loadLevel = highestLevel;
      hls.nextLevel = highestLevel;
    });
    
    preloadedHlsRefs.current.set(index, hls);
  }, []);

  // Preload next clips when current index changes
  useEffect(() => {
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < clips.length) {
        preloadClip(clips[nextIndex], nextIndex);
      }
    }
  }, [currentIndex, clips, preloadClip]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      hlsRefs.current.forEach(hls => hls.destroy());
      preloadedHlsRefs.current.forEach(hls => hls.destroy());
    };
  }, []);

  if (clips.length === 0 && !loading) {
    return (
      <div className="h-screen w-full flex flex-col relative overflow-hidden">
        <ClipsBackground />
        
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent backdrop-blur-sm border-b border-white/5">
          <LocalizedLink to="/video" className="flex items-center gap-2 text-white hover:text-orange-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Videos</span>
          </LocalizedLink>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-lg bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">Clips</span>
          </div>
          <div className="flex items-center gap-3">
            <LocalizedLink to="/video" className="p-2 rounded-full bg-white/10 hover:bg-orange-500/20 hover:text-orange-400 transition-all border border-white/10">
              <Video className="w-5 h-5 text-white" />
            </LocalizedLink>
            <LocalizedLink to="/music" className="p-2 rounded-full bg-white/10 hover:bg-orange-500/20 hover:text-orange-400 transition-all border border-white/10">
              <Music className="w-5 h-5 text-white" />
            </LocalizedLink>
          </div>
        </div>
        
        {/* Empty state */}
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="relative mb-6">
              <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center border border-orange-500/30 shadow-2xl shadow-orange-500/20">
                <Flame className="w-12 h-12 text-orange-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-orange-100 to-white bg-clip-text text-transparent mb-2">No clips yet</h2>
            <p className="text-white/60 mb-8 max-w-sm mx-auto">Be the first to upload a clip and start the party!</p>
            <LocalizedLink 
              to="/video" 
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-semibold rounded-full transition-all shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105"
            >
              <Video className="w-5 h-5" />
              Browse Videos
            </LocalizedLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col relative overflow-hidden">
      <ClipsBackground />
      
      {/* Fixed Header - no blur */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/90 to-transparent absolute top-0 left-0 right-0 z-20">
        <LocalizedLink to="/video" className="flex items-center gap-2 text-white hover:text-orange-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium hidden sm:inline">Back</span>
        </LocalizedLink>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30 animate-pulse" style={{ animationDuration: '2s' }}>
            <Flame className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">Clips</span>
        </div>
        <div className="flex items-center gap-3">
          <LocalizedLink to="/video" className="p-2 rounded-full bg-white/10 hover:bg-orange-500/20 transition-all border border-white/10">
            <Video className="w-5 h-5 text-white" />
          </LocalizedLink>
          <LocalizedLink to="/music" className="p-2 rounded-full bg-white/10 hover:bg-orange-500/20 transition-all border border-white/10">
            <Music className="w-5 h-5 text-white" />
          </LocalizedLink>
        </div>
      </div>

      {/* Scrollable clips container */}
      <div 
        ref={containerRef}
        className="flex-1 snap-y snap-mandatory overflow-y-scroll relative z-10"
      >
      {clips.map((clip, index) => (
        <div 
          key={`clip-container-${clip.id}`} 
          className="relative h-screen w-full snap-start overflow-hidden flex items-center justify-center"
        >
          {/* 9:16 Video Container - TikTok/Reels style */}
          <div className="relative h-[calc(100vh-2rem)] max-w-[calc((100vh-2rem)*9/16)] w-full mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10">
            {/* Video fills the container */}
            <video
              ref={(el) => {
                if (el) {
                  videoRefs.current.set(clip.id, el);
                  // Set volume
                  el.volume = volume;
                  el.muted = isMuted;
                  // Initialize HLS.js for this video (only once per clip)
                  if (!hlsRefs.current.has(clip.id) && clip.videoUrl) {
                    const hlsUrl = clip.videoUrl;
                    if (Hls.isSupported()) {
                      const hls = new Hls({
                        enableWorker: true,
                        lowLatencyMode: false,
                        maxBufferLength: 30,
                        maxMaxBufferLength: 60,
                      });
                      hls.loadSource(hlsUrl);
                      hls.attachMedia(el);
                      hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        // Force highest quality
                        if (hls.levels && hls.levels.length > 0) {
                          hls.currentLevel = hls.levels.length - 1;
                        }
                        // Auto-play will be handled by the currentIndex useEffect
                      });
                      hls.on(Hls.Events.ERROR, (_, data) => {
                        if (data.fatal) {
                          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            hls.startLoad();
                          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            hls.recoverMediaError();
                          }
                        }
                      });
                      hlsRefs.current.set(clip.id, hls);
                    } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
                      // Safari native HLS - playback handled by currentIndex useEffect
                      el.src = hlsUrl;
                    }
                  }
                }
              }}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                transform: `scale(${clip.cropZoom || 1}) translate(${clip.cropX || 0}%, ${clip.cropY || 0}%)`,
                transformOrigin: 'center center',
              }}
              poster={clip.thumbnailUrl || undefined}
              playsInline
              loop
              muted={isMuted}
              onPlay={() => {
                if (index === currentIndex) {
                  setIsPlaying(true);
                }
              }}
              onPause={() => {
                if (index === currentIndex) {
                  setIsPlaying(false);
                }
              }}
              onClick={() => {
                // Directly control the video element
                const video = videoRefs.current.get(clip.id);
                if (video) {
                  if (video.paused) {
                    userPausedRef.current = false; // User wants to play
                    video.play().then(() => {
                      setIsPlaying(true);
                    }).catch(() => {});
                  } else {
                    userPausedRef.current = true; // User manually paused
                    video.pause();
                    setIsPlaying(false);
                  }
                }
              }}
              data-clip-id={clip.id}
            />

            {/* Gradient overlay for UI readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90 pointer-events-none" />

            {/* Play/Pause Overlay */}
            {!isPlaying && index === currentIndex && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <Play className="w-10 h-10 text-white ml-1" />
                </div>
              </div>
            )}

            {/* Right side controls - inside the video container */}
            <div className="absolute right-4 bottom-32 flex flex-col items-center gap-5 z-20">
            {/* Like button */}
            <button 
              onClick={() => handleLike(clip)}
              className="flex flex-col items-center gap-1"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                likedClips.has(clip.id) 
                  ? "bg-red-500 scale-110" 
                  : "bg-white/10 hover:bg-white/20"
              }`}>
                <Heart className={`w-6 h-6 ${likedClips.has(clip.id) ? "text-white fill-white" : "text-white"}`} />
              </div>
              <span className="text-xs text-white font-medium">{formatCount(clip.likeCount)}</span>
            </button>

            {/* Comment button */}
            <button 
              onClick={() => openComments(clip)}
              className="flex flex-col items-center gap-1"
            >
              <div className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs text-white font-medium">{formatCount(clip.commentCount)}</span>
            </button>

            {/* Share button - copies link */}
            <button 
              className="flex flex-col items-center gap-1"
              onClick={() => handleShare(clip)}
            >
              <div className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                {copiedId === clip.id ? (
                  <Check className="w-6 h-6 text-green-400" />
                ) : (
                  <Share2 className="w-6 h-6 text-white" />
                )}
              </div>
              <span className="text-xs text-white">{copiedId === clip.id ? "Copied!" : "Share"}</span>
            </button>

            {/* Super React Button */}
            <button
              onClick={() => {
                setSelectedClip(clip);
                setSuperReactOpen(true);
              }}
              className="group relative flex flex-col items-center gap-1"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 flex items-center justify-center shadow-lg shadow-orange-500/40 transition-all hover:scale-110">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500 to-red-500 animate-ping opacity-30" />
                <Flame className="w-6 h-6 text-white relative z-10" />
              </div>

            </button>

            {/* Volume control with slider */}
            <div 
              className="relative flex flex-col items-center gap-1"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              {/* Volume slider popup - positioned to the left with hover bridge */}
              {showVolumeSlider && (
                <div className="absolute right-full top-1/2 -translate-y-1/2 pr-3 flex items-center">
                  <div className="bg-black/80 backdrop-blur-sm rounded-lg p-3 border border-white/20 shadow-xl flex items-center gap-2">
                    <span className="text-xs text-white/60 w-8">
                      {Math.round((isMuted ? 0 : volume) * 100)}%
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-20 h-2 rounded-full appearance-none bg-white/30 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
                      style={{
                        background: `linear-gradient(to right, rgb(249 115 22) 0%, rgb(249 115 22) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) 100%)`
                      }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-6 h-6 text-white" />
                ) : (
                  <Volume2 className="w-6 h-6 text-white" />
                )}
              </button>
              <span className="text-xs text-white">{isMuted ? "Unmute" : `${Math.round(volume * 100)}%`}</span>
            </div>
          </div>

          {/* Bottom Overlay UI */}
          <div className="absolute bottom-4 left-0 right-0 px-4 z-10">
            <div className="flex items-end justify-between mb-3">
              <div 
                className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/video/channel/${clip.channel.handle}`);
                }}
              >
                  {clip.channel.avatarUrl ? (
                    <img 
                      src={clip.channel.avatarUrl} 
                      alt={clip.channel.name}
                      className="w-12 h-12 rounded-full border-2 border-orange-500/50 shadow-lg shadow-orange-500/20"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                      <span className="text-white font-bold">
                        {clip.channel.name?.charAt(0) || "?"}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-white font-bold text-lg drop-shadow-lg hover:underline">
                      {clip.title}
                    </p>
                    <p className="text-white/80 text-sm hover:underline">
                      @{clip.channel.handle}
                    </p>
                  </div>
                </div>

                {/* View count badge */}
                {clip.viewCount > 0 && (
                  <div className="px-3 py-1 rounded-full bg-black/60 text-white text-xs font-bold shadow-lg border border-white/20 flex-shrink-0">
                    {clip.viewCount.toLocaleString()} views
                  </div>
                )}
            </div>

            {/* Super Reacts preview */}
            <TopSuperReacts trackId={clip.id} />
          </div>
          </div>
        </div>
      ))}

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {loading && (
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        )}
      </div>

      {/* Super React Modal */}
      {selectedClip && (
        <SuperReactModal
          clipId={selectedClip.id}
          clipTitle={selectedClip.title}
          artistAddress={selectedClip.channel.walletAddress || ""}
          isOpen={superReactOpen}
          onClose={() => setSuperReactOpen(false)}
          onSuccess={async () => {
            // Refresh comments to show the new Super React
            try {
              const res = await fetch(`/api/kasshi/clips/${selectedClip.id}/comments`);
              const data = await res.json();
              setComments(data.comments || []);
            } catch (err) {
              console.error("Failed to refresh comments:", err);
            }
            // Update comment count
            setClips(prev => prev.map(c => 
              c.id === selectedClip.id ? { ...c, commentCount: (c.commentCount || 0) + 1 } : c
            ));
          }}
        />
      )}

      {/* Comment Panel */}
      {commentOpen && selectedClip && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCommentOpen(false)}
          />
          
          {/* Comment Panel */}
          <div className="relative w-full max-w-lg bg-slate-900 rounded-t-3xl max-h-[70vh] flex flex-col border-t border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">
                Comments ({selectedClip.commentCount})
              </h3>
              <button 
                onClick={() => setCommentOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            
            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingComments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-white/20 mx-auto mb-2" />
                  <p className="text-white/60">No comments yet. Be the first!</p>
                </div>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className={`space-y-3 ${comment.isSuperReact ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/10 rounded-lg p-3 border border-amber-500/30' : ''}`}>
                    {/* Super React badge */}
                    {comment.isSuperReact && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full">
                          <Flame className="w-3 h-3 text-white" />
                          <span className="text-white text-xs font-bold">{comment.superReactAmount} KAS</span>
                        </div>
                        <span className="text-amber-400 text-xs font-semibold">Super React</span>
                      </div>
                    )}
                    {/* Main comment */}
                    <div className="flex gap-3">
                      {comment.channel.avatarUrl ? (
                        comment.isAnonymous ? (
                          <img 
                            src={comment.channel.avatarUrl} 
                            alt={comment.channel.name}
                            className={`w-8 h-8 rounded-full flex-shrink-0 ${comment.isSuperReact ? 'ring-2 ring-amber-400' : ''}`}
                          />
                        ) : (
                          <img 
                            src={comment.channel.avatarUrl} 
                            alt={comment.channel.name}
                            onClick={() => navigate(`/video/channel/${comment.channel.handle}`)}
                            className={`w-8 h-8 rounded-full flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all ${comment.isSuperReact ? 'ring-2 ring-amber-400' : ''}`}
                          />
                        )
                      ) : (
                        comment.isAnonymous ? (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${comment.isSuperReact ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-orange-500 to-red-500'}`}>
                            <span className="text-white text-xs font-bold">
                              {comment.channel.name?.charAt(0) || "?"}
                            </span>
                          </div>
                        ) : (
                          <div 
                            onClick={() => navigate(`/video/channel/${comment.channel.handle}`)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all ${comment.isSuperReact ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-orange-500 to-red-500'}`}
                          >
                            <span className="text-white text-xs font-bold">
                              {comment.channel.name?.charAt(0) || "?"}
                            </span>
                          </div>
                        )
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {comment.isAnonymous ? (
                            <span className={`font-medium text-sm ${comment.isSuperReact ? 'text-amber-300' : 'text-white'}`}>
                              {comment.channel.name}
                            </span>
                          ) : (
                            <span 
                              onClick={() => navigate(`/video/channel/${comment.channel.handle}`)}
                              className={`font-medium text-sm cursor-pointer hover:underline ${comment.isSuperReact ? 'text-amber-300' : 'text-white'}`}
                            >
                              {comment.channel.name}
                            </span>
                          )}
                          <span className="text-white/40 text-xs">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {comment.content && (
                          <p className={`text-sm break-words mb-2 ${comment.isSuperReact ? 'text-white' : 'text-white/80'}`}>
                            {comment.content}
                          </p>
                        )}
                        {/* Like and Reply buttons - hide for Super Reacts */}
                        {!comment.isSuperReact && (
                          <div className="flex items-center gap-4">
                            <button 
                              onClick={() => handleLikeComment(comment)}
                              className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
                            >
                              <ThumbsUp className={`w-3.5 h-3.5 ${likedComments.has(comment.id) ? 'text-orange-500 fill-orange-500' : ''}`} />
                              <span>{comment.likeCount || 0}</span>
                            </button>
                            <button 
                              onClick={() => setReplyingTo(comment)}
                              className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
                            >
                              <Reply className="w-3.5 h-3.5" />
                              <span>Reply</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="ml-11 space-y-3 border-l-2 border-white/10 pl-4">
                        {comment.replies.map(reply => (
                          <div key={reply.id} className="flex gap-3">
                            {reply.channel.avatarUrl ? (
                              <img 
                                src={reply.channel.avatarUrl} 
                                alt={reply.channel.name}
                                onClick={() => navigate(`/video/channel/${reply.channel.handle}`)}
                                className="w-6 h-6 rounded-full flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all"
                              />
                            ) : (
                              <div 
                                onClick={() => navigate(`/video/channel/${reply.channel.handle}`)}
                                className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-orange-500 transition-all"
                              >
                                <span className="text-white text-[10px] font-bold">
                                  {reply.channel.name?.charAt(0) || "?"}
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span 
                                  onClick={() => navigate(`/video/channel/${reply.channel.handle}`)}
                                  className="text-white font-medium text-xs cursor-pointer hover:underline"
                                >
                                  {reply.channel.name}
                                </span>
                                <span className="text-white/40 text-[10px]">
                                  {new Date(reply.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-white/80 text-xs break-words mb-1">
                                {reply.content}
                              </p>
                              <button 
                                onClick={() => handleLikeComment(reply)}
                                className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors"
                              >
                                <ThumbsUp className={`w-3 h-3 ${likedComments.has(reply.id) ? 'text-orange-500 fill-orange-500' : ''}`} />
                                <span>{reply.likeCount || 0}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            
            {/* Comment input */}
            <div className="p-4 border-t border-white/10 bg-slate-900/90">
              {/* Reply indicator */}
              {replyingTo && (
                <div className="flex items-center justify-between mb-2 px-2 py-1.5 bg-white/5 rounded-lg">
                  <span className="text-xs text-white/60">
                    Replying to <span className="text-orange-400 font-medium">@{replyingTo.channel.handle}</span>
                  </span>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-white/60" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={!walletAddress && !user?.id ? "Sign in to comment" : replyingTo ? `Reply to @${replyingTo.channel.handle}...` : "Add a comment..."}
                  disabled={!walletAddress && !user?.id}
                  className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2 text-white placeholder:text-white/40 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || submittingComment || (!walletAddress && !user?.id)}
                  className="p-3 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-400 hover:to-red-400 transition-all"
                >
                  {submittingComment ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
