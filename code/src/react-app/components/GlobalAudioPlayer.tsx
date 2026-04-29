import { useState, useCallback } from 'react';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import AudioPlayer, { AudioTrack } from './AudioPlayer';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useLocalizedNavigate } from './LanguageRouter';
import { useMusicActions, useUserPlaylists, usePlaylistActions } from '../hooks/useMusic';
import { useMusicPurchase } from '../hooks/useMusicPurchase';
import { useWallet } from '../contexts/WalletContext';
import ReviewModal from './ReviewModal';

export default function GlobalAudioPlayer() {
  const { 
    currentTrack, 
    playlist, 
    currentIndex, 
    isPlaying,
    isPlayerVisible,
    setIsPlaying,
    toggleLike: toggleLikeLocal,
    nextTrack,
    previousTrack,
    playPlaylist,
    queue,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    playFromQueue,
    volume,
    audioEnhancement,
    setVolume,
    setAudioEnhancement,
    addFullyListenedTrack,
    closePlayer,
  } = useAudioPlayer();
  
  const { theme } = useMusicTheme();
  const navigate = useLocalizedNavigate();
  const { toggleLike: toggleLikeApi, recordTrackPlay, recordEpisodePlay } = useMusicActions();
  const { playlists, refetch: refreshPlaylists } = useUserPlaylists();
  const { addTrackToPlaylist } = usePlaylistActions();
  const { purchaseContent, isPurchasing } = useMusicPurchase();
  const { isConnected, externalWallet, refreshBalance } = useWallet();
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [reviewTrack, setReviewTrack] = useState<AudioTrack | null>(null);
  
  // Check if user has any wallet connection
  const isWalletConnected = isConnected || !!externalWallet;

  // All hooks must be called before any early returns
  const handleLike = useCallback(async (trackId: number) => {
    // Update local state immediately for responsive UI
    toggleLikeLocal(trackId);
    // Call API to persist the like
    await toggleLikeApi(trackId);
  }, [toggleLikeLocal, toggleLikeApi]);

  const handleAddToPlaylist = useCallback(async (playlistId: number) => {
    if (!currentTrack) {
      console.log('[GlobalAudioPlayer] No current track for add to playlist');
      return;
    }
    try {
      console.log('[GlobalAudioPlayer] Adding track', currentTrack.id, 'to playlist', playlistId);
      await addTrackToPlaylist(playlistId, currentTrack.id);
      console.log('[GlobalAudioPlayer] Successfully added to playlist');
      setShowPlaylistMenu(false);
      refreshPlaylists();
    } catch (err) {
      console.error('[GlobalAudioPlayer] Failed to add to playlist:', err);
    }
  }, [currentTrack, addTrackToPlaylist, refreshPlaylists]);

  const handleTrackChange = useCallback((index: number) => {
    // Change to specific track in playlist
    if (playlist.length > 0 && index >= 0 && index < playlist.length) {
      playPlaylist(playlist, index);
    }
  }, [playlist, playPlaylist]);

  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, [setIsPlaying]);

  const handleGoToArtist = useCallback((artistId: number, artistHandle?: string) => {
    // Navigate to artist page - prefer handle for cleaner URLs
    const identifier = artistHandle || artistId;
    navigate(`/music/artist/${identifier}`);
  }, [navigate]);

  const handleStartRadio = useCallback(() => {
    // Navigate to radio with current track context
    navigate('/music/library/radio');
  }, [navigate]);

  const handleTogglePlaylistMenu = useCallback(() => {
    refreshPlaylists();
    setShowPlaylistMenu(prev => !prev);
  }, [refreshPlaylists]);

  const handlePurchaseRequired = useCallback(async (track: AudioTrack): Promise<boolean> => {
    if (!track.priceKas || !track.creatorWallet || !track.contentType) {
      console.log('[GlobalAudioPlayer] Missing purchase info for track:', track.id);
      return false;
    }
    
    if (!isConnected && !externalWallet) {
      console.log('[GlobalAudioPlayer] User not logged in, skipping purchase');
      return false;
    }
    
    if (isPurchasing) {
      console.log('[GlobalAudioPlayer] Purchase already in progress');
      return false;
    }
    
    console.log('[GlobalAudioPlayer] Processing purchase for:', track.title, 'price:', track.priceKas);
    
    const result = await purchaseContent(
      track.contentType,
      track.id,
      track.priceKas,
      track.creatorWallet
    );
    
    if (result.success) {
      console.log('[GlobalAudioPlayer] Purchase successful for track:', track.id);
      refreshBalance();
      return true;
    } else {
      console.log('[GlobalAudioPlayer] Purchase failed:', result.error);
      return false;
    }
  }, [isConnected, externalWallet, isPurchasing, purchaseContent, refreshBalance]);

  const handleTrackPlayed = useCallback((track: AudioTrack, durationPlayed: number, completed: boolean) => {
    if (track.contentType === 'episode') {
      recordEpisodePlay(track.id, durationPlayed, undefined, completed);
    } else {
      recordTrackPlay(track.id, durationPlayed, completed);
    }
  }, [recordTrackPlay, recordEpisodePlay]);

  const handleWalletRequired = useCallback(() => {
    alert('Please connect a wallet to play paid content');
    navigate('/music');
  }, [navigate]);

  const handleFullListenComplete = useCallback((track: AudioTrack) => {
    console.log('[GlobalAudioPlayer] Full listen completed for track:', track.id, track.title);
    addFullyListenedTrack(track.id);
    // Review button will appear next to the track in track lists - no popup
  }, [addFullyListenedTrack]);

  // Early return AFTER all hooks are called
  if (!isPlayerVisible || !currentTrack) return null;

  return (
    <>
      <AudioPlayer
        track={currentTrack}
        playlist={playlist}
        currentIndex={currentIndex}
        onTrackChange={handleTrackChange}
        onNext={nextTrack}
        onPrevious={previousTrack}
        onLike={handleLike}
        onPlayStateChange={handlePlayStateChange}
        accent={theme.accent}
        showMiniPlayer={true}
        externalIsPlaying={isPlaying}
        queue={queue}
        onAddToQueue={addToQueue}
        onRemoveFromQueue={removeFromQueue}
        onReorderQueue={reorderQueue}
        onClearQueue={clearQueue}
        onPlayFromQueue={playFromQueue}
        onGoToArtist={handleGoToArtist}
        onStartRadio={handleStartRadio}
        userPlaylists={playlists}
        onAddToPlaylist={handleAddToPlaylist}
        showPlaylistMenu={showPlaylistMenu}
        onTogglePlaylistMenu={handleTogglePlaylistMenu}
        externalVolume={volume}
        externalAudioEnhancement={audioEnhancement}
        onVolumeChange={setVolume}
        onAudioEnhancementChange={setAudioEnhancement}
        onPurchaseRequired={handlePurchaseRequired}
        onTrackPlayed={handleTrackPlayed}
        isWalletConnected={isWalletConnected}
        onWalletRequired={handleWalletRequired}
        onFullListenComplete={handleFullListenComplete}
        onClose={closePlayer}
      />
      
      {reviewTrack && (
        <ReviewModal
          track={reviewTrack}
          onClose={() => setReviewTrack(null)}
          onSubmitted={() => refreshBalance()}
        />
      )}
    </>
  );
}
