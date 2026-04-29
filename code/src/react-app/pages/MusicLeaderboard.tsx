import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Music2, Mic2, Play, ArrowLeft, Crown, Medal, Award, Headphones } from 'lucide-react';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import LocalizedLink from '../components/LocalizedLink';
import AnimatedBackground from '../components/AnimatedBackground';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

interface LeaderboardArtist {
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  genre: string | null;
  totalPlays: number;
  trackCount: number;
}

interface LeaderboardPodcaster {
  id: number;
  name: string;
  handle: string;
  avatarUrl: string | null;
  totalPlays: number;
  episodeCount: number;
  podcastCount: number;
}

function formatPlays(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="w-6 h-6 text-yellow-400" />;
    case 2:
      return <Medal className="w-6 h-6 text-gray-300" />;
    case 3:
      return <Award className="w-6 h-6 text-amber-600" />;
    default:
      return <span className="w-6 h-6 flex items-center justify-center text-white/60 font-bold">{rank}</span>;
  }
}

function getRankBorder(rank: number): string {
  switch (rank) {
    case 1:
      return 'border-yellow-400/50 bg-yellow-400/5';
    case 2:
      return 'border-gray-300/40 bg-gray-300/5';
    case 3:
      return 'border-amber-600/40 bg-amber-600/5';
    default:
      return 'border-white/10 bg-white/5';
  }
}

