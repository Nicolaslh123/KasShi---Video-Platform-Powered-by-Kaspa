import { useState, useEffect, useCallback } from "react";

// Helper to convert snake_case API responses to camelCase
function mapChannelFromApi(data: Record<string, unknown>): Channel {
  return {
    id: data.id as number,
    walletAddress: data.wallet_address as string,
    name: data.name as string,
    handle: data.handle as string,
    description: data.description as string | null,
    about: data.about as string | null,
    avatarUrl: data.avatar_url as string | null,
    bannerUrl: data.banner_url as string | null,
    subscriberCount: data.subscriber_count as number,
    totalKasEarned: data.total_kas_earned as string,
    isVerified: Boolean(data.is_verified),
    videoCount: data.videoCount as number | undefined,
    createdAt: data.created_at as string,
  };
}

function mapVideoFromApi(data: Record<string, unknown>): Video {
  const channelData = data.channel as Record<string, unknown>;
  return {
    id: data.id as number,
    publicId: (data.publicId ?? data.public_id ?? '') as string,
    title: data.title as string,
    description: (data.description ?? data.description) as string | null,
    videoUrl: (data.videoUrl ?? data.video_url) as string | null,
    thumbnailUrl: (data.thumbnailUrl ?? data.thumbnail_url) as string | null,
    durationSeconds: (data.durationSeconds ?? data.duration_seconds) as number,
    viewCount: (data.viewCount ?? data.view_count) as number,
    likeCount: (data.likeCount ?? data.like_count) as number,
    dislikeCount: (data.dislikeCount ?? data.dislike_count) as number,
    commentCount: (data.commentCount ?? data.comment_count) as number,
    kasEarned: (data.kasEarned ?? data.kas_earned) as string,
    status: data.status as string,
    isMembersOnly: Boolean(data.isMembersOnly ?? data.is_members_only),
    hasWatched: Boolean(data.hasWatched ?? data.has_watched),
    createdAt: (data.createdAt ?? data.created_at) as string,
    channel: {
      id: channelData.id as number,
      name: channelData.name as string,
      handle: channelData.handle as string,
      avatarUrl: (channelData.avatarUrl ?? channelData.avatar_url) as string | null,
      isVerified: Boolean(channelData.isVerified ?? channelData.is_verified),
      subscriberCount: (channelData.subscriberCount ?? channelData.subscriber_count) as number | undefined,
      walletAddress: (channelData.walletAddress ?? channelData.wallet_address) as string | undefined,
    },
  };
}

// Types matching API responses
export interface Channel {
  id: number;
  walletAddress: string;
  name: string;
  handle: string;
  description: string | null;
  about: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number;
  totalKasEarned: string;
  isVerified: boolean;
  videoCount?: number;
  createdAt: string;
}

export interface Video {
  id: number;
  publicId: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  kasEarned: string;
  status: string;
  isMembersOnly: boolean;
  hasWatched?: boolean;
  createdAt: string;
  channel: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
    isVerified: boolean;
    subscriberCount?: number;
    walletAddress?: string;
  };
}

export interface Comment {
  id: number;
  content: string;
  likeCount: number;
  dislikeCount: number;
  kasEarned: string;
  parentId: number | null;
  createdAt: string;
  author: {
    id: number;
    name: string;
    handle: string;
    avatarUrl: string | null;
    walletAddress?: string;
  };
  replies: Comment[];
}

export interface PlatformStats {
  totalKasEarned: number;
  activeCreators: number;
  totalVideos: number;
  viewsToday: number;
}

export interface MembershipTier {
  id: number;
  channelId: number;
  name: string;
  priceKas: string;
  description: string | null;
  benefits: string[];
  durationDays: number;
  memberCount?: number;
  createdAt: string;
}

export interface ChannelMembership {
  id: number;
  memberChannelId: number;
  channelId: number;
  tierId: number;
  tierName: string;
  tierPrice?: string;
  expiresAt: string;
  isActive: boolean;
  totalPaidKas: string;
}

// Fetch platform stats
export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/kasshi/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { stats, loading };
}

