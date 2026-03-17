import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, Clock, ArrowLeft, Video, Headphones, Calendar, Users, ChevronDown, ChevronUp, Check, Share2, Loader2, X, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { usePodcast, useMusicActions, ApiEpisode } from '../hooks/useMusic';
import { AudioTrack } from '../components/AudioPlayer';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackActionsMenu from '../components/TrackActionsMenu';
import { PriceBadge } from '../components/PriceBadge';
import LocalizedLink from '../components/LocalizedLink';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

function formatLongDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSubscribers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function Podcast() {
  const { podcastId } = useParams();
  const navigate = useNavigate();
  const { playPlaylist, currentTrack, isPlaying, isPlayerVisible } = useAudioPlayer();
  const { theme } = useMusicTheme();
  const { titleBarPadding } = useElectronTitleBar();
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [isFollowed, setIsFollowed] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  
  // Video player state
  const [videoEpisode, setVideoEpisode] = useState<ApiEpisode | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const { podcast, loading, error } = usePodcast(podcastId ? parseInt(podcastId) : undefined);
  const { subscribedPodcasts, toggleSubscribe, recordEpisodePlay, fetchUserStatus } = useMusicActions();
  const videoPlayRecordedRef = useRef<Set<number>>(new Set());

  // Fetch subscription status on page load
  useEffect(() => {
    if (podcast) {
      fetchUserStatus([], [podcast.id]);
    }
  }, [podcast?.id, fetchUserStatus]);

  useEffect(() => {
    if (podcast) {
      setIsFollowed(subscribedPodcasts.has(podcast.id));
    }
  }, [podcast, subscribedPodcasts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#70C7BA]" />
      </div>
    );
  }

  if (error || !podcast) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Podcast not found</h1>
          <p className="text-white/60 mb-4">{error || "The podcast you're looking for doesn't exist."}</p>
          <button onClick={() => navigate(-1)} className="text-[#70C7BA] hover:underline">
            Back
          </button>
        </div>
      </div>
    );
  }

  const episodes = podcast.episodes || [];

  const convertEpisodeToTrack = (episode: ApiEpisode): AudioTrack => ({
    id: episode.id,
    title: episode.title,
    artist: podcast.host.name,
    durationSeconds: episode.durationSeconds || 0,
    albumTitle: podcast.title,
    audioUrl: episode.audioUrl || episode.videoUrl || '',
    coverArtUrl: episode.coverArtUrl || podcast.coverArtUrl || 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80',
    contentType: 'episode',
    chapters: episode.chapters,
    priceKas: episode.priceKas,
    creatorWallet: episode.creatorWallet,
  });

  const handlePlayEpisode = (episode: ApiEpisode) => {
    // If episode has video, open video player
    if (episode.videoUrl) {
      setVideoEpisode(episode);
      setVideoPlaying(true);
      return;
    }
    // Otherwise use audio player
    const tracks = episodes.map(ep => convertEpisodeToTrack(ep));
    const index = episodes.findIndex(ep => ep.id === episode.id);
    playPlaylist(tracks, index);
  };

  const isEpisodePlaying = (episodeId: number) => {
    if (videoEpisode?.id === episodeId) return videoPlaying;
    return currentTrack?.id === episodeId && isPlaying;
  };

  const toggleEpisodeExpand = (episodeId: number) => {
    setExpandedEpisode(expandedEpisode === episodeId ? null : episodeId);
  };

  const handleToggleFollow = async () => {
    await toggleSubscribe(podcast.id);
    setIsFollowed(!isFollowed);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShowShareCopied(true);
      setTimeout(() => setShowShareCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setShowShareCopied(true);
      setTimeout(() => setShowShareCopied(false), 2000);
    }
  };
  
  // Video player controls
  const toggleVideoPlay = () => {
    if (!videoRef.current) return;
    if (videoPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setVideoPlaying(!videoPlaying);
  };
  
  const closeVideoPlayer = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setVideoEpisode(null);
    setVideoPlaying(false);
    setVideoProgress(0);
    setVideoDuration(0);
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };
  
  const toggleVideoFullscreen = async () => {
    if (!videoContainerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setVideoFullscreen(false);
    } else {
      await videoContainerRef.current.requestFullscreen();
      setVideoFullscreen(true);
    }
  };
  
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !videoEpisode) return;
    const currentTime = videoRef.current.currentTime;
    setVideoProgress(currentTime);
    
    // Record play count after 10 seconds of playback
    if (currentTime >= 10 && !videoPlayRecordedRef.current.has(videoEpisode.id)) {
      videoPlayRecordedRef.current.add(videoEpisode.id);
      console.log('[Podcast] Recording video episode play after 10s:', videoEpisode.id);
      recordEpisodePlay(videoEpisode.id, currentTime, undefined, false);
    }
  };
  
  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current) return;
    setVideoDuration(videoRef.current.duration);
  };
  
  const handleVideoSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setVideoProgress(time);
  };

  const accentColor = theme.accent;

  return (
    <div className={`min-h-screen relative text-white w-full overflow-x-hidden ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      <div className={`relative z-10 w-full overflow-x-hidden ${isPlayerVisible ? 'pb-32' : 'pb-8'}`}>
        {/* Header */}
        <div className="relative pt-16 sm:pt-20 pb-6 sm:pb-8 px-3 sm:px-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-4 sm:mb-6 transition-colors text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back
        </button>

        <div className="max-w-5xl mx-auto">
          {/* Unified gradient backdrop for cover and info */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-black/60 via-black/50 to-black/30 rounded-3xl backdrop-blur-sm" />
            <div className="relative flex flex-col md:flex-row gap-4 sm:gap-8 items-center md:items-start p-2">
          {/* Cover Art */}
          <div className="relative w-40 h-40 sm:w-64 sm:h-64 flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              <img
                src={podcast.coverArtUrl || 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80'}
                alt={podcast.title}
                className="w-full h-full object-cover"
              />
            </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2 flex-wrap">
                {podcast.isVideoPodcast ? (
                  <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-purple-500/30 text-purple-200 rounded-full text-xs font-medium border border-purple-400/30">
                    <Video className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Video Podcast
                  </span>
                ) : (
                  <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-blue-500/30 text-blue-200 rounded-full text-xs font-medium border border-blue-400/30">
                    <Headphones className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Audio Podcast
                  </span>
                )}
                {podcast.category && (
                  <span className="px-2 sm:px-2.5 py-1 bg-white/15 rounded-full text-xs font-medium text-white/90 border border-white/20">
                    {podcast.category}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-4xl font-bold mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{podcast.title}</h1>
              <p className="text-base sm:text-xl text-white/90 mb-3 sm:mb-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Hosted by{' '}
                {podcast.host.id ? (
                  <LocalizedLink 
                    to={`/music/artist/${podcast.host.id}`}
                    className="hover:underline hover:text-white transition-colors"
                    style={{ color: accentColor }}
                  >
                    {podcast.host.name}
                  </LocalizedLink>
                ) : (
                  <span>{podcast.host.name}</span>
                )}
              </p>
            {podcast.description && (
              <p className="text-sm sm:text-base text-white/70 mb-4 sm:mb-6 max-w-2xl leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {podcast.description}
              </p>
            )}

            <div className="flex items-center justify-center md:justify-start gap-4 sm:gap-6 text-xs sm:text-sm text-white/70 mb-4 sm:mb-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              <span className="flex items-center gap-1.5 sm:gap-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {formatSubscribers(podcast.followerCount)} followers
              </span>
              <span className="flex items-center gap-1.5 sm:gap-2">
                <Headphones className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {episodes.length} episodes
              </span>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3 sm:gap-4">
              {episodes.length > 0 && (
                <button
                  onClick={() => handlePlayEpisode(episodes[0])}
                  className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold transition-all hover:scale-105 text-sm sm:text-base"
                  style={{ backgroundColor: accentColor, color: '#000' }}
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
                  Play Latest
                </button>
              )}
              <button
                onClick={handleToggleFollow}
                className={`flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold transition-all border text-sm sm:text-base ${
                  isFollowed
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'border-white/30 text-white hover:bg-white/10'
                }`}
              >
                {isFollowed ? (
                  <>
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                    Following
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                    Follow
                  </>
                )}
              </button>
              <button 
                onClick={handleShare}
                className="p-2.5 sm:p-3 rounded-full border border-white/30 text-white hover:bg-white/10 transition-colors relative"
              >
                {showShareCopied ? (
                  <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                ) : (
                  <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
        </div>
        </div>
        </div>

        {/* Episodes List */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 mt-6 sm:mt-8">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">All Episodes</h2>
        
        {episodes.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-6 sm:p-8 text-center">
            <p className="text-white/60 text-sm sm:text-base">No episodes yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {[...episodes].sort((a, b) => {
              // Sort by publishedAt descending (newest first)
              const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
              const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
              return dateB - dateA;
            }).map((episode, index, arr) => {
              const isExpanded = expandedEpisode === episode.id;
              const isCurrentlyPlaying = isEpisodePlaying(episode.id);
              // Higher z-index for cards higher in the list so dropdowns appear above cards below
              const cardZIndex = arr.length - index;

              return (
                <div
                  key={episode.id}
                  className={`relative bg-black/40 backdrop-blur-sm rounded-xl transition-all border border-white/10 ${
                    isCurrentlyPlaying ? 'ring-2 ring-[#70C7BA]' : ''
                  }`}
                  style={{ zIndex: cardZIndex }}
                >
                  <div className="p-3 sm:p-5">
                    <div className="flex items-start gap-2 sm:gap-4">
                      {/* Episode Number */}
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center flex-shrink-0 text-sm sm:text-lg font-bold text-white">
                        {episodes.length - index}
                      </div>

                      {/* Episode Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-sm sm:text-lg truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{episode.title}</h3>
                          <PriceBadge priceKas={episode.priceKas} />
                          {episode.hasVideo && (
                            <span className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 bg-purple-600/50 text-purple-100 rounded text-xs font-medium border border-purple-400/40">
                              <Video className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              <span className="hidden sm:inline">Video</span>
                            </span>
                          )}
                          {episode.chapters && episode.chapters.length > 0 && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-blue-600/50 text-blue-100 rounded text-xs font-medium border border-blue-400/40 hidden sm:inline">
                              {episode.chapters.length} chapters
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-white/70 mb-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            {formatDate(episode.publishedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            {formatLongDuration(episode.durationSeconds || 0)}
                          </span>
                          <span className="flex items-center gap-1 hidden sm:flex">
                            <Headphones className="w-3.5 h-3.5" />
                            {episode.playCount || 0} plays
                          </span>
                        </div>

                        {episode.description && (
                          <p className={`text-white/70 text-xs sm:text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {episode.description}
                          </p>
                        )}

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10 space-y-3 sm:space-y-4">
                            {/* Show "No chapters" message if no chapters */}
                            {(!episode.chapters || episode.chapters.length === 0) && (
                              <div className="text-xs sm:text-sm text-white/50 italic">
                                No chapters for this episode
                              </div>
                            )}
                            
                            {/* Chapters */}
                            {episode.chapters && episode.chapters.length > 0 && (
                              <div className="p-3 sm:p-4 bg-black/30 rounded-lg">
                                <h4 className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3 text-white/70">Chapters</h4>
                                <div className="space-y-2">
                                  {episode.chapters.map((chapter) => (
                                    <div
                                      key={chapter.id}
                                      className="flex items-center justify-between text-xs sm:text-sm"
                                    >
                                      <span className="text-white/80">{chapter.title}</span>
                                      <span className="text-white/50 font-mono text-xs">
                                        {formatLongDuration(chapter.startTimeSeconds)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <TrackActionsMenu 
                          track={episode} 
                          podcast={podcast}
                          accent={accentColor}
                          iconSize={5}
                        />
                        <button
                          onClick={() => toggleEpisodeExpand(episode.id)}
                          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                          ) : (
                            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => handlePlayEpisode(episode)}
                          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all hover:scale-110"
                          style={{ backgroundColor: accentColor }}
                        >
                          {isCurrentlyPlaying ? (
                            <div className="flex items-center gap-0.5">
                              <span className="w-0.5 sm:w-1 h-3 sm:h-4 bg-black rounded-full animate-pulse" />
                              <span className="w-0.5 sm:w-1 h-2 sm:h-3 bg-black rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                              <span className="w-0.5 sm:w-1 h-4 sm:h-5 bg-black rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                            </div>
                          ) : (
                            <Play className="w-4 h-4 sm:w-5 sm:h-5 text-black" fill="currentColor" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Video Player Modal */}
      {videoEpisode && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-4">
          <div 
            ref={videoContainerRef}
            className="relative w-full max-w-5xl"
          >
            {/* Close button */}
            <button
              onClick={closeVideoPlayer}
              className="absolute -top-10 sm:-top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </button>
            
            {/* Video container */}
            <div className="relative bg-black rounded-lg sm:rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                src={videoEpisode.videoUrl}
                className="w-full aspect-video"
                autoPlay
                muted={videoMuted}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onEnded={() => setVideoPlaying(false)}
                crossOrigin="anonymous"
              />
              
              {/* Video controls overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-4">
                {/* Progress bar */}
                <div className="mb-2 sm:mb-3">
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 100}
                    value={videoProgress}
                    onChange={handleVideoSeek}
                    className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </div>
                
                {/* Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <button
                      onClick={toggleVideoPlay}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
                      style={{ backgroundColor: accentColor }}
                    >
                      {videoPlaying ? (
                        <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-black" fill="currentColor" />
                      ) : (
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 text-black" fill="currentColor" />
                      )}
                    </button>
                    
                    <button
                      onClick={() => setVideoMuted(!videoMuted)}
                      className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                      {videoMuted ? (
                        <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      ) : (
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      )}
                    </button>
                    
                    <span className="text-white/70 text-xs sm:text-sm font-mono">
                      {formatLongDuration(Math.floor(videoProgress))} / {formatLongDuration(Math.floor(videoDuration))}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-white">
                      <h3 className="font-semibold text-sm">{videoEpisode.title}</h3>
                      <p className="text-white/60 text-xs">{podcast?.title}</p>
                    </div>
                    
                    <button
                      onClick={toggleVideoFullscreen}
                      className="p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                      {videoFullscreen ? (
                        <Minimize2 className="w-5 h-5 text-white" />
                      ) : (
                        <Maximize2 className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