export default function MusicLeaderboard() {
  const { theme } = useMusicTheme();
  const { t } = useLanguage();
  const goBack = useNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const [activeTab, setActiveTab] = useState<'music' | 'podcasts'>('music');
  const [artists, setArtists] = useState<LeaderboardArtist[]>([]);
  const [podcasters, setPodcasters] = useState<LeaderboardPodcaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const [artistsRes, podcastersRes] = await Promise.all([
          fetch('/api/music/leaderboard/artists'),
          fetch('/api/music/leaderboard/podcasters')
        ]);
        
        if (artistsRes.ok) {
          const data = await artistsRes.json();
          setArtists(data.artists || []);
        }
        
        if (podcastersRes.ok) {
          const data = await podcastersRes.json();
          setPodcasters(data.podcasters || []);
        }
      } catch (err) {
        setError('Failed to load leaderboard');
        console.error('Leaderboard error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLeaderboard();
  }, []);

  return (
    <div className={`min-h-screen relative w-full overflow-x-hidden ${titleBarPadding}`} style={{ backgroundColor: theme.background }}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      
      <div className="relative z-10 w-full overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl border-b" style={{ 
          backgroundColor: `${theme.background}cc`,
          borderColor: `${theme.accent}33`
        }}>
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => goBack(-1)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">{t.leaderboard?.title || 'Top Creators'}</h1>
                <p className="text-xs sm:text-sm text-white/60 hidden sm:block">{t.leaderboard?.plays || 'Ranked by total plays'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="bg-black/60 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-white/10">
          <div className="flex gap-1.5 sm:gap-2 mb-6 sm:mb-8">
            <button
              onClick={() => setActiveTab('music')}
              className={`flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-medium transition-all text-sm sm:text-base ${
                activeTab === 'music' 
                  ? 'text-black' 
                  : 'text-white/70 hover:text-white bg-white/10 hover:bg-white/20'
              }`}
              style={activeTab === 'music' ? { backgroundColor: theme.accent } : {}}
            >
              <Music2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t.leaderboard?.musicArtists || 'Music Artists'}</span>
              <span className="sm:hidden">Artists</span>
            </button>
            <button
              onClick={() => setActiveTab('podcasts')}
              className={`flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-medium transition-all text-sm sm:text-base ${
                activeTab === 'podcasts' 
                  ? 'text-black' 
                  : 'text-white/70 hover:text-white bg-white/10 hover:bg-white/20'
              }`}
              style={activeTab === 'podcasts' ? { backgroundColor: theme.accent } : {}}
            >
              <Mic2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t.leaderboard?.podcasters || 'Podcast Hosts'}</span>
              <span className="sm:hidden">Podcasts</span>
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12 sm:py-20">
              <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="text-center py-12 sm:py-20">
              <p className="text-white/60 text-sm sm:text-base">{error}</p>
            </div>
          )}

          {/* Music Artists Leaderboard */}
          {!loading && !error && activeTab === 'music' && (
            <div className="space-y-2 sm:space-y-3">
              {artists.length === 0 ? (
                <div className="text-center py-12 sm:py-20">
                  <Music2 className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-3 sm:mb-4" />
                  <p className="text-white/60 text-sm sm:text-base">{t.leaderboard?.noArtists || 'No artists on the leaderboard yet'}</p>
                </div>
              ) : (
                artists.map((artist, index) => (
                  <LocalizedLink
                    key={artist.id}
                    to={`/music/artist/${artist.id}`}
                    className={`flex items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all hover:scale-[1.01] ${getRankBorder(index + 1)}`}
                  >
                    {/* Rank */}
                    <div className="w-8 sm:w-12 flex justify-center flex-shrink-0">
                      {index < 3 ? getRankIcon(index + 1) : <span className="text-white/60 font-bold text-sm sm:text-base">{index + 1}</span>}
                    </div>

                    {/* Avatar */}
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
                      {artist.avatarUrl ? (
                        <img 
                          src={artist.avatarUrl} 
                          alt={artist.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 sm:w-6 sm:h-6 text-white/40" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate text-sm sm:text-base">{artist.name}</h3>
                      <p className="text-xs sm:text-sm text-white/60 truncate">@{artist.handle}</p>
                      {artist.genre && (
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-white/10 text-white/70 mt-1 inline-block">
                          {artist.genre}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 sm:gap-1.5 justify-end">
                        <Headphones className="w-3 h-3 sm:w-4 sm:h-4 text-white/60" />
                        <span className="font-bold text-white text-sm sm:text-base">{formatPlays(artist.totalPlays)}</span>
                      </div>
                      <p className="text-[10px] sm:text-xs text-white/50">
                        {artist.trackCount} {t.leaderboard?.tracks || 'tracks'}
                      </p>
                    </div>
                  </LocalizedLink>
                ))
              )}
            </div>
          )}

          {/* Podcasters Leaderboard */}
          {!loading && !error && activeTab === 'podcasts' && (
            <div className="space-y-2 sm:space-y-3">
              {podcasters.length === 0 ? (
                <div className="text-center py-12 sm:py-20">
                  <Mic2 className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-3 sm:mb-4" />
                  <p className="text-white/60 text-sm sm:text-base">{t.leaderboard?.noPodcasters || 'No podcasters on the leaderboard yet'}</p>
                </div>
              ) : (
                podcasters.map((podcaster, index) => (
                  <LocalizedLink
                    key={podcaster.id}
                    to={`/music/artist/${podcaster.id}`}
                    className={`flex items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all hover:scale-[1.01] ${getRankBorder(index + 1)}`}
                  >
                    {/* Rank */}
                    <div className="w-8 sm:w-12 flex justify-center flex-shrink-0">
                      {index < 3 ? getRankIcon(index + 1) : <span className="text-white/60 font-bold text-sm sm:text-base">{index + 1}</span>}
                    </div>

                    {/* Avatar */}
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full overflow-hidden flex-shrink-0 bg-white/10">
                      {podcaster.avatarUrl ? (
                        <img 
                          src={podcaster.avatarUrl} 
                          alt={podcaster.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mic2 className="w-4 h-4 sm:w-6 sm:h-6 text-white/40" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate text-sm sm:text-base">{podcaster.name}</h3>
                      <p className="text-xs sm:text-sm text-white/60 truncate">@{podcaster.handle}</p>
                      <span className="text-[10px] sm:text-xs text-white/50 mt-1 inline-block">
                        {podcaster.podcastCount} {t.leaderboard?.podcasts || 'podcasts'}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 sm:gap-1.5 justify-end">
                        <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white/60" />
                        <span className="font-bold text-white text-sm sm:text-base">{formatPlays(podcaster.totalPlays)}</span>
                      </div>
                      <p className="text-[10px] sm:text-xs text-white/50">
                        {podcaster.episodeCount} {t.leaderboard?.episodes || 'episodes'}
                      </p>
                    </div>
                  </LocalizedLink>
                ))
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
