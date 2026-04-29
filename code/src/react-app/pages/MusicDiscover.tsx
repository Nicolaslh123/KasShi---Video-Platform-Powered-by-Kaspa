import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Play, Loader2, Music2, Filter, Shuffle } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { apiTrackToAudioTrack, ApiTrack } from '../hooks/useMusic';
import { AudioTrack } from '../components/AudioPlayer';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import { TrackRating } from '../components/TrackRating';

const GENRES = [
  { id: 'all', name: 'All Genres', color: '#6366f1' },
  { id: 'afrobeats', name: 'Afrobeats', color: '#22c55e' },
  { id: 'electronic', name: 'Electronic', color: '#06b6d4' },
  { id: 'house', name: 'House', color: '#8b5cf6' },
  { id: 'hip-hop', name: 'Hip-Hop', color: '#f59e0b' },
  { id: 'pop', name: 'Pop', color: '#ec4899' },
  { id: 'rock', name: 'Rock', color: '#ef4444' },
  { id: 'r&b', name: 'R&B', color: '#a855f7' },
  { id: 'jazz', name: 'Jazz', color: '#14b8a6' },
  { id: 'classical', name: 'Classical', color: '#64748b' },
  { id: 'country', name: 'Country', color: '#f97316' },
  { id: 'folk', name: 'Folk', color: '#84cc16' },
  { id: 'metal', name: 'Metal', color: '#1f2937' },
  { id: 'indie', name: 'Indie', color: '#10b981' },
];

interface Artist {
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  genre: string | null;
  followerCount: number;
}

