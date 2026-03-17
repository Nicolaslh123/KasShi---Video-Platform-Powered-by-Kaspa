import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Repeat, Shuffle, List, ChevronUp, ChevronDown, ThumbsUp,
  MoreHorizontal, Clock, Link, Radio, ListPlus, User, ListMusic, FolderPlus
} from 'lucide-react';
import QueuePanel from './QueuePanel';

export interface Chapter {
  id: number;
  title: string;
  startTimeSeconds: number;
  endTimeSeconds?: number;
  description?: string;
  imageUrl?: string;
}

export interface AudioTrack {
  id: number;
  title: string;
  artist: string;
  artistId?: number;
  artistHandle?: string;
  audioUrl: string;
  coverArtUrl: string;
  durationSeconds: number;
  chapters?: Chapter[];
  albumId?: number;
  albumTitle?: string;
  isLiked?: boolean;
  priceKas?: string;
  creatorWallet?: string;
  contentType?: 'track' | 'episode';
  isPurchased?: boolean;
  averageRating?: number;
  reviewCount?: number;
  isReviewed?: boolean;
}

interface UserPlaylist {
  id: number;
  title: string;
  trackCount?: number;
}

interface AudioPlayerProps {
  track: AudioTrack | null;
  playlist?: AudioTrack[];
  currentIndex?: number;
  onTrackChange?: (index: number) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onLike?: (trackId: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  accent?: string;
  showMiniPlayer?: boolean;
  externalIsPlaying?: boolean;
  // Queue management
  queue?: AudioTrack[];
  onAddToQueue?: (track: AudioTrack) => void;
  onRemoveFromQueue?: (index: number) => void;
  onReorderQueue?: (fromIndex: number, toIndex: number) => void;
  onClearQueue?: () => void;
  onPlayFromQueue?: (index: number) => void;
  // Navigation
  onGoToArtist?: (artistId: number, artistHandle?: string) => void;
  onStartRadio?: (track: AudioTrack) => void;
  // Playlist management
  userPlaylists?: UserPlaylist[];
  onAddToPlaylist?: (playlistId: number) => void;
  showPlaylistMenu?: boolean;
  onTogglePlaylistMenu?: () => void;
  // Persisted preferences
  externalVolume?: number;
  externalAudioEnhancement?: 'off' | 'bass' | 'clarity' | 'loudness';
  onVolumeChange?: (volume: number) => void;
  onAudioEnhancementChange?: (mode: 'off' | 'bass' | 'clarity' | 'loudness') => void;
  // Purchase callback for paid content (triggered after 30 seconds)
  onPurchaseRequired?: (track: AudioTrack) => Promise<boolean> | void;
  // Play recording callback (triggered when track starts playing)
  onTrackPlayed?: (track: AudioTrack, durationPlayed: number, completed: boolean) => void;
  // Wallet connection status (required for paid content)
  isWalletConnected?: boolean;
  // Callback when wallet is required for paid content
  onWalletRequired?: () => void;
  // Full listen tracking callback (triggered when track completes without skipping forward)
  onFullListenComplete?: (track: AudioTrack) => void;
}

export default function AudioPlayer({
  track,
  playlist = [],
  currentIndex = 0,
  onTrackChange,
  onNext,
  onPrevious,
  onLike,
  onPlayStateChange,
  onProgress,
  accent = '#70C7BA',
  showMiniPlayer = false,
  externalIsPlaying,
  queue = [],
  onAddToQueue,
  onRemoveFromQueue,
  onReorderQueue,
  onClearQueue,
  onPlayFromQueue,
  onGoToArtist,
  onStartRadio,
  userPlaylists = [],
  onAddToPlaylist,
  showPlaylistMenu = false,
  onTogglePlaylistMenu,
  externalVolume,
  externalAudioEnhancement,
  onVolumeChange,
  onAudioEnhancementChange,
  onPurchaseRequired,
  onTrackPlayed,
  isWalletConnected,
  onWalletRequired,
  onFullListenComplete,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  
  // Ref to always have current queue state (avoids stale closure issues)
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeState, setVolumeState] = useState(externalVolume ?? 1);
  const volume = externalVolume ?? volumeState;
  const setVolume = onVolumeChange ?? setVolumeState;
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showChapters, setShowChapters] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [isExpanded, setIsExpanded] = useState(!showMiniPlayer);
  const [isDragging] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showMiniVolume, setShowMiniVolume] = useState(false);
  const [audioEnhancementState, setAudioEnhancementState] = useState<'off' | 'bass' | 'clarity' | 'loudness'>(externalAudioEnhancement ?? 'off');
  const audioEnhancement = externalAudioEnhancement ?? audioEnhancementState;
  const setAudioEnhancement = onAudioEnhancementChange ?? setAudioEnhancementState;
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const miniVolumeRef = useRef<HTMLDivElement>(null);
  const miniPlaylistRef = useRef<HTMLDivElement>(null);
  
  // Web Audio API for enhancement
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  
  // Track if we want to auto-play next track (set by queue/next actions)
  const forceAutoPlayRef = useRef(false);
  
  // Track which tracks have triggered the purchase callback (to avoid duplicate payments)
  const purchaseTriggeredRef = useRef<Set<number>>(new Set());
  
  // Track which tracks have failed payment (to block playback)
  const paymentFailedRef = useRef<Set<number>>(new Set());
  
  // Track which tracks have had their play recorded (to avoid duplicate play counts)
  const playRecordedRef = useRef<Set<number>>(new Set());
  
  // Full listen tracking - detect if user skipped forward during playback
  const hasSkippedForwardRef = useRef(false);
  const lastSeekTimeRef = useRef(0);
  const fullListenTriggeredRef = useRef<Set<number>>(new Set());
  
  // Update current chapter based on playback position
  useEffect(() => {
    if (!track?.chapters?.length) {
      setCurrentChapter(null);
      return;
    }
    
    const chapter = track.chapters.find((ch, idx) => {
      const nextChapter = track.chapters![idx + 1];
      const endTime = ch.endTimeSeconds || nextChapter?.startTimeSeconds || duration;
      return currentTime >= ch.startTimeSeconds && currentTime < endTime;
    });
    
    setCurrentChapter(chapter || null);
  }, [currentTime, track?.chapters, duration]);
  
  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      
      // Check if click is inside any of the popup containers
      const inMoreMenu = moreMenuRef.current?.contains(target);
      const inVolumePopup = miniVolumeRef.current?.contains(target);
      const inPlaylistPopup = miniPlaylistRef.current?.contains(target);
      
      // Only close if clicking outside ALL popups
      if (showMoreMenu && !inMoreMenu && !inVolumePopup && !inPlaylistPopup) {
        setShowMoreMenu(false);
      }
      if (showMiniVolume && !inVolumePopup && !inMoreMenu && !inPlaylistPopup) {
        setShowMiniVolume(false);
      }
      if (showPlaylistMenu && !inPlaylistPopup && !inVolumePopup && !inMoreMenu) {
        onTogglePlaylistMenu?.();
      }
    };
    
    if (showMoreMenu || showMiniVolume || showPlaylistMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu, showMiniVolume, showPlaylistMenu, onTogglePlaylistMenu]);
  
  // Initialize Web Audio API lazily when enhancement is enabled
  const initializeWebAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioContextRef.current) return;
    
    // Don't initialize if audio hasn't loaded yet (readyState 0 = HAVE_NOTHING)
    // This prevents createMediaElementSource from capturing an empty audio element
    if (audio.readyState === 0) {
      console.log('[AudioPlayer] Skipping Web Audio init - audio not ready yet');
      return;
    }
    
    try {
      // crossOrigin is now set in JSX to ensure it's set before any source loading
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      
      // Create source from audio element
      const source = ctx.createMediaElementSource(audio);
      sourceNodeRef.current = source;
      
      // Create gain node for loudness
      const gainNode = ctx.createGain();
      gainNodeRef.current = gainNode;
      
      // Create bass filter (low shelf)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = 0;
      bassFilterRef.current = bassFilter;
      
      // Create treble filter (high shelf)
      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 3000;
      trebleFilter.gain.value = 0;
      trebleFilterRef.current = trebleFilter;
      
      // Create compressor for loudness/clarity
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressorRef.current = compressor;
      
      // Connect the chain: source -> bass -> treble -> compressor -> gain -> destination
      source.connect(bassFilter);
      bassFilter.connect(trebleFilter);
      trebleFilter.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Resume if suspended
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }, []);
  
  // Clean up Web Audio on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);
  
  // Sync volume state with audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);
  
  // Apply audio enhancement settings - initialize Web Audio only when needed
  useEffect(() => {
    const audio = audioRef.current;
    // Only initialize Web Audio if:
    // 1. User has selected an enhancement
    // 2. We don't already have an AudioContext
    // 3. We have a track
    // 4. CRITICAL: The audio element already has a src loaded (to avoid createMediaElementSource issues)
    if (audioEnhancement !== 'off' && !audioContextRef.current && track && audio?.src) {
      initializeWebAudio();
    }
    
    // Resume AudioContext if suspended
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    const bassFilter = bassFilterRef.current;
    const trebleFilter = trebleFilterRef.current;
    const gainNode = gainNodeRef.current;
    const compressor = compressorRef.current;
    
    if (!bassFilter || !trebleFilter || !gainNode || !compressor) return;
    
    switch (audioEnhancement) {
      case 'bass':
        // Bass boost mode
        bassFilter.gain.value = 8;
        trebleFilter.gain.value = 0;
        gainNode.gain.value = 1.0;
        compressor.threshold.value = -24;
        compressor.ratio.value = 4;
        break;
      case 'clarity':
        // Clarity mode - boost highs, light compression
        bassFilter.gain.value = -2;
        trebleFilter.gain.value = 6;
        gainNode.gain.value = 1.0;
        compressor.threshold.value = -20;
        compressor.ratio.value = 3;
        break;
      case 'loudness':
        // Loudness mode - boost everything with heavy compression
        bassFilter.gain.value = 4;
        trebleFilter.gain.value = 3;
        gainNode.gain.value = 1.2;
        compressor.threshold.value = -30;
        compressor.ratio.value = 8;
        break;
      default:
        // Off - flat response
        bassFilter.gain.value = 0;
        trebleFilter.gain.value = 0;
        gainNode.gain.value = 1.0;
        compressor.threshold.value = -24;
        compressor.ratio.value = 12;
    }
  }, [audioEnhancement, initializeWebAudio, track]);
  
  const handleNext = useCallback(() => {
    // Queue always takes priority when pressing next
    if (queueRef.current.length > 0 && onPlayFromQueue) {
      forceAutoPlayRef.current = true; // Force auto-play for queue
      onPlayFromQueue(0);
      return;
    }
    
    if (isShuffleOn && playlist.length > 1 && onTrackChange) {
      const randomIndex = Math.floor(Math.random() * playlist.length);
      onTrackChange(randomIndex);
    } else if (onNext) {
      onNext();
    } else if (playlist.length && onTrackChange) {
      const nextIndex = (currentIndex + 1) % playlist.length;
      onTrackChange(nextIndex);
    }
  }, [playlist, currentIndex, isShuffleOn, onTrackChange, onNext, onPlayFromQueue]);
  
  const handlePrevious = useCallback(() => {
    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }
    
    if (isShuffleOn && playlist.length > 1 && onTrackChange) {
      const randomIndex = Math.floor(Math.random() * playlist.length);
      onTrackChange(randomIndex);
    } else if (onPrevious) {
      onPrevious();
    } else if (playlist.length && onTrackChange) {
      const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
      onTrackChange(prevIndex);
    }
  }, [playlist, currentIndex, currentTime, isShuffleOn, onTrackChange, onPrevious]);
  
  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleTimeUpdate = () => {
      if (!isDragging) {
        const time = audio.currentTime;
        if (Math.floor(time) % 5 === 0 && Math.floor(time) !== Math.floor(currentTime)) {
          console.log('[AudioPlayer] timeupdate:', time.toFixed(1), 'duration:', audio.duration);
        }
        setCurrentTime(time);
        onProgress?.(time, audio.duration);
        
        // Trigger purchase callback after 30 seconds for paid content
        if (
          track &&
          time >= 30 &&
          onPurchaseRequired &&
          track.priceKas &&
          parseFloat(track.priceKas) > 0 &&
          !track.isPurchased &&
          !purchaseTriggeredRef.current.has(track.id)
        ) {
          purchaseTriggeredRef.current.add(track.id);
          console.log('[AudioPlayer] 30s reached, triggering purchase for track:', track.id);
          // Await purchase result and pause if it fails
          const purchaseResult = onPurchaseRequired(track);
          if (purchaseResult instanceof Promise) {
            purchaseResult.then((success) => {
              if (!success) {
                console.log('[AudioPlayer] Purchase failed, blocking playback for track:', track.id);
                paymentFailedRef.current.add(track.id);
                audio.pause();
                audio.currentTime = 0; // Reset to beginning
                onPlayStateChange?.(false);
              }
            });
          }
        }
        
        // Record play count after 10 seconds of playback
        if (
          track &&
          time >= 10 &&
          onTrackPlayed &&
          !playRecordedRef.current.has(track.id)
        ) {
          playRecordedRef.current.add(track.id);
          console.log('[AudioPlayer] 10s reached, recording play for track:', track.id);
          onTrackPlayed(track, time, false);
        }
      }
    };
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      
      // Auto-fix duration if track has 0 or no duration but audio has valid duration
      if (track && audio.duration > 0 && (!track.durationSeconds || track.durationSeconds === 0)) {
        const endpoint = track.contentType === 'episode' 
          ? `/api/music/episodes/${track.id}/fix-duration`
          : `/api/music/tracks/${track.id}/fix-duration`;
        
        fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationSeconds: Math.floor(audio.duration) })
        }).then(res => res.json()).then(data => {
          if (data.updated) {
            console.log('[AudioPlayer] Fixed track duration:', Math.floor(audio.duration));
          }
        }).catch(() => {
          // Silently fail - not critical
        });
      }
    };
    
    const handleEnded = () => {
      // Full listen tracking - trigger callback if user listened without skipping forward
      if (
        track &&
        onFullListenComplete &&
        !hasSkippedForwardRef.current &&
        !fullListenTriggeredRef.current.has(track.id)
      ) {
        fullListenTriggeredRef.current.add(track.id);
        console.log('[AudioPlayer] Full listen completed without skipping:', track.title);
        onFullListenComplete(track);
      }
      
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else if (queueRef.current.length > 0 && onPlayFromQueue) {
        // Queue always takes priority - play next from queue (use ref for current value)
        forceAutoPlayRef.current = true; // Force auto-play for queue
        onPlayFromQueue(0);
      } else if (playlist.length > 1) {
        // No queue - continue with playlist
        const isLastTrack = currentIndex >= playlist.length - 1;
        if (isLastTrack && repeatMode === 'all') {
          // Loop back to start
          forceAutoPlayRef.current = true;
          handleNext();
        } else if (!isLastTrack) {
          forceAutoPlayRef.current = true;
          handleNext();
        } else {
          // End of playlist, no repeat
          setIsPlaying(false);
          onPlayStateChange?.(false);
        }
      } else if (repeatMode === 'all') {
        audio.currentTime = 0;
        audio.play();
      } else {
        setIsPlaying(false);
        onPlayStateChange?.(false);
      }
    };
    
    // Sync isPlaying state with actual audio element state
    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStateChange?.(true);
    };
    
    const handlePause = () => {
      // IMPORTANT: When audio ends naturally, browser fires 'pause' BEFORE 'ended'.
      // We must NOT propagate pause state here if audio ended, because handleEnded
      // will set up the next track and needs isPlaying to stay true for auto-play.
      // Check audio.ended to distinguish between user pause and natural end.
      if (audio.ended) {
        return; // Let handleEnded handle this case
      }
      setIsPlaying(false);
      onPlayStateChange?.(false);
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [isDragging, repeatMode, playlist.length, currentIndex, queue.length, onProgress, onPlayStateChange, onPlayFromQueue, handleNext, track, onPurchaseRequired]);
  
  // Track the last loaded track ID to avoid reloading
  const lastLoadedTrackIdRef = useRef<number | null>(null);
  const pendingAutoPlayRef = useRef(false);
  
  // Sync with external isPlaying state
  // Only handles play/pause for the CURRENT loaded track.
  // The track loading useEffect handles auto-play for NEW tracks.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || externalIsPlaying === undefined) return;
    
    // Skip if the track has changed - let the track loading useEffect handle it
    if (lastLoadedTrackIdRef.current !== track.id) return;
    
    if (externalIsPlaying && !isPlaying) {
      audio.play().catch(() => {
        setIsPlaying(false);
        onPlayStateChange?.(false);
      });
      setIsPlaying(true);
    } else if (!externalIsPlaying && isPlaying) {
      audio.pause();
      setIsPlaying(false);
    }
  }, [externalIsPlaying, track?.id]);
  
  // Load new track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    
    // Only reload if track actually changed
    const trackChanged = lastLoadedTrackIdRef.current !== track.id;
    if (trackChanged) {
      // Reset full-listen tracking for new track
      hasSkippedForwardRef.current = false;
      lastSeekTimeRef.current = 0;
      
      // Block paid content if user has no wallet connected
      const isPaidContent = track.priceKas && Number(track.priceKas) > 0 && !track.isPurchased;
      if (isPaidContent && !isWalletConnected) {
        console.log('[AudioPlayer] Paid content requires wallet connection:', track.title);
        // Stop playback and reset UI state
        audio.pause();
        audio.src = '';
        setIsPlaying(false);
        onPlayStateChange?.(false);
        onWalletRequired?.();
        return;
      }
      
      lastLoadedTrackIdRef.current = track.id;
      
      // ALWAYS auto-play when a NEW track is loaded - user clicked to play it
      // forceAutoPlay is for queue/next scenarios, but new tracks should always play
      const shouldAutoPlay = true; // New track = always auto-play
      forceAutoPlayRef.current = false; // Reset the flag
      pendingAutoPlayRef.current = shouldAutoPlay;
      console.log('[AudioPlayer] New track loaded, will auto-play:', track.title);
      
      // Function to attempt playback
      const attemptPlay = () => {
        console.log('[AudioPlayer] attemptPlay called, pendingAutoPlay:', pendingAutoPlayRef.current, 'readyState:', audio.readyState);
        if (pendingAutoPlayRef.current) {
          pendingAutoPlayRef.current = false;
          console.log('[AudioPlayer] Calling audio.play()...');
          audio.play().then(() => {
            console.log('[AudioPlayer] play() succeeded!');
            setIsPlaying(true);
            onPlayStateChange?.(true);
          }).catch((err) => {
            console.error('[AudioPlayer] play() failed:', err.name, err.message);
            setIsPlaying(false);
            onPlayStateChange?.(false);
          });
        }
      };
      
      // Handler for when audio is ready to play
      const handleCanPlay = () => {
        console.log('[AudioPlayer] canplay event fired, readyState:', audio.readyState);
        attemptPlay();
      };
      
      // Set source and load - with defensive check
      const audioUrl = track.audioUrl;
      console.log('[AudioPlayer] Setting audio source:', { trackId: track.id, audioUrl, fullTrack: track });
      
      if (!audioUrl || audioUrl.length < 5) {
        console.error('[AudioPlayer] Invalid audioUrl for track:', track.id, audioUrl);
        return; // Don't try to load invalid URL
      }
      
      // Debug: test if URL is accessible
      fetch(audioUrl, { method: 'HEAD' })
        .then(res => console.log('[AudioPlayer] URL test:', res.status, res.headers.get('content-type')))
        .catch(err => console.error('[AudioPlayer] URL test failed:', err));
      
      audio.src = audioUrl;
      console.log('[AudioPlayer] After setting src, audio.src =', audio.src);
      audio.load();
      console.log('[AudioPlayer] After load(), readyState =', audio.readyState, 'networkState =', audio.networkState);
      setCurrentTime(0);
      setDuration(track.durationSeconds || 0);
      
      // IMMEDIATE PLAY: Don't wait for events - just play now
      // Modern browsers handle buffering automatically
      pendingAutoPlayRef.current = false;
      console.log('[AudioPlayer] Immediately calling play()...');
      audio.play().then(() => {
        console.log('[AudioPlayer] Immediate play() succeeded!');
        setIsPlaying(true);
        onPlayStateChange?.(true);
      }).catch((err) => {
        console.error('[AudioPlayer] Immediate play() failed:', err.name, err.message);
        // Don't give up - retry once after a short delay
        setTimeout(() => {
          console.log('[AudioPlayer] Retry play after delay...');
          audio.play().then(() => {
            console.log('[AudioPlayer] Retry play() succeeded!');
            setIsPlaying(true);
            onPlayStateChange?.(true);
          }).catch((err2) => {
            console.error('[AudioPlayer] Retry play() also failed:', err2.name, err2.message);
            setIsPlaying(false);
            onPlayStateChange?.(false);
          });
        }, 500);
      });
      
      // Error handler for loading issues
      const handleError = () => {
        console.error('[AudioPlayer] Audio error event:', audio.error?.code, audio.error?.message);
      };
      audio.addEventListener('error', handleError, { once: true });
      
      // Additional debug event listeners
      const handleLoadStart = () => console.log('[AudioPlayer] loadstart event');
      const handleProgress = () => console.log('[AudioPlayer] progress event, buffered:', audio.buffered.length > 0 ? audio.buffered.end(0) : 0);
      const handleStalled = () => console.log('[AudioPlayer] stalled event - network stalled');
      const handleSuspend = () => console.log('[AudioPlayer] suspend event - loading suspended');
      const handleWaiting = () => console.log('[AudioPlayer] waiting event');
      
      // Combined loadeddata handler - logs AND attempts play
      const handleLoadedData = () => {
        console.log('[AudioPlayer] loadeddata event, readyState:', audio.readyState);
        if (audio.readyState >= 3) {
          console.log('[AudioPlayer] loadeddata triggering attemptPlay');
          attemptPlay();
        }
      };
      
      audio.addEventListener('loadstart', handleLoadStart, { once: true });
      audio.addEventListener('progress', handleProgress, { once: true });
      audio.addEventListener('loadeddata', handleLoadedData, { once: true });
      audio.addEventListener('stalled', handleStalled, { once: true });
      audio.addEventListener('suspend', handleSuspend, { once: true });
      audio.addEventListener('waiting', handleWaiting, { once: true });
      
      // We already called play() immediately above, so these event handlers
      // are just for debugging now
      audio.addEventListener('canplay', handleCanPlay, { once: true });
      
      return () => {
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('loadeddata', handleLoadedData);
        audio.removeEventListener('error', handleError);
      };
    } else if (externalIsPlaying && audio.paused) {
      // Track didn't change but play state did - just play
      audio.play().then(() => {
        setIsPlaying(true);
        onPlayStateChange?.(true);
      }).catch(() => {
        setIsPlaying(false);
        onPlayStateChange?.(false);
      });
    }
  }, [track?.id, externalIsPlaying, onPlayStateChange]);
  
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    
    if (audio.paused) {
      // Block PLAY if payment failed for this track (but always allow pause)
      if (paymentFailedRef.current.has(track.id)) {
        console.log('[AudioPlayer] Play blocked - payment failed for track:', track.id);
        return;
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    // State updates handled by play/pause event listeners
  }, [track]);
  
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress) return;
    
    const rect = progress.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = percent * duration;
    
    // Block seeking past 30s for paid content that hasn't been paid for
    if (
      track &&
      newTime >= 30 &&
      track.priceKas &&
      parseFloat(track.priceKas) > 0 &&
      !track.isPurchased &&
      !purchaseTriggeredRef.current.has(track.id)
    ) {
      // Trigger payment immediately when trying to seek past 30s
      purchaseTriggeredRef.current.add(track.id);
      console.log('[AudioPlayer] Seek past 30s on paid track, triggering purchase for track:', track.id);
      
      if (onPurchaseRequired) {
        const purchaseResult = onPurchaseRequired(track);
        if (purchaseResult instanceof Promise) {
          purchaseResult.then((success) => {
            if (!success) {
              console.log('[AudioPlayer] Purchase failed, blocking playback for track:', track.id);
              paymentFailedRef.current.add(track.id);
              audio.pause();
              audio.currentTime = 0;
              onPlayStateChange?.(false);
            } else {
              // Payment succeeded, allow the seek
              audio.currentTime = newTime;
              setCurrentTime(newTime);
            }
          });
        }
      }
      return; // Don't seek yet, wait for payment result
    }
    
    // Block seeking if payment already failed for this track
    if (track && paymentFailedRef.current.has(track.id)) {
      console.log('[AudioPlayer] Seek blocked - payment failed for track:', track.id);
      return;
    }
    
    // Track if user skipped forward (seeking ahead of current position)
    if (newTime > audio.currentTime + 2) {
      hasSkippedForwardRef.current = true;
      console.log('[AudioPlayer] Forward skip detected:', audio.currentTime.toFixed(1), '->', newTime.toFixed(1));
    }
    lastSeekTimeRef.current = newTime;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration, track, onPurchaseRequired, onPlayStateChange]);
  
  const handleChapterClick = useCallback((chapter: Chapter) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = chapter.startTimeSeconds;
    setCurrentTime(chapter.startTimeSeconds);
    setShowChapters(false);
    
    if (!isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  }, [isPlaying, onPlayStateChange]);
  
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);
  
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, [setVolume]);
  
  const cycleRepeatMode = useCallback(() => {
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    const currentModeIndex = modes.indexOf(repeatMode);
    setRepeatMode(modes[(currentModeIndex + 1) % modes.length]);
  }, [repeatMode]);
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  if (!track) return null;
  
  // Get mini player background style - transparent (0% gradient)
  const getMiniPlayerBackground = () => {
    return {
      background: 'transparent',
    };
  };
  
  // Determine which view to show
  const showMiniView = showMiniPlayer && !isExpanded;
  
  // Single return with audio element always first - this is critical for persistence
  return (
    <>
      {/* Audio element MUST be first and always rendered - never inside conditionals */}
      <audio ref={audioRef} preload="auto" crossOrigin="anonymous" />
      
      {showMiniView ? (
        /* Mini player (collapsed state) */
        <>
          <div 
            className="fixed bottom-0 left-0 right-0 h-16 border-t border-white/10 z-50"
            style={getMiniPlayerBackground()}
        >
          {/* Subtle overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          
          {/* Clickable Progress bar for seeking */}
          <div 
            className="absolute top-0 left-0 right-0 h-2 cursor-pointer z-20 group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const newTime = percent * duration;
              if (audioRef.current) {
                // Track if user skipped forward (seeking ahead of current position)
                if (newTime > audioRef.current.currentTime + 2) {
                  hasSkippedForwardRef.current = true;
                  console.log('[AudioPlayer Mini] Forward skip detected:', audioRef.current.currentTime.toFixed(1), '->', newTime.toFixed(1));
                }
                lastSeekTimeRef.current = newTime;
                audioRef.current.currentTime = newTime;
                setCurrentTime(newTime);
              }
            }}
          >
            {/* Background track */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 group-hover:h-1 transition-all" />
            {/* Progress fill */}
            <div 
              className="absolute bottom-0 left-0 h-0.5 group-hover:h-1 transition-all"
              style={{ width: `${progress}%`, backgroundColor: accent }}
            />
          </div>
          
          <div className="relative flex items-center justify-between h-full px-4 max-w-7xl mx-auto z-10">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img 
                src={currentChapter?.imageUrl || track.coverArtUrl} 
                alt={track.title}
                className="w-10 h-10 rounded object-cover shadow-lg"
              />
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{track.title}</p>
                {track.artistId && onGoToArtist ? (
                  <button 
                    onClick={() => onGoToArtist(track.artistId!, track.artistHandle)}
                    className="text-white/70 text-xs truncate hover:text-white hover:underline transition-colors text-left"
                  >
                    {track.artist}
                  </button>
                ) : (
                  <p className="text-white/70 text-xs truncate">{track.artist}</p>
                )}
              </div>
              {/* Time display */}
              <div className="text-white text-xs font-mono hidden sm:block">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevious}
                className="text-white/70 hover:text-white transition-colors p-1 hidden sm:block"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform p-1">
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
              </button>
              <button 
                onClick={handleNext}
                className="text-white/70 hover:text-white transition-colors p-1 hidden sm:block"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              
              {/* Mini player volume control */}
              <div ref={miniVolumeRef} className="relative hidden sm:block">
                <button 
                  onClick={() => {
                    // Close playlist menu if open
                    if (showPlaylistMenu && onTogglePlaylistMenu) {
                      onTogglePlaylistMenu();
                    }
                    setShowMiniVolume(!showMiniVolume);
                  }}
                  className="text-white p-1 transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                
                {showMiniVolume && (
                  <div 
                    className="absolute bottom-full right-0 mb-3 bg-slate-900/98 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/20 z-[80]"
                    style={{ minWidth: '180px' }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                  >
                    {/* Volume section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-white/80 font-medium">Volume</span>
                        <span className="text-xs text-white font-mono bg-white/10 px-2 py-0.5 rounded">{Math.round(volume * 100)}%</span>
                      </div>
                      {/* Horizontal volume slider - much larger and easier to use */}
                      <div className="relative h-10 flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onMouseUp={(e) => e.stopPropagation()}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.target as HTMLElement).setPointerCapture(e.pointerId);
                          }}
                          onPointerUp={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => e.stopPropagation()}
                          className="w-full h-3 rounded-full cursor-pointer audio-slider"
                          style={{
                            background: `linear-gradient(to right, ${accent} ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`,
                          }}
                        />
                      </div>
                      {/* Mute button */}
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`w-full mt-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/80 hover:bg-white/15'
                        }`}
                      >
                        {isMuted ? 'Unmute' : 'Mute'}
                      </button>
                    </div>
                    
                    {/* Sound Mode section */}
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/80 font-medium mb-2">Sound Mode</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['off', 'bass', 'clarity', 'loudness'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setAudioEnhancement(mode)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-center ${
                              audioEnhancement === mode 
                                ? 'text-white shadow-lg' 
                                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                            style={audioEnhancement === mode ? { backgroundColor: accent } : {}}
                          >
                            {mode === 'off' ? 'Normal' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Add to playlist button */}
              <div ref={miniPlaylistRef} className="relative hidden sm:block">
                <button 
                  onClick={() => {
                    // Close volume popup if open
                    setShowMiniVolume(false);
                    onTogglePlaylistMenu?.();
                  }}
                  className={`p-1 transition-colors ${showPlaylistMenu ? 'text-white' : 'text-white/70 hover:text-white'}`}
                  style={showPlaylistMenu ? { color: accent } : {}}
                  title="Add to playlist"
                >
                  <FolderPlus className="w-5 h-5" />
                </button>
                {showPlaylistMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[70]">
                    <div className="p-2 border-b border-white/10">
                      <p className="text-xs text-white/50 px-2">Add to playlist</p>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {userPlaylists.length === 0 ? (
                        <p className="text-sm text-white/50 px-4 py-3">No playlists yet</p>
                      ) : (
                        userPlaylists.map((pl) => (
                          <button
                            key={pl.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('[AudioPlayer Mini] Adding track to playlist:', pl.id, pl.title);
                              if (onAddToPlaylist) {
                                onAddToPlaylist(pl.id);
                              } else {
                                console.error('[AudioPlayer Mini] onAddToPlaylist is undefined!');
                              }
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {pl.title}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Like button */}
              <button 
                onClick={() => track && onLike?.(track.id)}
                className={`p-1 transition-colors hidden sm:block ${track?.isLiked ? 'text-orange-500' : 'text-white/70 hover:text-white'}`}
                title="Like"
              >
                <ThumbsUp className={`w-5 h-5 ${track?.isLiked ? 'fill-current' : ''}`} />
              </button>
              
              {/* Add to queue button */}
              <button 
                onClick={() => track && onAddToQueue?.(track)}
                className="text-white/70 hover:text-white p-1 transition-colors hidden sm:block"
                title="Add to queue"
              >
                <ListPlus className="w-5 h-5" />
              </button>
              
              {/* View queue button */}
              <button 
                onClick={() => setShowQueue(true)}
                className="text-white/70 hover:text-white p-1 transition-colors relative hidden sm:block"
                title="Queue"
              >
                <ListMusic className="w-5 h-5" />
                {queue.length > 0 && (
                  <span 
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-black"
                    style={{ backgroundColor: accent }}
                  >
                    {queue.length > 9 ? '9+' : queue.length}
                  </span>
                )}
              </button>
              
              <button onClick={() => setIsExpanded(true)} className="text-white p-1 ml-1">
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Queue Panel for mini player */}
        {showQueue && (
          <QueuePanel
            queue={queue}
            currentTrack={track}
            onClose={() => setShowQueue(false)}
            onPlayFromQueue={(index) => {
              onPlayFromQueue?.(index);
              setShowQueue(false);
            }}
            onRemoveFromQueue={onRemoveFromQueue || (() => {})}
            onReorderQueue={onReorderQueue || (() => {})}
            onClearQueue={onClearQueue || (() => {})}
            accent={accent}
          />
        )}
        </>
      ) : (
        /* Full player */
        <>
        <div 
          className={`${showMiniPlayer ? 'fixed inset-0 z-50' : ''}`}
          onClick={(e) => {
            // Click outside to close - only if clicking the backdrop, not the content
            if (showMiniPlayer && e.target === e.currentTarget) {
              setIsExpanded(false);
            }
          }}
        >
        {showMiniPlayer && (
          <button 
            onClick={() => setIsExpanded(false)}
            className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 p-2.5 rounded-full z-20 transition-all shadow-lg border border-white/20"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        )}
        
        <div className={`flex flex-col items-center justify-center ${showMiniPlayer ? 'h-full px-6 py-12 relative' : 'p-6'}`} onClick={(e) => e.stopPropagation()}>
          {/* Gradient backdrop behind player content when fullscreen */}
          {showMiniPlayer && (
            <div 
              className="absolute inset-0"
              onClick={() => setIsExpanded(false)}
              style={{
                background: `radial-gradient(ellipse 80% 70% at 50% 50%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 80%, transparent 100%)`,
              }}
            />
          )}
          
          {/* Gradient border container for fullscreen player */}
          {showMiniPlayer && (
            <div 
              className="absolute z-5 rounded-3xl pointer-events-none"
              style={{
                top: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(90%, 500px)',
                height: '75%',
                background: `linear-gradient(135deg, ${accent}40 0%, ${accent}20 25%, transparent 50%, ${accent}20 75%, ${accent}40 100%)`,
                padding: '2px',
              }}
            >
              <div 
                className="w-full h-full rounded-3xl"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(20px)',
                }}
              />
            </div>
          )}
          {/* Cover Art */}
          <div className="relative mb-8 group z-10">
            <img 
              src={currentChapter?.imageUrl || track.coverArtUrl}
              alt={track.title}
              className={`${showMiniPlayer ? 'w-72 h-72 md:w-80 md:h-80' : 'w-64 h-64'} rounded-2xl object-cover shadow-2xl`}
            />
            {track.chapters?.length ? (
              <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-white/80 flex items-center gap-1">
                <List className="w-3 h-3" />
                {track.chapters.length} chapters
              </div>
            ) : null}
          </div>
          
          {/* Track Info */}
          <div className="text-center mb-6 w-full max-w-md z-10">
            <h2 className="text-white text-xl font-bold truncate">{track.title}</h2>
            {track.artistId && onGoToArtist ? (
              <button 
                onClick={() => onGoToArtist(track.artistId!, track.artistHandle)}
                className="text-white/60 truncate hover:text-white hover:underline transition-colors"
              >
                {track.artist}
              </button>
            ) : (
              <p className="text-white/60 truncate">{track.artist}</p>
            )}
            {currentChapter && (
              <p className="text-sm mt-2 truncate" style={{ color: accent }}>
                {currentChapter.title}
              </p>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="w-full max-w-md mb-4 z-10">
            <div 
              ref={progressRef}
              onClick={handleSeek}
              className="relative h-2 bg-white/20 rounded-full cursor-pointer group"
            >
              {/* Chapter markers */}
              {track.chapters?.map((chapter) => {
                const markerPos = (chapter.startTimeSeconds / duration) * 100;
                return (
                  <div
                    key={chapter.id}
                    className="absolute top-0 w-1 h-2 bg-white/50 rounded-full z-10"
                    style={{ left: `${markerPos}%` }}
                    title={chapter.title}
                  />
                );
              })}
              
              {/* Progress fill */}
              <div 
                className="absolute top-0 left-0 h-full rounded-full transition-all duration-100"
                style={{ width: `${progress}%`, backgroundColor: accent }}
              />
              
              {/* Scrubber thumb */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progress}% - 8px)`, backgroundColor: accent }}
              />
            </div>
            
            <div className="flex justify-between text-xs text-white/50 mt-2">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          {/* Main Controls */}
          <div className="flex items-center justify-center gap-6 mb-6 z-10">
            <button 
              onClick={() => setIsShuffleOn(!isShuffleOn)}
              className={`p-2 rounded-full transition-colors ${isShuffleOn ? '' : 'text-white/50 hover:text-white'}`}
              style={isShuffleOn ? { color: accent } : {}}
            >
              <Shuffle className="w-5 h-5" />
            </button>
            
            <button 
              onClick={handlePrevious}
              className="text-white hover:scale-110 transition-transform p-2"
              disabled={!playlist.length}
            >
              <SkipBack className="w-6 h-6 fill-current" />
            </button>
            
            <button 
              onClick={togglePlay}
              className="w-16 h-16 rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform shadow-lg"
              style={{ backgroundColor: accent }}
            >
              {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 fill-current ml-1" />}
            </button>
            
            <button 
              onClick={handleNext}
              className="text-white hover:scale-110 transition-transform p-2"
              disabled={!playlist.length}
            >
              <SkipForward className="w-6 h-6 fill-current" />
            </button>
            
            <button 
              onClick={cycleRepeatMode}
              className={`p-2 rounded-full transition-colors relative ${repeatMode === 'off' ? 'text-white/50 hover:text-white' : ''}`}
              style={repeatMode !== 'off' ? { color: accent } : {}}
            >
              <Repeat className="w-5 h-5" />
              {repeatMode === 'one' && (
                <span className="absolute -top-1 -right-1 text-[10px] font-bold" style={{ color: accent }}>1</span>
              )}
            </button>
          </div>
          
          {/* Secondary Controls */}
          <div className="flex items-center justify-between w-full max-w-md z-10">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => onLike?.(track.id)}
                className={`p-2 transition-colors ${track.isLiked ? '' : 'text-white/50 hover:text-white'}`}
                style={track.isLiked ? { color: accent } : {}}
              >
                <ThumbsUp className={`w-5 h-5 ${track.isLiked ? 'fill-current' : ''}`} />
              </button>
              
              {/* Add to Playlist */}
              <div className="relative">
                <button 
                  onClick={() => onTogglePlaylistMenu?.()}
                  className={`p-2 transition-colors ${showPlaylistMenu ? '' : 'text-white/50 hover:text-white'}`}
                  style={showPlaylistMenu ? { color: accent } : {}}
                  title="Add to playlist"
                >
                  <FolderPlus className="w-5 h-5" />
                </button>
                {showPlaylistMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[70]">
                    <div className="p-2 border-b border-white/10">
                      <p className="text-xs text-white/50 px-2">Add to playlist</p>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {userPlaylists.length === 0 ? (
                        <p className="text-sm text-white/50 px-4 py-3">No playlists yet</p>
                      ) : (
                        userPlaylists.map((pl) => (
                          <button
                            key={pl.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('[AudioPlayer Full] Adding track to playlist:', pl.id, pl.title);
                              if (onAddToPlaylist) {
                                onAddToPlaylist(pl.id);
                              } else {
                                console.error('[AudioPlayer Full] onAddToPlaylist is undefined!');
                              }
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {pl.title}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {track.chapters?.length ? (
                <button 
                  onClick={() => setShowChapters(!showChapters)}
                  className={`p-2 transition-colors ${showChapters ? '' : 'text-white/50 hover:text-white'}`}
                  style={showChapters ? { color: accent } : {}}
                >
                  <List className="w-5 h-5" />
                </button>
              ) : null}
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-white/50 hover:text-white p-2">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${accent} ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`,
                }}
              />
              
              {/* Sound mode selector */}
              <div className="relative group ml-2">
                <button 
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    audioEnhancement !== 'off' 
                      ? 'text-white' 
                      : 'text-white/50 hover:text-white'
                  }`}
                  style={audioEnhancement !== 'off' ? { color: accent } : {}}
                >
                  {audioEnhancement === 'off' ? 'Normal' : audioEnhancement.charAt(0).toUpperCase() + audioEnhancement.slice(1)}
                </button>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-800/95 backdrop-blur-xl rounded-lg p-2 shadow-2xl border border-white/10 z-50 min-w-[100px]">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider px-2 mb-1">Sound</p>
                  {(['off', 'bass', 'clarity', 'loudness'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAudioEnhancement(mode)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        audioEnhancement === mode 
                          ? 'bg-white/20 text-white' 
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {mode === 'off' ? 'Normal' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 relative">
              {/* Go to Queue button */}
              <button 
                onClick={() => setShowQueue(true)}
                className="text-white/50 hover:text-white p-2 relative"
                title="View queue"
              >
                <ListMusic className="w-5 h-5" />
                {queue.length > 0 && (
                  <span 
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-black"
                    style={{ backgroundColor: accent }}
                  >
                    {queue.length > 9 ? '9+' : queue.length}
                  </span>
                )}
              </button>
              
              <div ref={moreMenuRef} className="relative">
                <button 
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className={`p-2 transition-colors ${showMoreMenu ? 'text-white' : 'text-white/50 hover:text-white'}`}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                
                {showMoreMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 overflow-hidden z-50">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                    >
                      <Link className="w-4 h-4" />
                      Copy link
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (track && onAddToQueue) {
                          onAddToQueue(track);
                        }
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                    >
                      <ListPlus className="w-4 h-4" />
                      Add to queue
                    </button>
                    
                    <button 
                      onClick={() => {
                        setShowQueue(true);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                    >
                      <ListMusic className="w-4 h-4" />
                      Go to queue
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (track && onGoToArtist && track.artistId) {
                          onGoToArtist(track.artistId, track.artistHandle);
                        }
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                    >
                      <User className="w-4 h-4" />
                      Go to artist
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (track && onStartRadio) {
                          onStartRadio(track);
                        }
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                    >
                      <Radio className="w-4 h-4" />
                      Start radio
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Chapters Panel */}
          {showChapters && track.chapters?.length ? (
            <div className="w-full max-w-md mt-6 bg-white/5 rounded-xl p-4 max-h-64 overflow-y-auto z-10">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Chapters
              </h3>
              <div className="space-y-2">
                {track.chapters.map((chapter, idx) => {
                  const isActive = currentChapter?.id === chapter.id;
                  return (
                    <button
                      key={chapter.id}
                      onClick={() => handleChapterClick(chapter)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                        isActive ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      {chapter.imageUrl ? (
                        <img 
                          src={chapter.imageUrl} 
                          alt={chapter.title}
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div 
                          className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 text-sm font-bold"
                          style={{ backgroundColor: `${accent}20`, color: accent }}
                        >
                          {idx + 1}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/80'}`}>
                          {chapter.title}
                        </p>
                        {chapter.description && (
                          <p className="text-xs text-white/40 truncate">{chapter.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-white/40 flex-shrink-0">
                        {formatTime(chapter.startTimeSeconds)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      
      {/* Queue Panel */}
      {showQueue && (
        <QueuePanel
          queue={queue}
          currentTrack={track}
          onClose={() => setShowQueue(false)}
          onPlayFromQueue={(index) => {
            onPlayFromQueue?.(index);
            setShowQueue(false);
          }}
          onRemoveFromQueue={onRemoveFromQueue || (() => {})}
          onReorderQueue={onReorderQueue || (() => {})}
          onClearQueue={onClearQueue || (() => {})}
          accent={accent}
        />
      )}
      </>
      )}
    </>
  );
}
