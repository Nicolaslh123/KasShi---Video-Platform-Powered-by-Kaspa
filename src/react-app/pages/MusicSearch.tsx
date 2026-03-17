import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Music2, Search, Play, User, Loader2, ArrowLeft, Disc, ListMusic } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import LocalizedLink from '../components/LocalizedLink';
import { useLocalizedNavigate } from '../components/LanguageRouter';
import AnimatedBackground from '../components/AnimatedBackground';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import { AudioTrack } from '../components/AudioPlayer';
import { TrackRating } from '../components/TrackRating';
import ReviewButton from '../components/ReviewButton';

// Search result types from API
interface SearchTrack {
  id: number;
  title: string;
  audio_url?: string;
  cover_url?: string;
  duration_seconds?: number;
  genre?: string;
  play_count?: number;
  artist_name?: string;
  album_title?: string;
  avg_rating?: number;
  review_count?: number;
}

interface SearchArtist {
  id: number;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  track_count: number;
}

interface SearchAlbum {
  id: number;
  title: string;
  cover_url: string | null;
  artist_name: string | null;
  artist_id: number | null;
  release_year: number | null;
}

interface SearchPlaylist {
  id: number;
  title: string;
  cover_url: string | null;
  creator_name: string | null;
  creator_id: number | null;
  track_count: number;
}

interface SearchResults {
  tracks: SearchTrack[];
  artists: SearchArtist[];
  albums: SearchAlbum[];
  playlists: SearchPlaylist[];
}