// Fetch video feed
export function useVideoFeed(limit = 20, offset = 0) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch(`/api/kasshi/videos?limit=${limit}&offset=${offset}`)
      .then((res) => res.json())
      .then((data) => {
        const mappedVideos = (data.videos || []).map(mapVideoFromApi);
        setVideos(mappedVideos);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [limit, offset]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { videos, loading, refetch };
}

// Feed types
export type FeedType = "for-you" | "following" | "members" | "history";

// Extended Video type with hasWatched indicator and history metadata
export interface FeedVideo extends Video {
  hasWatched?: boolean;
  lastWatchedAt?: string;
  progressSeconds?: number;
  completed?: boolean;
}

// Fetch personalized feed (For You, Following, or Members)
// mode: "mainnet" hides demo content, "demo" shows everything
export function useFeed(feedType: FeedType, channelId?: number | null, limit = 20, offset = 0, mode: "mainnet" | "demo" = "mainnet", userId?: string | null) {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    const channelParam = channelId ? `&channelId=${channelId}` : "";
    const modeParam = `&mode=${mode}`;
    const userIdParam = userId ? `&userId=${userId}` : "";
    fetch(`/api/kasshi/feed/${feedType}?limit=${limit}&offset=${offset}${channelParam}${modeParam}${userIdParam}`)
      .then((res) => res.json())
      .then((data) => {
        const mappedVideos = (data.videos || []).map((v: Record<string, unknown>) => ({
          ...mapVideoFromApi(v),
          hasWatched: v.hasWatched as boolean | undefined,
          lastWatchedAt: v.lastWatchedAt as string | undefined,
          progressSeconds: v.progressSeconds as number | undefined,
          completed: v.completed as boolean | undefined,
        }));
        setVideos(mappedVideos);
        setMessage(data.message || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [feedType, channelId, limit, offset, mode, userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { videos, loading, message, refetch };
}

// Fetch single video
export function useVideo(videoId: string | undefined) {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!videoId) return;
    fetch(`/api/kasshi/videos/${videoId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setVideo(null);
        } else {
          setVideo(mapVideoFromApi(data));
        }
      })
      .catch(() => {});
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    setVideo(null); // Reset video when videoId changes
    fetch(`/api/kasshi/videos/${videoId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setVideo(null);
        } else {
          setVideo(mapVideoFromApi(data));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  return { video, loading, refetch };
}

// Fetch channel by handle
export function useChannel(handle: string | undefined) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChannel = useCallback(() => {
    if (!handle) return;
    setLoading(true);
    fetch(`/api/kasshi/channels/${handle}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setChannel(null);
        } else {
          setChannel(mapChannelFromApi(data));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle]);

  useEffect(() => {
    fetchChannel();
  }, [fetchChannel]);

  return { channel, loading, refetch: fetchChannel };
}

// Fetch channel videos
export function useChannelVideos(handle: string | undefined) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    fetch(`/api/kasshi/channels/${handle}/videos`)
      .then((res) => res.json())
      .then((data) => {
        const mappedVideos = (data.videos || []).map(mapVideoFromApi);
        setVideos(mappedVideos);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle]);

  return { videos, loading };
}

// Fetch ALL videos for channel owner (including private)
export function useMyVideos(handle: string | undefined, isOwner: boolean, authToken?: string) {
  const [videos, setVideos] = useState<(Video & { isPrivate?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!handle || !isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers: HeadersInit = {};
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    fetch(`/api/kasshi/channels/${handle}/my-videos`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          const mappedVideos = data.videos.map((v: Record<string, unknown>) => ({
            ...mapVideoFromApi(v),
            isPrivate: Boolean(v.is_private),
          }));
          setVideos(mappedVideos);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle, isOwner, authToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { videos, loading, refetch };
}

// Fetch video comments
export function useVideoComments(videoId: string | undefined) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!videoId) return;
    setLoading(true);
    fetch(`/api/kasshi/videos/${videoId}/comments`)
      .then((res) => res.json())
      .then((data) => {
        setComments(data.comments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { comments, loading, refetch };
}

// Get user's interaction with a video
export function useVideoInteraction(videoId: string | undefined, channelId: number | undefined) {
  const [interaction, setInteraction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!videoId || !channelId) {
      setLoading(false);
      return;
    }
    fetch(`/api/kasshi/videos/${videoId}/interaction?channelId=${channelId}`)
      .then((res) => res.json())
      .then((data) => {
        setInteraction(data.interaction);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [videoId, channelId]);

  return { interaction, loading };
}

// Helper functions
export function formatViews(views: number | undefined | null): string {
  if (views === undefined || views === null) return "0";
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views.toString();
}

export function formatKas(kas: string | number | undefined | null): string {
  if (kas === undefined || kas === null) return "0";
  const num = typeof kas === "string" ? parseFloat(kas) : kas;
  if (isNaN(num)) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(num < 10 ? 2 : 0);
}

// Fetch channel membership tiers
export function useChannelTiers(handle: string | undefined) {
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!handle) return;
    setLoading(true);
    fetch(`/api/kasshi/channels/${handle}/tiers`)
      .then((res) => res.json())
      .then((data) => {
        const mappedTiers = (data.tiers || []).map((t: Record<string, unknown>) => ({
          id: t.id as number,
          channelId: t.channelId as number,
          name: t.name as string,
          priceKas: t.priceKas as string,
          description: t.description as string | null,
          benefits: Array.isArray(t.benefits) ? t.benefits : [],
          durationDays: t.durationDays as number,
          memberCount: t.memberCount as number | undefined,
          createdAt: t.createdAt as string,
        }));
        setTiers(mappedTiers);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tiers, loading, refetch };
}

// Check user's membership status for a channel
export function useMembershipStatus(handle: string | undefined, memberChannelId: number | null) {
  const [membership, setMembership] = useState<ChannelMembership | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!handle || !memberChannelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/kasshi/channels/${handle}/membership?channelId=${memberChannelId}`)
      .then((res) => res.json())
      .then((data) => {
        // Backend returns { isMember: true, tier, tierPrice, tierId, expiresAt, totalPaid }
        if (data.isMember) {
          setMembership({
            id: 0, // Not returned by this endpoint
            memberChannelId: memberChannelId,
            channelId: 0, // Not returned by this endpoint
            tierId: data.tierId,
            tierName: data.tier,
            tierPrice: data.tierPrice,
            expiresAt: data.expiresAt,
            isActive: true,
            totalPaidKas: data.totalPaid,
          });
        } else {
          setMembership(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [handle, memberChannelId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { membership, loading, refetch };
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "recently";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "recently";
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return "recently"; // Future dates
  
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (seconds < 3600) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(seconds / 3600);
  if (seconds < 86400) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(seconds / 86400);
  if (seconds < 604800) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const weeks = Math.floor(seconds / 604800);
  if (seconds < 2592000) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  const months = Math.floor(seconds / 2592000);
  if (seconds < 31536000) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(seconds / 31536000);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

// Default placeholder images
export const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";
export const DEFAULT_THUMBNAIL = "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=640&h=360&fit=crop";
