import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { AudioTrack } from '../components/AudioPlayer';

// API response types
interface ArtistInfo {
  name: string;
  handle: string;
  avatarUrl?: string;
  id?: number;
}

export interface ApiAlbum {
  id: number;
  title: string;
  slug?: string;
  description?: string;
  coverArtUrl?: string;
  genre?: string;
  releaseDate?: string;
  priceKas: string;
  playCount: number;
  trackCount?: number;
  artist: ArtistInfo;
  tracks?: ApiTrack[];
  createdAt: string;
}

export interface ApiTrack {
  id: number;
  title: string;
  description?: string;
  audioUrl?: string;
  coverArtUrl?: string;
  durationSeconds?: number;
  trackNumber?: number;
  genre?: string;
  lyrics?: string;
  priceKas: string;
  playCount: number;
  isExplicit: boolean;
  artist: string;
  artistId?: number;
  artistHandle?: string;
  albumId?: number;
  albumTitle?: string;
  creatorWallet?: string;
  chapters?: { id: number; title: string; startTimeSeconds: number }[];
  createdAt: string;
  averageRating?: number;
  reviewCount?: number;
}

export interface ApiPodcast {
  id: number;
  title: string;
  description?: string;
  coverArtUrl?: string;
  category?: string;
  isVideoPodcast: boolean;
  isExplicit: boolean;
  followerCount: number;
  episodeCount?: number;
  host: ArtistInfo;
  episodes?: ApiEpisode[];
  createdAt: string;
}

export interface ApiEpisode {
  id: number;
  title: string;
  description?: string;
  audioUrl?: string;
  videoUrl?: string;
  coverArtUrl?: string;
  durationSeconds?: number;
  episodeNumber: number;
  seasonNumber: number;
  isExplicit: boolean;
  priceKas: string;
  playCount: number;
  hasVideo: boolean;
  chapters?: { id: number; title: string; startTimeSeconds: number }[];
  creatorWallet?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface ApiPlaylist {
  id: number;
  title: string;
  slug?: string;
  description?: string;
  coverArtUrl?: string;
  isPublic: boolean;
  trackCount: number;
  playCount: number;
  creatorName: string;
  creatorHandle?: string;
  creatorWalletAddress?: string;
  createdAt: string;
  tracks?: ApiPlaylistTrack[];
}

export interface ApiPlaylistTrack {
  id: number;
  title: string;
  artist: string;
  artistId?: number;
  audioUrl?: string;
  coverArtUrl?: string;
  durationSeconds: number;
  albumId?: number;
  albumTitle?: string;
  trackOrder: number;
  priceKas?: string;
  creatorWallet?: string;
  averageRating?: number;
  reviewCount?: number;
}

// Convert API track to AudioTrack format for the player
export function apiTrackToAudioTrack(track: ApiTrack, albumTitle?: string, creatorWallet?: string): AudioTrack {
  const audioUrl = track.audioUrl || '';
  return {
    id: track.id,
    title: track.title,
    artist: track.artist || 'Unknown Artist',
    artistId: track.artistId,
    artistHandle: track.artistHandle,
    durationSeconds: track.durationSeconds || 0,
    audioUrl: audioUrl,
    coverArtUrl: track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    albumId: track.albumId,
    albumTitle: albumTitle || track.albumTitle,
    chapters: track.chapters,
    priceKas: track.priceKas,
    creatorWallet: creatorWallet || track.creatorWallet,
    contentType: 'track',
    averageRating: track.averageRating,
    reviewCount: track.reviewCount,
  };
}

// Convert API podcast episode to AudioTrack format for the player
export function apiEpisodeToAudioTrack(episode: ApiEpisode, podcast?: { title: string; host: { name: string; walletAddress?: string }; coverArtUrl?: string }): AudioTrack {
  return {
    id: episode.id,
    title: episode.title,
    artist: podcast?.host?.name || 'Unknown Host',
    durationSeconds: episode.durationSeconds || 0,
    audioUrl: episode.audioUrl || episode.videoUrl || '',
    coverArtUrl: episode.coverArtUrl || podcast?.coverArtUrl || 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80',
    albumTitle: podcast?.title,
    chapters: episode.chapters,
    priceKas: episode.priceKas,
    creatorWallet: episode.creatorWallet || podcast?.host?.walletAddress,
    contentType: 'episode',
  };
}

// Fetch featured content for Music home page
export function useFeaturedMusic() {
  const [albums, setAlbums] = useState<ApiAlbum[]>([]);
  const [podcasts, setPodcasts] = useState<ApiPodcast[]>([]);
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const response = await fetch('/api/music/featured');
        if (!response.ok) throw new Error('Failed to fetch featured content');
        const data = await response.json();
        setAlbums(data.albums || []);
        setPodcasts(data.podcasts || []);
        setTracks(data.tracks || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchFeatured();
  }, []);