export default function MusicSearch() {
  const { theme } = useMusicTheme();
  const { playTrack, currentTrack, isPlaying, hasFullyListened } = useAudioPlayer();
  const navigate = useLocalizedNavigate();
  const goBack = useNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search when query changes
  useEffect(() => {
    if (!query) {
      setResults(null);
      return;
    }

    const search = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data);
      } catch (err) {
        setError('Failed to search. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    search();
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/music/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handlePlayTrack = (track: SearchTrack) => {
    const audioTrack: AudioTrack = {
      id: track.id,
      title: track.title,
      artist: track.artist_name || 'Unknown Artist',
      audioUrl: track.audio_url || '',
      coverArtUrl: track.cover_url || '',
      durationSeconds: track.duration_seconds || 0,
    };
    playTrack(audioTrack);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="min-h-screen relative w-full overflow-x-hidden"
      style={{ 
        background: theme.background
      }}
    >
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      <div className={`relative z-10 min-h-screen w-full overflow-x-hidden ${titleBarPadding}`}>
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
          <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Back */}
              <button 
                onClick={() => goBack(-1)} 
                className="flex items-center gap-1.5 sm:gap-2 text-white/70 hover:text-white transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hidden sm:flex" style={{ backgroundColor: theme.accent }}>
                  <Music2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </div>
              </button>
              
              {/* Search bar */}
              <form onSubmit={handleSearch} className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search artists, songs..."
                    className="w-full pl-9 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-white/10 border border-white/20 rounded-full text-sm sm:text-base text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/15"
                    autoFocus
                  />
                </div>
              </form>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-[1200px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {!query && (
            <div className="text-center py-12 sm:py-20">
              <Search className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-white/20 mb-3 sm:mb-4" />
              <p className="text-white/60 text-base sm:text-lg">Search for artists, songs, or podcasts</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12 sm:py-20">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" style={{ color: theme.accent }} />
            </div>
          )}

          {error && (
            <div className="text-center py-12 sm:py-20">
              <p className="text-red-400 text-sm sm:text-base">{error}</p>
            </div>
          )}

          {results && !loading && (
            <div className="space-y-6 sm:space-y-10">
              {/* Artists section */}
              {results.artists.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Artists</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                    {results.artists.map((artist) => (
                      <LocalizedLink
                        key={artist.id}
                        to={`/music/artist/${artist.id}`}
                        className="group p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl transition-all"
                      >
                        <div className="aspect-square rounded-full overflow-hidden mb-2 sm:mb-3 bg-white/10">
                          {artist.avatar_url ? (
                            <img 
                              src={artist.avatar_url} 
                              alt={artist.display_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="w-8 h-8 sm:w-12 sm:h-12 text-white/30" />
                            </div>
                          )}
                        </div>
                        <h3 className="font-medium text-white truncate text-center text-sm sm:text-base">
                          {artist.display_name}
                        </h3>
                        <p className="text-xs sm:text-sm text-white/50 text-center">
                          {artist.track_count} {artist.track_count === 1 ? 'track' : 'tracks'}
                        </p>
                      </LocalizedLink>
                    ))}
                  </div>
                </section>
              )}

              {/* Tracks section */}
              {results.tracks.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Songs</h2>
                  <div className="space-y-1.5 sm:space-y-2">
                    {results.tracks.map((track) => {
                      const isCurrentTrack = currentTrack?.id === track.id;
                      return (
                        <div
                          key={track.id}
                          className={`group flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-lg transition-all cursor-pointer ${
                            isCurrentTrack 
                              ? 'bg-white/20' 
                              : 'hover:bg-white/10'
                          }`}
                          onClick={() => handlePlayTrack(track)}
                        >
                          {/* Cover */}
                          <div className="relative w-11 h-11 sm:w-14 sm:h-14 rounded-md sm:rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                            {track.cover_url ? (
                              <img 
                                src={track.cover_url} 
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music2 className="w-5 h-5 sm:w-6 sm:h-6 text-white/30" />
                              </div>
                            )}
                            <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                              isCurrentTrack && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}>
                              <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill={isCurrentTrack && isPlaying ? 'white' : 'none'} />
                            </div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className={`font-medium truncate text-sm sm:text-base ${
                                isCurrentTrack ? 'text-white' : 'text-white/90'
                              }`} style={isCurrentTrack ? { color: theme.accent } : undefined}>
                                {track.title}
                              </h3>
                              <TrackRating trackId={track.id} averageRating={track.avg_rating} reviewCount={track.review_count} size="sm" />
                            </div>
                            <p className="text-xs sm:text-sm text-white/50 truncate">
                              {track.artist_name || 'Unknown Artist'}
                            </p>
                          </div>

                          {/* Duration */}
                          <span className="text-xs sm:text-sm text-white/40 tabular-nums flex-shrink-0">
                            {track.duration_seconds ? formatDuration(track.duration_seconds) : '--:--'}
                          </span>
                          
                          {/* Review Button */}
                          <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                            {hasFullyListened(track.id) && <ReviewButton 
                              track={{
                                id: track.id,
                                title: track.title,
                                artist: track.artist_name || 'Unknown Artist',
                                audioUrl: track.audio_url || '',
                                coverArtUrl: track.cover_url || '',
                                durationSeconds: track.duration_seconds || 0,
                                averageRating: track.avg_rating,
                                reviewCount: track.review_count
                              }}
                              accent={theme.accent}
                            />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Albums section */}
              {results.albums && results.albums.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Albums</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                    {results.albums.map((album) => (
                      <LocalizedLink
                        key={album.id}
                        to={`/music/album/${album.id}`}
                        className="group p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl transition-all"
                      >
                        <div className="aspect-square rounded-md sm:rounded-lg overflow-hidden mb-2 sm:mb-3 bg-white/10">
                          {album.cover_url ? (
                            <img 
                              src={album.cover_url} 
                              alt={album.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc className="w-8 h-8 sm:w-12 sm:h-12 text-white/30" />
                            </div>
                          )}
                        </div>
                        <h3 className="font-medium text-white truncate text-sm sm:text-base">
                          {album.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-white/50 truncate">
                          {album.artist_name || 'Unknown Artist'}
                          {album.release_year && ` · ${album.release_year}`}
                        </p>
                      </LocalizedLink>
                    ))}
                  </div>
                </section>
              )}

              {/* Playlists section */}
              {results.playlists && results.playlists.length > 0 && (
                <section>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Playlists</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                    {results.playlists.map((playlist) => (
                      <LocalizedLink
                        key={playlist.id}
                        to={`/music/playlist/${playlist.id}`}
                        className="group p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-lg sm:rounded-xl transition-all"
                      >
                        <div className="aspect-square rounded-md sm:rounded-lg overflow-hidden mb-2 sm:mb-3 bg-white/10">
                          {playlist.cover_url ? (
                            <img 
                              src={playlist.cover_url} 
                              alt={playlist.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ListMusic className="w-8 h-8 sm:w-12 sm:h-12 text-white/30" />
                            </div>
                          )}
                        </div>
                        <h3 className="font-medium text-white truncate text-sm sm:text-base">
                          {playlist.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-white/50 truncate">
                          {playlist.creator_name || 'Unknown'} · {playlist.track_count} {playlist.track_count === 1 ? 'track' : 'tracks'}
                        </p>
                      </LocalizedLink>
                    ))}
                  </div>
                </section>
              )}

              {/* No results */}
              {results.tracks.length === 0 && results.artists.length === 0 && (!results.albums || results.albums.length === 0) && (!results.playlists || results.playlists.length === 0) && (
                <div className="text-center py-12 sm:py-20">
                  <Search className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-white/20 mb-3 sm:mb-4" />
                  <p className="text-white/60 text-base sm:text-lg">No results found for "{query}"</p>
                  <p className="text-white/40 mt-2 text-sm sm:text-base">Try searching for something else</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}