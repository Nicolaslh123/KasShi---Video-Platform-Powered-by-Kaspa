import { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { AudioTrack } from '../components/AudioPlayer';
import { useWallet } from './WalletContext';

export type AudioEnhancementMode = 'off' | 'bass' | 'clarity' | 'loudness';

interface AudioPlayerContextType {
  currentTrack: AudioTrack | null;
  playlist: AudioTrack[];
  currentIndex: number;
  isPlaying: boolean;
  isPlayerVisible: boolean;
  queue: AudioTrack[];
  volume: number;
  audioEnhancement: AudioEnhancementMode;
  fullyListenedTracks: Set<number>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  setCurrentTrack: (track: AudioTrack) => void;
  setPlaylist: (tracks: AudioTrack[], startIndex?: number) => void;
  playTrack: (track: AudioTrack) => void;
  playPlaylist: (tracks: AudioTrack[], startIndex?: number) => void;
  setIsPlaying: (playing: boolean) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  showPlayer: () => void;
  hidePlayer: () => void;
  closePlayer: () => void;
  toggleLike: (trackId: number) => void;
  addToQueue: (track: AudioTrack) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  playFromQueue: (index: number) => void;
  setVolume: (volume: number) => void;
  setAudioEnhancement: (mode: AudioEnhancementMode) => void;
  addFullyListenedTrack: (trackId: number) => void;
  hasFullyListened: (trackId: number) => boolean;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

// localStorage keys for persisted preferences
const STORAGE_KEY_VOLUME = 'kasshi_music_volume';
const STORAGE_KEY_ENHANCEMENT = 'kasshi_music_enhancement';
const STORAGE_KEY_FULLY_LISTENED_PREFIX = 'kasshi_fully_listened_tracks_';

// Helper to get wallet-specific storage key
function getFullyListenedStorageKey(walletAddress: string | null): string {
  return walletAddress 
    ? `${STORAGE_KEY_FULLY_LISTENED_PREFIX}${walletAddress}` 
    : `${STORAGE_KEY_FULLY_LISTENED_PREFIX}anonymous`;
}

// Helper to load fully listened tracks from localStorage
function loadFullyListenedTracks(walletAddress: string | null): Set<number> {
  try {
    const key = getFullyListenedStorageKey(walletAddress);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch {}
  return new Set();
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  // Get current wallet address for per-wallet fully listened tracking
  const { wallet, externalWallet } = useWallet();
  const currentWalletAddress = wallet?.address || externalWallet?.address || null;
  const walletAddressRef = useRef(currentWalletAddress);
  
  const [currentTrack, setCurrentTrackState] = useState<AudioTrack | null>(null);
  const [playlist, setPlaylistState] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [queue, setQueue] = useState<AudioTrack[]>([]);
  
  // Audio element ref for direct time access (shared with visualizers)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Volume and audio enhancement with localStorage persistence
  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    } catch {}
    return 1; // Default volume
  });
  
  const [audioEnhancement, setAudioEnhancementState] = useState<AudioEnhancementMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ENHANCEMENT);
      if (saved && ['off', 'bass', 'clarity', 'loudness'].includes(saved)) {
        return saved as AudioEnhancementMode;
      }
    } catch {}
    return 'off'; // Default enhancement
  });
  
  // Track IDs that user has fully listened to (without skipping) - eligible for review
  // Now persisted per-wallet so each wallet has its own listening history
  const [fullyListenedTracks, setFullyListenedTracks] = useState<Set<number>>(() => {
    return loadFullyListenedTracks(null); // Initial load, will reload when wallet is available
  });
  
  // Reload fully listened tracks when wallet changes
  useEffect(() => {
    if (walletAddressRef.current !== currentWalletAddress) {
      walletAddressRef.current = currentWalletAddress;
      const loaded = loadFullyListenedTracks(currentWalletAddress);
      setFullyListenedTracks(loaded);
    }
  }, [currentWalletAddress]);
  
  const addFullyListenedTrack = useCallback((trackId: number) => {
    setFullyListenedTracks(prev => {
      const next = new Set(prev);
      next.add(trackId);
      // Persist to wallet-specific localStorage key
      try {
        const key = getFullyListenedStorageKey(walletAddressRef.current);
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);
  
  const hasFullyListened = useCallback((trackId: number) => {
    return fullyListenedTracks.has(trackId);
  }, [fullyListenedTracks]);
  
  // Persist volume to localStorage
  const setVolume = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, clamped.toString());
    } catch {}
  }, []);
  
  // Persist audio enhancement to localStorage
  const setAudioEnhancement = useCallback((mode: AudioEnhancementMode) => {
    setAudioEnhancementState(mode);
    try {
      localStorage.setItem(STORAGE_KEY_ENHANCEMENT, mode);
    } catch {}
  }, []);
  
  // Ref to always have current queue (avoids stale closures)
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const setCurrentTrack = useCallback((track: AudioTrack) => {
    setCurrentTrackState(track);
    setIsPlayerVisible(true);
  }, []);

  const setPlaylist = useCallback((tracks: AudioTrack[], startIndex = 0) => {
    setPlaylistState(tracks);
    setCurrentIndex(startIndex);
    if (tracks.length > 0 && startIndex < tracks.length) {
      setCurrentTrackState(tracks[startIndex]);
      setIsPlayerVisible(true);
    }
  }, []);

  const playTrack = useCallback((track: AudioTrack) => {
    setCurrentTrackState(track);
    setPlaylistState([track]);
    setCurrentIndex(0);
    setIsPlaying(true);
    setIsPlayerVisible(true);
  }, []);

  const playPlaylist = useCallback((tracks: AudioTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    const trackToPlay = tracks[startIndex];
    console.log('[AudioPlayerContext] playPlaylist called:', {
      totalTracks: tracks.length,
      startIndex,
      trackId: trackToPlay?.id,
      trackTitle: trackToPlay?.title,
      audioUrl: trackToPlay?.audioUrl
    });
    setPlaylistState(tracks);
    setCurrentIndex(startIndex);
    setCurrentTrackState(trackToPlay);
    setIsPlaying(true);
    setIsPlayerVisible(true);
  }, []);

  const nextTrack = useCallback(() => {
    if (playlist.length === 0) return;
    const nextIndex = (currentIndex + 1) % playlist.length;
    setCurrentIndex(nextIndex);
    setCurrentTrackState(playlist[nextIndex]);
  }, [playlist, currentIndex]);

  const previousTrack = useCallback(() => {
    if (playlist.length === 0) return;
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    setCurrentIndex(prevIndex);
    setCurrentTrackState(playlist[prevIndex]);
  }, [playlist, currentIndex]);

  const showPlayer = useCallback(() => {
    setIsPlayerVisible(true);
  }, []);

  const hidePlayer = useCallback(() => {
    setIsPlayerVisible(false);
    setIsPlaying(false);
  }, []);

  const closePlayer = useCallback(() => {
    // Stop audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // Reset all player state
    setIsPlaying(false);
    setIsPlayerVisible(false);
    setCurrentTrackState(null);
    setPlaylistState([]);
    setCurrentIndex(0);
    setQueue([]);
  }, []);

  const toggleLike = useCallback((trackId: number) => {
    setPlaylistState(prev => prev.map(t => 
      t.id === trackId ? { ...t, isLiked: !t.isLiked } : t
    ));
    if (currentTrack?.id === trackId) {
      setCurrentTrackState(prev => prev ? { ...prev, isLiked: !prev.isLiked } : null);
    }
  }, [currentTrack]);

  const addToQueue = useCallback((track: AudioTrack) => {
    setQueue(prev => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue(prev => {
      const newQueue = [...prev];
      const [removed] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, removed);
      return newQueue;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const playFromQueue = useCallback((index: number) => {
    // Use ref to get current queue (avoids stale closure issues)
    const currentQueue = queueRef.current;
    if (index < 0 || index >= currentQueue.length) return;
    const track = currentQueue[index];
    // Remove from queue and play as single track
    setQueue(prev => prev.filter((_, i) => i !== index));
    // Reset playlist to just this track to avoid confusion
    setPlaylistState([track]);
    setCurrentIndex(0);
    setCurrentTrackState(track);
    setIsPlaying(true);
    setIsPlayerVisible(true);
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        playlist,
        currentIndex,
        isPlaying,
        isPlayerVisible,
        queue,
        volume,
        audioEnhancement,
        fullyListenedTracks,
        audioRef,
        setCurrentTrack,
        setPlaylist,
        playTrack,
        playPlaylist,
        setIsPlaying,
        nextTrack,
        previousTrack,
        showPlayer,
        hidePlayer,
        closePlayer,
        toggleLike,
        addToQueue,
        removeFromQueue,
        reorderQueue,
        clearQueue,
        playFromQueue,
        setVolume,
        setAudioEnhancement,
        addFullyListenedTrack,
        hasFullyListened,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