  return { albums, podcasts, tracks, loading, error };
}

// Fetch album by ID
export function useAlbum(albumId: number | string | undefined) {
  const [album, setAlbum] = useState<ApiAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!albumId) {
      setLoading(false);
      return;
    }

    const fetchAlbum = async () => {
      try {
        const response = await fetch(`/api/music/albums/${albumId}`);
        if (!response.ok) throw new Error('Album not found');
        const data = await response.json();
        setAlbum(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchAlbum();
  }, [albumId]);

  return { album, loading, error };
}

// Fetch podcast by ID
export function usePodcast(podcastId: number | string | undefined) {
  const [podcast, setPodcast] = useState<ApiPodcast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!podcastId) {
      setLoading(false);
      return;
    }

    const fetchPodcast = async () => {
      try {
        const response = await fetch(`/api/music/podcasts/${podcastId}`);
        if (!response.ok) throw new Error('Podcast not found');
        const data = await response.json();
        setPodcast(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchPodcast();
  }, [podcastId]);

  return { podcast, loading, error };
}

// Music actions (like, subscribe, play)
export function useMusicActions() {
  const { externalWallet } = useWallet();
  const [likedTracks, setLikedTracks] = useState<Set<number>>(new Set());
  const [subscribedPodcasts, setSubscribedPodcasts] = useState<Set<number>>(new Set());

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (externalWallet?.authToken) {
      return { Authorization: `Bearer ${externalWallet.authToken}` };
    }
    return {};
  }, [externalWallet?.authToken]);

  const fetchUserStatus = useCallback(async (trackIds: number[], podcastIds: number[]) => {
    if (!trackIds.length && !podcastIds.length) return;
    
    try {
      const params = new URLSearchParams();
      if (trackIds.length) params.set('trackIds', trackIds.join(','));
      if (podcastIds.length) params.set('podcastIds', podcastIds.join(','));
      
      const response = await fetch(`/api/music/user-status?${params}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setLikedTracks(new Set(data.likedTracks || []));
        setSubscribedPodcasts(new Set(data.subscribedPodcasts || []));
      }
    } catch (err) {
      console.error('Failed to fetch user status:', err);
    }
  }, [getAuthHeader]);

  const toggleLike = useCallback(async (trackId: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/music/tracks/${trackId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to toggle like');
      }
      const data = await response.json();
      setLikedTracks(prev => {
        const next = new Set(prev);
        if (data.liked) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
      return data.liked;
    } catch (err) {
      console.error('Failed to toggle like:', err);
      throw err; // Re-throw so callers can handle the error
    }
  }, [getAuthHeader]);

  const toggleSubscribe = useCallback(async (podcastId: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/music/podcasts/${podcastId}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSubscribedPodcasts(prev => {
          const next = new Set(prev);
          if (data.subscribed) next.add(podcastId);
          else next.delete(podcastId);
          return next;
        });
        return data.subscribed;
      }
    } catch (err) {
      console.error('Failed to toggle subscription:', err);
    }
    return false;
  }, [getAuthHeader]);

  const recordTrackPlay = useCallback(async (trackId: number, durationPlayed?: number, completed?: boolean) => {
    try {
      await fetch(`/api/music/tracks/${trackId}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({ durationPlayed, completed }),
      });
    } catch (err) {
      console.error('Failed to record track play:', err);
    }
  }, [getAuthHeader]);

  const recordEpisodePlay = useCallback(async (episodeId: number, durationPlayed?: number, progressSeconds?: number, completed?: boolean) => {
    try {
      await fetch(`/api/music/episodes/${episodeId}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({ durationPlayed, progressSeconds, completed }),
      });
    } catch (err) {
      console.error('Failed to record episode play:', err);
    }
  }, [getAuthHeader]);

  const isTrackLiked = useCallback((trackId: number) => likedTracks.has(trackId), [likedTracks]);
  const isPodcastSubscribed = useCallback((podcastId: number) => subscribedPodcasts.has(podcastId), [subscribedPodcasts]);

  return {
    toggleLike,
    toggleSubscribe,
    recordTrackPlay,
    recordEpisodePlay,
    fetchUserStatus,
    isTrackLiked,
    isPodcastSubscribed,
    likedTracks,
    subscribedPodcasts,
  };
}

// Create music content
export function useCreateMusic() {
  const { externalWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (externalWallet?.authToken) {
      return { Authorization: `Bearer ${externalWallet.authToken}` };
    }
    return {};
  }, [externalWallet?.authToken]);

  const createAlbum = useCallback(async (data: {
    title: string;
    description?: string;
    coverArtUrl?: string;
    genre?: string;
    releaseDate?: string;
    priceKas?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/albums', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create album');
      return result.albumId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const createTrack = useCallback(async (data: {
    title: string;
    description?: string;
    audioUrl?: string;
    coverArtUrl?: string;
    durationSeconds?: number;
    albumId?: number;
    trackNumber?: number;
    genre?: string;
    lyrics?: string;
    priceKas?: string;
    isExplicit?: boolean;
    artistName?: string;
    chapters?: { title: string; startTimeSeconds: number }[];
    beatGrid?: number[];
    bpm?: number;
    audioHash?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/tracks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create track');
      return result.trackId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const createPodcast = useCallback(async (data: {
    title: string;
    description?: string;
    coverArtUrl?: string;
    category?: string;
    isVideoPodcast?: boolean;
    isExplicit?: boolean;
    priceKas?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/podcasts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create podcast');
      return result.podcastId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const createEpisode = useCallback(async (data: {
    podcastId: number;
    title: string;
    description?: string;
    audioUrl?: string;
    videoUrl?: string;
    coverArtUrl?: string;
    durationSeconds?: number;
    episodeNumber?: number;
    seasonNumber?: number;
    isExplicit?: boolean;
    priceKas?: string;
    chapters?: { title: string; startTimeSeconds: number }[];
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/episodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create episode');
      return result.episodeId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  return {
    createAlbum,
    createTrack,
    createPodcast,
    createEpisode,
    loading,
    error,
  };
}

// Convert API playlist track to AudioTrack format
export function apiPlaylistTrackToAudioTrack(track: ApiPlaylistTrack): AudioTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist || 'Unknown Artist',
    artistId: track.artistId,
    durationSeconds: track.durationSeconds || 0,
    audioUrl: track.audioUrl || '',
    coverArtUrl: track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    albumId: track.albumId,
    albumTitle: track.albumTitle,
    priceKas: track.priceKas || '0',
    creatorWallet: track.creatorWallet,
    contentType: 'track',
    averageRating: track.averageRating,
    reviewCount: track.reviewCount,
  };
}

// Fetch playlist by ID
export function usePlaylist(playlistId: number | string | undefined) {
  const [playlist, setPlaylist] = useState<ApiPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylist = useCallback(async () => {
    if (!playlistId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}`);
      if (!response.ok) throw new Error('Playlist not found');
      const data = await response.json();
      setPlaylist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  return { playlist, loading, error, refetch: fetchPlaylist };
}

// Fetch user's playlists
export function useUserPlaylists() {
  const { externalWallet } = useWallet();
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (externalWallet?.authToken) {
      return { Authorization: `Bearer ${externalWallet.authToken}` };
    }
    return {};
  }, [externalWallet?.authToken]);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      // Only fetch user's own playlists (ownOnly=true) for add-to-playlist functionality
      const response = await fetch('/api/music/playlists?ownOnly=true', {
        headers: getAuthHeader(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch playlists');
      const data = await response.json();
      setPlaylists(data.playlists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  return { playlists, loading, error, refetch: fetchPlaylists };
}

// Playlist actions (create, update, delete, add/remove tracks)
export function usePlaylistActions() {
  const { externalWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (externalWallet?.authToken) {
      return { Authorization: `Bearer ${externalWallet.authToken}` };
    }
    return {};
  }, [externalWallet?.authToken]);

  const createPlaylist = useCallback(async (data: {
    title: string;
    description?: string;
    coverArtUrl?: string;
    isPublic?: boolean;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create playlist');
      return result.playlistId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const updatePlaylist = useCallback(async (playlistId: number, data: {
    title?: string;
    description?: string;
    coverArtUrl?: string;
    isPublic?: boolean;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update playlist');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const deletePlaylist = useCallback(async (playlistId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete playlist');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const addTrackToPlaylist = useCallback(async (playlistId: number, trackId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({ trackId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add track');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const removeTrackFromPlaylist = useCallback(async (playlistId: number, trackId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}/tracks/${trackId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to remove track');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  const reorderPlaylist = useCallback(async (playlistId: number, trackIds: number[]) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ trackIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to reorder playlist');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  return {
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylist,
    loading,
    error,
  };
}

// Music profile types and hook
export interface MusicProfile {
  id: number;
  name: string;
  handle: string;
  bio?: string;
  avatarUrl?: string;
  genre?: string;
  websiteUrl?: string;
  createdAt: string;
}

export function useMusicProfile() {
  const [profile, setProfile] = useState<MusicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { externalWallet } = useWallet();

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (externalWallet?.authToken) {
      return { 'Authorization': `Bearer ${externalWallet.authToken}` };
    }
    return {};
  }, [externalWallet?.authToken]);

  // Fetch current user's music profile
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/profile', {
        headers: getAuthHeader(),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch profile');
      setProfile(data.profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  // Create music profile
  const createProfile = useCallback(async (data: {
    name: string;
    handle: string;
    bio?: string;
    avatarUrl?: string;
    genre?: string;
    websiteUrl?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/music/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create profile');
      setProfile(result.profile);
      return result.profile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    fetchProfile,
    createProfile,
    hasProfile: !!profile,
  };
}