// Format duration as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function MusicDiscover() {
  const { theme } = useMusicTheme();
  const navigate = useNavigate();
  const { playPlaylist, currentTrack, isPlaying, isPlayerVisible } = useAudioPlayer();
  const { titleBarPadding } = useElectronTitleBar();
  
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [shuffleMode, setShuffleMode] = useState(false);

  useEffect(() => {
    fetchDiscoverContent();
  }, [selectedGenre]);

  const fetchDiscoverContent = async () => {
    setLoading(true);
    try {
      const genreParam = selectedGenre === 'all' ? '' : `&genre=${encodeURIComponent(selectedGenre)}`;
      
      // Fetch tracks - always shuffle for discover page
      const tracksRes = await fetch(`/api/music/discover/tracks?shuffle=true${genreParam}`);
      if (tracksRes.ok) {
        const data = await tracksRes.json();
        const audioTracks = (data.tracks || []).map((t: ApiTrack) => apiTrackToAudioTrack(t));
        setTracks(audioTracks);
      }

      // Fetch artists
      const artistsRes = await fetch(`/api/music/discover/artists${genreParam}`);
      if (artistsRes.ok) {
        const data = await artistsRes.json();
        setArtists(data.artists || []);
      }
    } catch (err) {
      console.error('Failed to fetch discover content:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = (_track: AudioTrack, index: number) => {
    if (shuffleMode) {
      // Shuffle the playlist
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playPlaylist(shuffled, 0);
    } else {
      playPlaylist(tracks, index);
    }
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    if (shuffleMode) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playPlaylist(shuffled, 0);
    } else {
      playPlaylist(tracks, 0);
    }
  };

  const getGenreColor = (genreId: string) => {
    return GENRES.find(g => g.id === genreId)?.color || theme.accent;
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Animated Background */}
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      {/* Overlay */}
      <div className={`absolute inset-0 ${theme.overlay} opacity-30`} />

      {/* Content */}
      <div className={`relative z-10 min-h-screen flex flex-col w-full overflow-x-hidden ${titleBarPadding}`}>
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 sm:gap-2 text-white/70 hover:text-white transition-colors">
                  <Music2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Back</span>
                </button>
                <div className="w-px h-5 sm:h-6 bg-white/20" />
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Compass className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: theme.accent }} />
                  <h1 className="text-lg sm:text-xl font-bold text-white">Discover</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {/* Shuffle Play button */}
                <button
                  onClick={() => {
                    if (tracks.length === 0) return;
                    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                    playPlaylist(shuffled, 0);
                    setShuffleMode(true);
                  }}
                  disabled={tracks.length === 0}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full transition-colors ${
                    shuffleMode 
                      ? 'bg-white/20 text-white' 
                      : 'bg-white/10 text-white/60 hover:text-white'
                  } disabled:opacity-50`}
                >
                  <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline text-sm">Shuffle</span>
                </button>

                {/* Play All */}
                <button
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-medium text-black transition-all hover:opacity-90 disabled:opacity-50 text-sm"
                  style={{ backgroundColor: theme.accent }}
                >
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Play All</span>
                  <span className="sm:hidden">Play</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Genre Filter */}
        <div className="sticky top-[57px] sm:top-[73px] z-40 backdrop-blur-xl bg-black/20 border-b border-white/5">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/60" />
              <span className="text-xs sm:text-sm text-white/60">Filter by genre</span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {GENRES.map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => setSelectedGenre(genre.id)}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                    selectedGenre === genre.id
                      ? 'text-black scale-105'
                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                  }`}
                  style={selectedGenre === genre.id ? { backgroundColor: genre.color } : {}}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-6 py-4 sm:py-8">
          {loading ? (
            <div className="flex items-center justify-center py-12 sm:py-20">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" style={{ color: theme.accent }} />
              <span className="ml-2 sm:ml-3 text-white/70 text-sm sm:text-base">Discovering music...</span>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-4 sm:gap-8">
              {/* Tracks Section - 2/3 width */}
              <div className="lg:col-span-2 min-w-0">
                <div className="rounded-xl sm:rounded-2xl p-[1px] max-w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${getGenreColor(selectedGenre)}40 0%, transparent 50%, ${getGenreColor(selectedGenre)}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl p-3 sm:p-6">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        {selectedGenre === 'all' ? 'All Tracks' : `${GENRES.find(g => g.id === selectedGenre)?.name} Tracks`}
                      </h2>
                      <span className="text-xs sm:text-sm text-white/50">{tracks.length} tracks</span>
                    </div>

                    {tracks.length === 0 ? (
                      <div className="bg-black/40 rounded-lg sm:rounded-xl p-6 sm:p-8 text-center">
                        <Music2 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-white/30" />
                        <p className="text-white/60 text-sm sm:text-base">No tracks found in this genre</p>
                        <p className="text-white/40 text-xs sm:text-sm mt-2">Try selecting a different genre or upload your own!</p>
                      </div>
                    ) : (
                      <div className="bg-black/40 rounded-lg sm:rounded-xl overflow-hidden">
                        {/* Desktop table */}
                        <table className="w-full hidden sm:table">
                          <thead>
                            <tr className="border-b border-white/10 text-white/50 text-sm">
                              <th className="text-left py-3 px-4 w-12">#</th>
                              <th className="text-left py-3 px-4">Title</th>
                              <th className="text-left py-3 px-4 hidden md:table-cell">Artist</th>
                              <th className="text-right py-3 px-4">Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tracks.map((track, index) => {
                              const isCurrentTrack = currentTrack?.id === track.id;
                              const isThisPlaying = isCurrentTrack && isPlaying;
                              return (
                                <tr 
                                  key={track.id}
                                  onClick={() => handlePlayTrack(track, index)}
                                  className={`group border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${isCurrentTrack ? 'bg-white/5' : ''}`}
                                >
                                  <td className="py-3 px-4 text-white/50 group-hover:text-white">
                                    {isThisPlaying ? (
                                      <div className="flex items-center gap-0.5">
                                        <span className="w-1 h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                                        <span className="w-1 h-4 rounded-full animate-pulse delay-75" style={{ backgroundColor: theme.accent }} />
                                        <span className="w-1 h-2 rounded-full animate-pulse delay-150" style={{ backgroundColor: theme.accent }} />
                                      </div>
                                    ) : (
                                      <>
                                        <span className="group-hover:hidden">{index + 1}</span>
                                        <Play className="w-4 h-4 hidden group-hover:block" style={{ color: theme.accent }} />
                                      </>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <img 
                                        src={track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&q=80'} 
                                        alt={track.title}
                                        className="w-10 h-10 rounded object-cover hidden sm:block"
                                      />
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <p className={`font-medium ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>{track.title}</p>
                                          <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                                        </div>
                                        {track.artistId ? (
                                          <LocalizedLink 
                                            to={`/music/artist/${track.artistId}`} 
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-sm text-white/60 hover:text-white hover:underline md:hidden"
                                          >
                                            {track.artist}
                                          </LocalizedLink>
                                        ) : (
                                          <p className="text-sm text-white/60 md:hidden">{track.artist}</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 hidden md:table-cell">
                                    {track.artistId ? (
                                      <LocalizedLink 
                                        to={`/music/artist/${track.artistId}`} 
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-white/60 hover:text-white hover:underline"
                                      >
                                        {track.artist}
                                      </LocalizedLink>
                                    ) : (
                                      <span className="text-white/60">{track.artist}</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-white/50 text-right">{formatDuration(track.durationSeconds)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        
                        {/* Mobile list */}
                        <div className="sm:hidden divide-y divide-white/10">
                          {tracks.map((track, index) => {
                            const isCurrentTrack = currentTrack?.id === track.id;
                            const isThisPlaying = isCurrentTrack && isPlaying;
                            return (
                              <div
                                key={track.id}
                                onClick={() => handlePlayTrack(track, index)}
                                className={`flex items-center gap-3 p-3 cursor-pointer overflow-hidden ${isCurrentTrack ? 'bg-black/40' : 'bg-black/20'}`}
                              >
                                <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
                                  <img
                                    src={track.coverArtUrl || 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=100&q=80'}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                  />
                                  {isThisPlaying && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <div className="flex items-center gap-0.5">
                                        <span className="w-0.5 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                                        <span className="w-0.5 h-3 rounded-full animate-pulse delay-75" style={{ backgroundColor: theme.accent }} />
                                        <span className="w-0.5 h-1.5 rounded-full animate-pulse delay-150" style={{ backgroundColor: theme.accent }} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className={`font-medium truncate text-sm ${isCurrentTrack ? '' : 'text-white'}`} style={isCurrentTrack ? { color: theme.accent } : {}}>{track.title}</p>
                                    <TrackRating trackId={track.id} averageRating={track.averageRating} reviewCount={track.reviewCount} size="sm" />
                                  </div>
                                  {track.artistId ? (
                                    <LocalizedLink 
                                      to={`/music/artist/${track.artistId}`} 
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-xs text-white/60 hover:text-white hover:underline truncate block"
                                    >
                                      {track.artist}
                                    </LocalizedLink>
                                  ) : (
                                    <p className="text-xs text-white/60 truncate">{track.artist}</p>
                                  )}
                                </div>
                                <span className="text-xs text-white/50 flex-shrink-0">{formatDuration(track.durationSeconds)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Artists Section - 1/3 width */}
              <div className="lg:col-span-1 min-w-0">
                <div className="rounded-xl sm:rounded-2xl p-[1px] max-w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${getGenreColor(selectedGenre)}40 0%, transparent 50%, ${getGenreColor(selectedGenre)}20 100%)` }}>
                  <div className="bg-black/70 rounded-xl sm:rounded-2xl p-3 sm:p-6">
                    <h2 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">
                      {selectedGenre === 'all' ? 'Featured Artists' : `${GENRES.find(g => g.id === selectedGenre)?.name} Artists`}
                    </h2>

                    {artists.length === 0 ? (
                      <div className="bg-white/5 rounded-lg sm:rounded-xl p-4 sm:p-6 text-center">
                        <p className="text-white/60 text-xs sm:text-sm">No artists found in this genre</p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {artists.map((artist) => (
                          <LocalizedLink
                            key={artist.id}
                            to={`/music/artist/${artist.id}`}
                            className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl transition-colors"
                          >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden flex-shrink-0">
                              {artist.avatarUrl ? (
                                <img 
                                  src={artist.avatarUrl} 
                                  alt={artist.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-white/10 flex items-center justify-center">
                                  <Music2 className="w-4 h-4 sm:w-5 sm:h-5 text-white/40" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white truncate text-sm sm:text-base">{artist.name}</p>
                              <p className="text-xs sm:text-sm text-white/50">@{artist.handle}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs sm:text-sm text-white/60">{artist.followerCount}</p>
                              <p className="text-[10px] sm:text-xs text-white/40">followers</p>
                            </div>
                          </LocalizedLink>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Genre Info Card */}
                {selectedGenre !== 'all' && (
                  <div className="mt-4 sm:mt-6 rounded-xl sm:rounded-2xl p-[1px]" style={{ background: `linear-gradient(135deg, ${getGenreColor(selectedGenre)}40 0%, transparent 50%, ${getGenreColor(selectedGenre)}20 100%)` }}>
                    <div className="bg-black/70 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                      <div 
                        className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"
                        style={{ backgroundColor: `${getGenreColor(selectedGenre)}30` }}
                      >
                        <Music2 className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: getGenreColor(selectedGenre) }} />
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1.5 sm:mb-2">
                        {GENRES.find(g => g.id === selectedGenre)?.name}
                      </h3>
                      <p className="text-white/60 text-xs sm:text-sm">
                        Discover the best {GENRES.find(g => g.id === selectedGenre)?.name.toLowerCase()} tracks and artists on KasShi Music.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Footer with padding for player */}
        <footer className={`${isPlayerVisible ? 'pb-24' : 'pb-6 sm:pb-8'} pt-6 sm:pt-8 px-3 sm:px-4 mt-auto`}>
          <div className="max-w-[1600px] mx-auto border-t border-white/10 pt-4 sm:pt-6">
            <div className="text-center text-white/40 text-[10px] sm:text-xs">
              <p>© {new Date().getFullYear()} KasShi Music. Discover new music every day.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
