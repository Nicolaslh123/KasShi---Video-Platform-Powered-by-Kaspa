import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MoreHorizontal, ThumbsUp, ListPlus,
  Check, Loader2, ListMusic, ChevronRight, Link
} from 'lucide-react';
import { AudioTrack } from './AudioPlayer';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useMusicActions, useUserPlaylists, usePlaylistActions, apiTrackToAudioTrack, apiEpisodeToAudioTrack, ApiTrack, ApiEpisode, ApiPodcast } from '../hooks/useMusic';
import { useWallet } from '../contexts/WalletContext';

interface TrackActionsMenuProps {
  track: AudioTrack | ApiTrack | ApiEpisode;
  // For podcast episodes, provide podcast context for proper conversion
  podcast?: ApiPodcast | { title: string; host: { name: string }; coverArtUrl?: string };
  accent?: string;
  onLikeToggle?: (liked: boolean) => void;
  className?: string;
  iconSize?: number;
  /** Pre-known like status to avoid needing to fetch */
  initialIsLiked?: boolean;
}

export default function TrackActionsMenu({ 
  track, 
  podcast,
  accent = '#70C7BA',
  onLikeToggle,
  className = '',
  iconSize = 4,
  initialIsLiked
}: TrackActionsMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState<number | null>(null);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isLiked, setIsLiked] = useState(initialIsLiked ?? false);
  const [menuPosition, setMenuPosition] = useState<'below' | 'above'>('below');
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  
  const { addToQueue } = useAudioPlayer();
  const { toggleLike } = useMusicActions();
  const { playlists } = useUserPlaylists();
  const { addTrackToPlaylist } = usePlaylistActions();
  const { externalWallet } = useWallet();
  
  const trackId = track.id;
  
  // Fetch like status when menu opens
  const fetchLikeStatus = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (externalWallet?.authToken) {
        headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
      }
      const res = await fetch(`/api/music/user-status?trackIds=${trackId}`, {
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setIsLiked(data.likedTracks?.includes(trackId) ?? false);
      }
    } catch (err) {
      console.error('Failed to fetch like status:', err);
    }
  }, [trackId, externalWallet?.authToken]);
  
  // Check if this is a podcast episode
  const isPodcastEpisode = 'episodeNumber' in track || 'seasonNumber' in track;

  // Convert to AudioTrack if needed
  const getAudioTrack = (): AudioTrack => {
    // Already an AudioTrack
    if ('audioUrl' in track && typeof track.audioUrl === 'string' && !isPodcastEpisode) {
      return track as AudioTrack;
    }
    // Podcast episode - convert with podcast context
    if (isPodcastEpisode) {
      return apiEpisodeToAudioTrack(track as ApiEpisode, podcast);
    }
    // Regular track
    return apiTrackToAudioTrack(track as ApiTrack);
  };

  // Fetch like status and calculate position when menu opens
  useEffect(() => {
    if (showMenu) {
      fetchLikeStatus();
      
      // Calculate if menu should appear above or below
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const menuHeight = 200; // Approximate menu height
        setMenuPosition(spaceBelow < menuHeight ? 'above' : 'below');
      }
    }
  }, [showMenu, fetchLikeStatus]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowPlaylistSubmenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (likeLoading) return;
    
    setLikeLoading(true);
    try {
      const newLiked = await toggleLike(trackId);
      setIsLiked(newLiked);
      onLikeToggle?.(newLiked);
    } finally {
      setLikeLoading(false);
    }
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audioTrack = getAudioTrack();
    addToQueue(audioTrack);
    setAddedToQueue(true);
    setTimeout(() => {
      setAddedToQueue(false);
      setShowMenu(false);
    }, 1000);
  };

  const handleAddToPlaylist = async (e: React.MouseEvent, playlistId: number) => {
    e.stopPropagation();
    if (addingToPlaylist !== null) return;
    
    setAddingToPlaylist(playlistId);
    try {
      await addTrackToPlaylist(playlistId, trackId);
      setTimeout(() => {
        setAddingToPlaylist(null);
        setShowPlaylistSubmenu(false);
        setShowMenu(false);
      }, 500);
    } catch (err) {
      console.error('Failed to add to playlist:', err);
      setAddingToPlaylist(null);
    }
  };

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowMenu(!showMenu);
    setShowPlaylistSubmenu(false);
  };

  // Calculate icon dimensions - iconSize > 10 is treated as pixel value, otherwise multiply by 4
  const iconDimension = iconSize > 10 ? iconSize : iconSize * 4;

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        onClick={handleToggleMenu}
        className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
      >
        <MoreHorizontal style={{ width: iconDimension, height: iconDimension }} />
      </button>

      {showMenu && (
        <div 
          ref={mainMenuRef}
          className={`absolute right-0 w-56 bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 overflow-visible z-50 ${
            menuPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Like */}
          <button
            onClick={handleLike}
            disabled={likeLoading}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left disabled:opacity-50"
          >
            {likeLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ThumbsUp 
                className="w-4 h-4" 
                fill={isLiked ? accent : 'none'} 
                style={{ color: isLiked ? accent : undefined }}
              />
            )}
            {isLiked ? 'Remove from Liked' : 'Add to Liked Songs'}
          </button>

          {/* Add to Queue */}
          <button
            onClick={handleAddToQueue}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
          >
            {addedToQueue ? (
              <>
                <Check className="w-4 h-4" style={{ color: accent }} />
                <span style={{ color: accent }}>Added to queue</span>
              </>
            ) : (
              <>
                <ListPlus className="w-4 h-4" />
                Add to queue
              </>
            )}
          </button>

          {/* Copy Song Link */}
          <button
            onClick={() => {
              const trackUrl = `${window.location.origin}/music/track/${track.id}`;
              navigator.clipboard.writeText(trackUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4" style={{ color: accent }} />
                <span style={{ color: accent }}>Link copied!</span>
              </>
            ) : (
              <>
                <Link className="w-4 h-4" />
                Copy song link
              </>
            )}
          </button>

          {/* Add to Playlist */}
          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowPlaylistSubmenu(prev => !prev);
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors text-left cursor-pointer"
            >
              <span className="flex items-center gap-3">
                <ListMusic className="w-4 h-4" />
                Add to playlist
              </span>
              <ChevronRight className={`w-4 h-4 text-white/60 transition-transform duration-200 ${showPlaylistSubmenu ? 'rotate-90' : ''}`} />
            </button>

            {/* Inline playlist list (stacked vertically) */}
            {showPlaylistSubmenu && (
              <div className="border-t border-white/20 bg-slate-800/80 max-h-48 overflow-y-auto">
                {playlists.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-white/60 text-center">
                    No playlists yet
                  </div>
                ) : (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={(e) => handleAddToPlaylist(e, playlist.id)}
                      disabled={addingToPlaylist !== null}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {playlist.coverArtUrl ? (
                          <img src={playlist.coverArtUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ListMusic className="w-3.5 h-3.5 text-white/40" />
                        )}
                      </div>
                      <span className="truncate flex-1">{playlist.title}</span>
                      {addingToPlaylist === playlist.id && (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: accent }} />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
