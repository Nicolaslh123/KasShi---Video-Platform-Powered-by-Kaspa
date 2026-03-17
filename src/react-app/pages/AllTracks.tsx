import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Music, Play, Loader2, ArrowLeft, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { useWallet } from '../contexts/WalletContext';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { apiTrackToAudioTrack, ApiTrack } from '../hooks/useMusic';
import { AudioTrack } from '../components/AudioPlayer';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import PriceBadge from '../components/PriceBadge';
import { TrackRating } from '../components/TrackRating';
import ReviewButton from '../components/ReviewButton';

const TRACKS_PER_PAGE = 30;

export default function AllTracks() {
  const { theme } = useMusicTheme();
  const { playPlaylist, currentTrack, isPlaying, hasFullyListened } = useAudioPlayer();
  const { externalWallet } = useWallet();
  const goBack = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { titleBarPadding } = useElectronTitleBar();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalTracks, setTotalTracks] = useState(0);
  
  const currentPage = parseInt(searchParams.get('page') || '1');
  const totalPages = Math.ceil(totalTracks / TRACKS_PER_PAGE);

  useEffect(() => {
    const fetchTracks = async () => {
      setLoading(true);
      try {
        // Fetch reviewed tracks first
        const reviewedRes = await fetch('/api/music/user/reviewed-tracks', {
          credentials: 'include',
          headers: externalWallet?.authToken ? { 'Authorization': `Bearer ${externalWallet.authToken}` } : {},
        });
        const reviewedIds = new Set<number>();
        if (reviewedRes.ok) {
          const reviewedData = await reviewedRes.json();
          (reviewedData.trackIds || []).forEach((id: number) => reviewedIds.add(id));
        }
        
        const offset = (currentPage - 1) * TRACKS_PER_PAGE;
        const response = await fetch(`/api/music/tracks?limit=${TRACKS_PER_PAGE}&offset=${offset}`);
        if (!response.ok) throw new Error('Failed to fetch tracks');
        const data = await response.json();
        setTracks((data.tracks || []).map((t: ApiTrack) => ({
          ...apiTrackToAudioTrack(t),
          isReviewed: reviewedIds.has(t.id),
        })));
        setTotalTracks(data.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tracks');
      } finally {
        setLoading(false);
      }
    };
    fetchTracks();
  }, [currentPage, externalWallet?.authToken]);

  const handlePlayTrack = (index: number) => {
    playPlaylist(tracks, index);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString() });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('ellipsis');
      }
      
      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
      }
      
      // Always show last page
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className={`min-h-screen relative w-full overflow-x-hidden ${titleBarPadding}`} style={{ backgroundColor: theme.background }}>
      <AnimatedBackground themeId={theme.id || 'default'} accent={theme.accent} />
      
      <div className="relative z-10 w-full overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => goBack(-1)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-1.5 sm:gap-2">
              <Music className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
              All Tracks
            </h1>
            <LocalizedLink 
              to="/music/leaderboard"
              className="ml-auto flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-white/10 transition-colors text-white text-sm sm:text-base"
            >
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />
              <span className="hidden sm:inline">Leaderboard</span>
            </LocalizedLink>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {/* Track count header */}
          {!loading && !error && tracks.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-white/60">
                {totalTracks} {totalTracks === 1 ? 'track' : 'tracks'} total
              </p>
              {totalPages > 1 && (
                <p className="text-sm text-white/60">
                  Page {currentPage} of {totalPages}
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.accent }} />
              <span className="ml-3 text-white/70">Loading tracks...</span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-white/60">{error}</p>
            </div>
          ) : tracks.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 text-center">
              <Music className="w-12 h-12 mx-auto mb-4 text-white/30" />
              <p className="text-white/60">No tracks yet. Be the first to upload!</p>
              <LocalizedLink 
                to="/music/upload"
                className="inline-block mt-4 px-6 py-2 rounded-full text-black font-medium"
                style={{ backgroundColor: theme.accent }}
              >
                Upload Music
              </LocalizedLink>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 sm:space-y-2">
                {tracks.map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isThisPlaying = isCurrentTrack && isPlaying;
                  
                  return (
                    <div
                      key={track.id}
                      onClick={() => handlePlayTrack(index)}
                      className={`flex items-center gap-2.5 sm:gap-4 p-2.5 sm:p-4 rounded-lg sm:rounded-xl cursor-pointer transition-colors border border-white/10 overflow-hidden ${
                        isCurrentTrack ? 'bg-black/60 backdrop-blur-md' : 'bg-black/40 backdrop-blur-sm hover:bg-black/50'
                      }`}
                    >
                      <div className="relative w-10 h-10 sm:w-14 sm:h-14 rounded-md sm:rounded-lg overflow-hidden flex-shrink-0">
                        <img 
                          src={track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&q=80'} 
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                        {isThisPlaying && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div className="flex items-center gap-0.5">
                              <span className="w-0.5 sm:w-1 h-2 sm:h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                              <span className="w-0.5 sm:w-1 h-3 sm:h-4 rounded-full animate-pulse delay-75" style={{ backgroundColor: theme.accent }} />
                              <span className="w-0.5 sm:w-1 h-1.5 sm:h-2 rounded-full animate-pulse delay-150" style={{ backgroundColor: theme.accent }} />
                            </div>
                          </div>
                        )}
                        {!isThisPlaying && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <p className={`font-medium truncate text-sm sm:text-base ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>
                            {track.title}
                          </p>
                          <PriceBadge priceKas={track.priceKas} />
                          <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                        </div>
                        <LocalizedLink
                          to={`/music/artist/${track.artistId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs sm:text-sm text-white/60 hover:text-white/80 hover:underline"
                        >
                          {track.artist}
                        </LocalizedLink>
                      </div>
                      
                      <div className="text-xs sm:text-sm text-white/50">
                        {formatDuration(track.durationSeconds)}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        {hasFullyListened(track.id) && <ReviewButton track={track} accent={theme.accent} />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 sm:gap-2 mt-8 pb-4">
                  {/* Previous button */}
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-2 rounded-lg transition-colors ${
                      currentPage === 1 
                        ? 'text-white/30 cursor-not-allowed' 
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {/* Page numbers */}
                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, index) => (
                      page === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-white/50">...</span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => goToPage(page)}
                          className={`min-w-[36px] sm:min-w-[40px] h-9 sm:h-10 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                            currentPage === page
                              ? 'text-black'
                              : 'text-white hover:bg-white/10'
                          }`}
                          style={currentPage === page ? { backgroundColor: theme.accent } : {}}
                        >
                          {page}
                        </button>
                      )
                    ))}
                  </div>

                  {/* Next button */}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-2 rounded-lg transition-colors ${
                      currentPage === totalPages 
                        ? 'text-white/30 cursor-not-allowed' 
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
