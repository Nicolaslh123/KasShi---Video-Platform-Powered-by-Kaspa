import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, memo } from "react";
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Settings } from "lucide-react";
import { formatDuration } from "../hooks/useKasShi";
import Hls from "hls.js";

export interface VideoPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoElement: () => HTMLVideoElement | null;
}

interface VideoPlayerProps {
  src: string;
  poster?: string;
  initialProgress?: number;
  initialVolume?: number;
  initialMuted?: boolean;
  durationSeconds?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onViewThresholdReached?: () => void;
  onLoadedMetadata?: (duration: number, width: number, height: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onError?: (error: string) => void;
  translations?: {
    buffering?: string;
    videoPlaybackIssue?: string;
    tryTheseFixes?: string;
    tryAgain?: string;
    openInNewTab?: string;
    download?: string;
  };
}

// Isolated video player - memoized to prevent re-renders from parent state changes
const VideoPlayerInner = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  src,
  poster,
  initialProgress = 0,
  initialVolume = 1,
  initialMuted = false,
  durationSeconds = 0,
  onTimeUpdate,
  onViewThresholdReached,
  onLoadedMetadata,
  onPlayStateChange,
  onError,
  translations = {},
}, ref) => {
  // All video-specific state is managed here, isolated from parent
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const controlsBarRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  // Detect HLS stream
  const isHlsStream = src?.includes('.m3u8');
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  
  // UI state
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Volume state
  const [volume, setVolume] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(initialMuted);
  
  // Quality/speed state
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState<string>("Auto");
  const [nativeResolution, setNativeResolution] = useState<{ width: number; height: number } | null>(null);
  const [aspectRatio, setAspectRatio] = useState("16/9");
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number; index: number }[]>([]);
  const [currentHlsLevel, setCurrentHlsLevel] = useState<number>(-1); // -1 = auto
  
  // Refs for performance optimization
  const lastTimeRef = useRef(0);
  const lastBufferedRef = useRef(0);
  const viewThresholdReachedRef = useRef(false);
  const stallStartRef = useRef<number | null>(null);
  const initialProgressAppliedRef = useRef(false);
  const seekRecoveryAttemptRef = useRef(0);
  
  // Detect if running in React Native WebView
  const isWebView = typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
  
  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    play: async () => {
      if (videoRef.current) {
        await videoRef.current.play();
      }
    },
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    },
    seek: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
    getDuration: () => videoRef.current?.duration || duration,
    getVideoElement: () => videoRef.current,
  }));
  
  // Buffering detection - only show after prolonged stall
  const handleBufferingChange = useCallback((isStalled: boolean) => {
    if (isStalled) {
      if (!stallStartRef.current) {
        stallStartRef.current = Date.now();
        // Check after 3 seconds if still stalled
        setTimeout(() => {
          if (stallStartRef.current && Date.now() - stallStartRef.current >= 3000) {
            setIsBuffering(true);
          }
        }, 3000);
      }
    } else {
      stallStartRef.current = null;
      setIsBuffering(false);
    }
  }, []);
  
  // Time update handler - optimized to only update state once per second
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    
    const time = videoRef.current.currentTime;
    const flooredTime = Math.floor(time);
    
    if (flooredTime !== lastTimeRef.current) {
      lastTimeRef.current = flooredTime;
      setCurrentTime(flooredTime);
      onTimeUpdate?.(time, videoRef.current.duration);
      
      // Check view threshold (5 seconds or 30% watched)
      if (!viewThresholdReachedRef.current && onViewThresholdReached) {
        const dur = videoRef.current.duration || durationSeconds;
        const threshold = Math.min(5, dur * 0.3);
        if (time >= threshold && threshold > 0) {
          viewThresholdReachedRef.current = true;
          onViewThresholdReached();
        }
      }
    }
  }, [onTimeUpdate, onViewThresholdReached, durationSeconds]);
  
  // Progress bar handlers
  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    updateProgressFromEvent(e);
    
    const handleMouseMove = (e: MouseEvent) => updateProgressFromEvent(e as unknown as React.MouseEvent);
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);
  
  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    updateProgressFromTouch(e);
    
    const handleTouchMove = (e: TouchEvent) => updateProgressFromTouch(e as unknown as React.TouchEvent);
    const handleTouchEnd = () => {
      setIsDragging(false);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
    
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
  }, []);
  
  const updateProgressFromEvent = (e: React.MouseEvent | MouseEvent) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * (videoRef.current.duration || duration);
  };
  
  const updateProgressFromTouch = (e: React.TouchEvent | TouchEvent) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const touch = e.touches[0];
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = percent * (videoRef.current.duration || duration);
  };
  
  // Volume handlers
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
    localStorage.setItem("kasshi_volume", String(newVolume));
    localStorage.setItem("kasshi_muted", String(newVolume === 0));
  }, []);
  
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      if (videoRef.current) {
        videoRef.current.muted = newMuted;
      }
      localStorage.setItem("kasshi_muted", String(newMuted));
      return newMuted;
    });
  }, []);
  
  // Playback controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else {
      videoRef.current.pause();
    }
  }, []);
  
  const changePlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  }, []);
  
  // Fullscreen - with mobile video element support
  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    
    if (!container || !video) return;
    
    // Check if we're currently in fullscreen
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (video as any).webkitDisplayingFullscreen
    );
    
    if (!isCurrentlyFullscreen) {
      // Try to enter fullscreen
      // On iOS Safari, we must use the video element's webkitEnterFullscreen
      if ((video as any).webkitEnterFullscreen) {
        // iOS Safari - use video element's native fullscreen
        (video as any).webkitEnterFullscreen();
      } else if ((video as any).webkitRequestFullscreen) {
        // Some Android browsers prefer video element fullscreen
        (video as any).webkitRequestFullscreen();
      } else if (video.requestFullscreen) {
        // Try video element first on mobile
        video.requestFullscreen().catch(() => {
          // Fallback to container
          container.requestFullscreen?.();
        });
      } else if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      } else if ((container as any).mozRequestFullScreen) {
        (container as any).mozRequestFullScreen();
      }
    } else {
      // Exit fullscreen
      if ((video as any).webkitExitFullscreen) {
        (video as any).webkitExitFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      }
    }
  }, []);
  
  // Fullscreen change listener
  useEffect(() => {
    const video = videoRef.current;
    
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreen(isFs);
      
      // Send message to React Native WebView if available
      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(isFs ? 'enterFullscreen' : 'exitFullscreen');
      }
    };
    
    // iOS Safari uses different events on the video element
    const handleiOSFullscreenChange = () => {
      if (video) {
        const isFs = !!(video as any).webkitDisplayingFullscreen;
        setIsFullscreen(isFs);
        
        // Send message to React Native WebView if available
        if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(isFs ? 'enterFullscreen' : 'exitFullscreen');
        }
      }
    };
    
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    
    // iOS Safari video element fullscreen events
    if (video) {
      video.addEventListener("webkitbeginfullscreen", handleiOSFullscreenChange);
      video.addEventListener("webkitendfullscreen", handleiOSFullscreenChange);
    }
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      
      if (video) {
        video.removeEventListener("webkitbeginfullscreen", handleiOSFullscreenChange);
        video.removeEventListener("webkitendfullscreen", handleiOSFullscreenChange);
      }
    };
  }, []);
  
  // WebView compatibility fixes for React Native apps
  // WebView compatibility fixes for React Native app
  useEffect(() => {
    const isInWebView = !!(window as any).ReactNativeWebView || document.body.classList.contains('video-webview-container');

    if (isInWebView) {
      const video = videoRef.current;

      if (video) {
        // FORCE NATIVE CONTROLS — this is the key
        video.controls = true;

        // Force video to fill screen without black bars
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = '#000';

        // Hide your custom controls completely in the app
        const customControls = document.querySelectorAll('.controls-bar, [class*="control"], [class*="bottom"]');
        customControls.forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }

      if (containerRef.current) {
        containerRef.current.style.height = '100vh';
        containerRef.current.style.maxHeight = '100vh';
        containerRef.current.style.aspectRatio = 'unset';
      }
    }
  }, []);
  
  // Apply initial progress once
  useEffect(() => {
    if (videoRef.current && initialProgress > 0 && !initialProgressAppliedRef.current) {
      videoRef.current.currentTime = initialProgress;
      initialProgressAppliedRef.current = true;
    }
  }, [initialProgress]);
  
  // Brave browser recovery - one-time check
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !isPlaying) return;
    
    if (seekRecoveryAttemptRef.current >= 1) return;
    
    const timeoutId = setTimeout(() => {
      if (!vid || vid.paused) return;
      
      const hasVideoTrack = vid.videoWidth > 0 && vid.videoHeight > 0;
      const isTimeAdvancing = vid.currentTime > 0.5;
      
      if (isTimeAdvancing && !hasVideoTrack && seekRecoveryAttemptRef.current < 1) {
        seekRecoveryAttemptRef.current++;
        const savedTime = vid.currentTime;
        const savedSrc = vid.src;
        vid.pause();
        vid.src = '';
        vid.load();
        
        setTimeout(() => {
          vid.src = savedSrc;
          vid.load();
          vid.currentTime = savedTime;
          vid.play().catch(console.error);
        }, 100);
      }
    }, 3000);
    
    return () => clearTimeout(timeoutId);
  }, [isPlaying]);
  
  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setShowSpeedMenu(false);
      setShowQualityMenu(false);
    };
    if (showSpeedMenu || showQualityMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [showSpeedMenu, showQualityMenu]);
  
  // HLS.js initialization for .m3u8 streams
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    
    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    if (isHlsStream) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });
        
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          // Extract available quality levels
          const levels = data.levels.map((level, index) => ({
            height: level.height,
            bitrate: level.bitrate,
            index,
          })).sort((a, b) => b.height - a.height);
          setHlsLevels(levels);
          setVideoQuality("Auto");
          setCurrentHlsLevel(-1);
        });
        
        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          if (level && currentHlsLevel === -1) {
            // Auto mode - update displayed quality
            const height = level.height;
            if (height >= 2160) setVideoQuality("Auto (4K)");
            else if (height >= 1440) setVideoQuality("Auto (1440p)");
            else if (height >= 1080) setVideoQuality("Auto (1080p)");
            else if (height >= 720) setVideoQuality("Auto (720p)");
            else setVideoQuality(`Auto (${height}p)`);
          }
        });
        
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setVideoError("Failed to load video stream");
                onError?.("HLS stream error");
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = src;
        setHlsLevels([]);
      }
    } else {
      // Regular video file
      video.src = src;
      setHlsLevels([]);
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isHlsStream]);
  
  // HLS quality change handler
  const changeHlsQuality = useCallback((levelIndex: number) => {
    if (!hlsRef.current) return;
    
    hlsRef.current.currentLevel = levelIndex;
    setCurrentHlsLevel(levelIndex);
    
    if (levelIndex === -1) {
      setVideoQuality("Auto");
    } else {
      const level = hlsRef.current.levels[levelIndex];
      if (level) {
        const height = level.height;
        if (height >= 2160) setVideoQuality("4K");
        else if (height >= 1440) setVideoQuality("1440p");
        else if (height >= 1080) setVideoQuality("1080p");
        else if (height >= 720) setVideoQuality("720p");
        else setVideoQuality(`${height}p`);
      }
    }
    setShowQualityMenu(false);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`bg-black rounded-xl overflow-hidden relative group w-full ${isWebView ? 'video-webview-container' : ''}`}
      style={{ 
        aspectRatio,
        maxHeight: isFullscreen ? '100vh' : 'calc(100vh - 180px)'
      }}
    >
      <video
        ref={videoRef}
        src={!isHlsStream || !Hls.isSupported() ? src : undefined}
        poster={poster}
        crossOrigin="anonymous"
        className="w-full h-full bg-black"
        style={{
          objectFit: 'contain',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          setIsPlaying(true);
          handleBufferingChange(false);
          onPlayStateChange?.(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          setIsBuffering(false);
          onPlayStateChange?.(false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onPlayStateChange?.(false);
        }}
        onLoadedMetadata={(e) => {
          const vid = e.currentTarget;
          setDuration(vid.duration);
          vid.volume = volume;
          vid.muted = isMuted;
          
          if (vid.videoWidth > 0 && vid.videoHeight > 0) {
            setAspectRatio(`${vid.videoWidth}/${vid.videoHeight}`);
            setNativeResolution({ width: vid.videoWidth, height: vid.videoHeight });
            
            const height = vid.videoHeight;
            if (height >= 2160) setVideoQuality("4K");
            else if (height >= 1440) setVideoQuality("1440p");
            else if (height >= 1080) setVideoQuality("1080p");
            else if (height >= 720) setVideoQuality("720p");
            else if (height >= 480) setVideoQuality("480p");
            else setVideoQuality(`${height}p`);
          } else {
            // Brave may report 0 initially
            setTimeout(() => {
              if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                setAspectRatio(`${vid.videoWidth}/${vid.videoHeight}`);
              }
            }, 500);
          }
          
          onLoadedMetadata?.(vid.duration, vid.videoWidth, vid.videoHeight);
        }}
        onError={() => {
          setVideoError("Video failed to load. This may be caused by antivirus software or browser settings blocking the video stream.");
          onError?.("Video failed to load");
        }}
        onSeeking={() => {
          const vid = videoRef.current;
          if (vid) {
            // Check if seeking to unbuffered region - show loading immediately
            let isBuffered = false;
            for (let i = 0; i < vid.buffered.length; i++) {
              if (vid.currentTime >= vid.buffered.start(i) && 
                  vid.currentTime <= vid.buffered.end(i)) {
                isBuffered = true;
                break;
              }
            }
            if (!isBuffered) {
              // Seeking to unbuffered content - show loading immediately
              setIsBuffering(true);
            }
          }
        }}
        onSeeked={() => {
          // Don't clear buffering here - let onCanPlay/onPlaying handle it
          // Only clear if we have buffered data at current position
          const vid = videoRef.current;
          if (vid) {
            for (let i = 0; i < vid.buffered.length; i++) {
              if (vid.currentTime >= vid.buffered.start(i) && 
                  vid.buffered.end(i) - vid.currentTime > 0.5) {
                handleBufferingChange(false);
                return;
              }
            }
          }
        }}
        onStalled={() => handleBufferingChange(true)}
        onWaiting={() => {
          const vid = videoRef.current;
          if (vid && vid.buffered.length > 0) {
            for (let i = 0; i < vid.buffered.length; i++) {
              if (vid.currentTime >= vid.buffered.start(i) && 
                  vid.buffered.end(i) - vid.currentTime > 0.5) {
                return;
              }
            }
          }
          handleBufferingChange(true);
        }}
        onCanPlay={() => {
          setVideoError(null);
          handleBufferingChange(false);
        }}
        onPlaying={() => {
          handleBufferingChange(false);
          setVideoError(null);
        }}
        onProgress={(e) => {
          const vid = e.currentTarget;
          if (vid.buffered.length > 0 && vid.duration > 0) {
            const bufferedEnd = vid.buffered.end(vid.buffered.length - 1);
            const newPercent = (bufferedEnd / vid.duration) * 100;
            if (Math.abs(newPercent - lastBufferedRef.current) >= 10) {
              lastBufferedRef.current = newPercent;
              setBufferedPercent(newPercent);
            }
          }
        }}
        preload="auto"
        playsInline
      />
      
      {/* Buffering overlay */}
      {isBuffering && !videoError && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-5 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-white/80 text-sm font-medium">
              {translations.buffering || 'Buffering...'}
            </span>
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
          <h3 className="text-white font-semibold text-lg mb-2">{translations.videoPlaybackIssue || 'Video Playback Issue'}</h3>
          <p className="text-slate-400 text-center max-w-md mb-4">{videoError}</p>
          <div className="text-sm text-slate-500 text-center space-y-1">
            <p>{translations.tryTheseFixes || 'Try these fixes:'}</p>
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
              {translations.tryAgain || 'Try Again'}
            </button>
            <button
              onClick={() => window.open(src, '_blank')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              {translations.openInNewTab || 'Open in New Tab'}
            </button>
          </div>
        </div>
      )}
      
      {/* Click to play/pause overlay */}
      <div 
        className="absolute inset-0 cursor-pointer"
        onClick={togglePlay}
      >
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
              <Play className="w-10 h-10 text-white fill-white ml-1" />
            </div>
          </div>
        )}
      </div>
      
      {/* Video controls bar */}
      <div 
        ref={controlsBarRef}
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pb-2 pt-8"
      >
        {/* Progress bar - larger touch target on mobile */}
        <div 
          ref={progressBarRef}
          className={`mx-3 sm:mx-4 mb-2 h-1.5 sm:h-1 bg-white/30 rounded-full cursor-pointer sm:hover:h-2 transition-all group/progress relative ${isDragging ? 'h-2' : ''}`}
          onMouseDown={handleProgressMouseDown}
          onTouchStart={handleProgressTouchStart}
          style={{ touchAction: 'none' }}
        >
          {/* Invisible larger touch area for mobile */}
          <div className="absolute -inset-y-3 inset-x-0 sm:hidden" />
          <div 
            className="absolute inset-y-0 left-0 bg-white/40 rounded-full pointer-events-none"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div 
            className="h-full bg-teal-500 rounded-full relative pointer-events-none z-10"
            style={{ width: `${((currentTime / (duration || 600)) * 100)}%` }}
          >
            <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3 sm:h-3 bg-teal-400 rounded-full transition-opacity ${isDragging ? 'opacity-100 scale-110' : 'opacity-100 sm:opacity-0 sm:group-hover/progress:opacity-100'}`} />
          </div>
        </div>
        
        {/* Controls row */}
        <div className="flex items-center justify-between px-2 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={togglePlay} className="text-white active:text-teal-400 sm:hover:text-teal-400 transition-colors p-1 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-0 flex items-center justify-center">
              {isPlaying ? <Pause className="w-6 h-6 sm:w-6 sm:h-6" /> : <Play className="w-6 h-6 sm:w-6 sm:h-6 fill-current" />}
            </button>
            
            <div className="flex items-center gap-1 group/volume relative">
              <button 
                onClick={toggleMute} 
                className="text-white active:text-teal-400 sm:hover:text-teal-400 transition-colors p-1 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-0 flex items-center justify-center"
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
              {!/iPad|iPhone|iPod/.test(navigator.userAgent) && (
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/volume:w-20 transition-all duration-200 accent-teal-500 cursor-pointer hidden sm:block"
                />
              )}
            </div>
            
            <span className="text-white text-xs sm:text-sm">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => {
                  setShowQualityMenu(!showQualityMenu);
                  setShowSpeedMenu(false);
                }}
                className="text-white active:text-teal-400 sm:hover:text-teal-400 transition-colors text-xs sm:text-sm font-medium px-2 py-1 rounded active:bg-white/10 sm:hover:bg-white/10 flex items-center gap-1 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 justify-center"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">{videoQuality}</span>
              </button>
              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-slate-900 rounded-lg shadow-xl border border-white/10 py-2 min-w-[140px]">
                  <div className="px-3 pb-2 mb-2 border-b border-white/10">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Quality</span>
                  </div>
                  {hlsLevels.length > 0 ? (
                    <>
                      <button
                        onClick={() => changeHlsQuality(-1)}
                        className={`w-full px-3 py-1.5 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                          currentHlsLevel === -1 ? 'text-teal-400' : 'text-white'
                        }`}
                      >
                        {currentHlsLevel === -1 && <span className="w-2 h-2 rounded-full bg-teal-400"></span>}
                        Auto
                      </button>
                      {hlsLevels.map((level) => {
                        const label = level.height >= 2160 ? '4K' : 
                                     level.height >= 1440 ? '1440p' : 
                                     level.height >= 1080 ? '1080p' : 
                                     level.height >= 720 ? '720p' : 
                                     `${level.height}p`;
                        return (
                          <button
                            key={level.index}
                            onClick={() => changeHlsQuality(level.index)}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                              currentHlsLevel === level.index ? 'text-teal-400' : 'text-white'
                            }`}
                          >
                            {currentHlsLevel === level.index && <span className="w-2 h-2 rounded-full bg-teal-400"></span>}
                            {label}
                            <span className="text-gray-500 text-xs ml-auto">
                              {Math.round(level.bitrate / 1000)}kbps
                            </span>
                          </button>
                        );
                      })}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => {
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowQualityMenu(false);
                }}
                className="text-white active:text-teal-400 sm:hover:text-teal-400 transition-colors text-xs sm:text-sm font-medium px-2 py-1 rounded active:bg-white/10 sm:hover:bg-white/10 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
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
            
            <button onClick={toggleFullscreen} className="text-white active:text-teal-400 sm:hover:text-teal-400 transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoPlayerInner.displayName = 'VideoPlayerInner';

// Export memoized version to prevent re-renders from parent state changes
export const VideoPlayer = memo(VideoPlayerInner);
