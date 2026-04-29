import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "@getmocha/users-service/react";
import { useEffect } from "react";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import Channel from "./pages/Channel";
import Upload from "./pages/Upload";
import Settings from "./pages/Settings";
import Search from "./pages/Search";
import Admin from "./pages/Admin";
import EditVideo from "./pages/EditVideo";
import Dashboard from "./pages/Dashboard";
import MyChannel from "./pages/MyChannel";
import MyArtist from "./pages/MyArtist";
import AuthCallback from "./pages/AuthCallback";
import Legal from "./pages/Legal";
import { Toaster } from "react-hot-toast";
import { WalletProvider } from "./contexts/WalletContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MusicThemeProvider } from "./contexts/MusicThemeContext";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { AudioVisualizationProvider } from "./contexts/AudioVisualizationContext";
import Music from "./pages/Music";
import Album from "./pages/Album";
import Playlist from "./pages/Playlist";
import Podcast from "./pages/Podcast";
import MusicUpload from "./pages/MusicUpload";
import MusicLibrary from "./pages/MusicLibrary";
import PodcastCategory from "./pages/PodcastCategory";
import MusicSearch from "./pages/MusicSearch";
import MusicArtist from "./pages/MusicArtist";
import MusicDiscover from "./pages/MusicDiscover";
import MusicLeaderboard from "./pages/MusicLeaderboard";
import TrackPage from "./pages/TrackPage";
import TrackReviews from "./pages/TrackReviews";
import AllAlbums from "./pages/AllAlbums";
import AllPlaylists from "./pages/AllPlaylists";
import AllPodcasts from "./pages/AllPodcasts";
import AllTracks from "./pages/AllTracks";
import Marketplace from "./pages/Marketplace";
import MarketplaceUpload from "./pages/MarketplaceUpload";
import ReanalyzeTracks from "./pages/ReanalyzeTracks";
import AccountActivity from "./pages/AccountActivity";
import MyInvestments from "./pages/MyInvestments";
import ExportData from "./pages/ExportData";
import { ClipsFeed } from "./components/clips";
import GlobalAudioPlayer from "./components/GlobalAudioPlayer";
import ElectronTitleBar, { ElectronAppBorder } from "./components/ElectronTitleBar";
import { PasswordGateProvider } from "./contexts/PasswordGateContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import LanguageRouter from "./components/LanguageRouter";
import PasswordGateModal from "./components/PasswordGateModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { useMusicTheme } from "./contexts/MusicThemeContext";
import { PageTransitionProvider } from "./contexts/PageTransitionContext";
import PageTransition from "./components/PageTransition";


// Apply scrollbar theme class based on current route and music theme
function ScrollbarTheme() {
  const location = useLocation();
  
  let themeId = 'default';
  try {
    const { theme } = useMusicTheme();
    themeId = theme.id;
  } catch {
    // Not in music context yet
  }

  useEffect(() => {
    const isMusicRoute = location.pathname.includes('/music');
    const root = document.documentElement;
    
    // Remove all existing theme classes
    const themeClasses = Array.from(root.classList).filter(c => 
      c.startsWith('music-theme-') || c === 'video-theme'
    );
    themeClasses.forEach(c => root.classList.remove(c));
    
    // Apply appropriate theme class
    if (isMusicRoute) {
      root.classList.add(`music-theme-${themeId}`);
    } else {
      root.classList.add('video-theme');
    }
  }, [location.pathname, themeId]);

  return null;
}

// Capture referral code from URL and store for later use during signup
function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      // Store with 7-day expiry
      const data = { code: refCode, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 };
      localStorage.setItem('kasshi_referral', JSON.stringify(data));
      // Clean URL without reload
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  return null;
}

// App routes wrapped in language-aware routing
function AppRoutes() {
  return (
    <Routes>
      {/* Routes without language prefix (default English) */}
      <Route element={<LanguageRouter />}>
        <Route path="/" element={<Navigate to="/video" replace />} />
        <Route path="/video" element={<Home />} />
        <Route path="/video/following" element={<Navigate to="/video?feed=following" replace />} />
        <Route path="/video/free" element={<Navigate to="/video?feed=free" replace />} />
        <Route path="/video/members" element={<Navigate to="/video?feed=members" replace />} />
        <Route path="/video/history" element={<Navigate to="/video?feed=history" replace />} />
        <Route path="/video/watch/:videoId" element={<Watch />} />
        <Route path="/video/edit/:videoId" element={<EditVideo />} />
        <Route path="/video/channel" element={<MyChannel />} />
        <Route path="/video/channel/:channelId" element={<Channel />} />
        <Route path="/video/upload" element={<Upload />} />
        <Route path="/video/search" element={<Search />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/export" element={<ExportData />} />
        <Route path="/activity" element={<AccountActivity />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/legal/fractional-agreement" element={<Legal />} />
        <Route path="/music" element={<Music />} />
        <Route path="/music/artist" element={<MyArtist />} />
        <Route path="/music/album/:albumId" element={<Album />} />
        <Route path="/music/playlist/:playlistId" element={<Playlist />} />
        <Route path="/music/podcast/:podcastId" element={<Podcast />} />
        <Route path="/music/upload" element={<MusicUpload />} />
        <Route path="/music/library" element={<MusicLibrary />} />
        <Route path="/music/library/:tab" element={<MusicLibrary />} />
        <Route path="/music/podcasts/category/:category" element={<PodcastCategory />} />
        <Route path="/music/search" element={<MusicSearch />} />
        <Route path="/music/artist/:artistId" element={<MusicArtist />} />
        <Route path="/music/track/:trackId" element={<TrackPage />} />
        <Route path="/music/track/:trackId/reviews" element={<TrackReviews />} />
        <Route path="/music/discover" element={<MusicDiscover />} />
        <Route path="/music/leaderboard" element={<MusicLeaderboard />} />
        <Route path="/music/albums" element={<AllAlbums />} />
        <Route path="/music/playlists" element={<AllPlaylists />} />
        <Route path="/music/podcasts" element={<AllPodcasts />} />
        <Route path="/music/tracks" element={<AllTracks />} />
        <Route path="/music/marketplace" element={<Marketplace />} />
        <Route path="/music/marketplace/upload" element={<MarketplaceUpload />} />
        <Route path="/music/admin/reanalyze" element={<ReanalyzeTracks />} />
        <Route path="/music/investments" element={<MyInvestments />} />
        <Route path="/clips" element={<ClipsFeed />} />
      </Route>
      
      {/* Routes with language prefix (e.g., /fr, /de, /es) */}
      <Route path="/:lang" element={<LanguageRouter />}>
        <Route index element={<Navigate to="video" replace />} />
        <Route path="video" element={<Home />} />
        <Route path="video/following" element={<Navigate to="../video?feed=following" replace />} />
        <Route path="video/free" element={<Navigate to="../video?feed=free" replace />} />
        <Route path="video/members" element={<Navigate to="../video?feed=members" replace />} />
        <Route path="video/history" element={<Navigate to="../video?feed=history" replace />} />
        <Route path="video/watch/:videoId" element={<Watch />} />
        <Route path="video/edit/:videoId" element={<EditVideo />} />
        <Route path="video/channel" element={<MyChannel />} />
        <Route path="video/channel/:channelId" element={<Channel />} />
        <Route path="video/upload" element={<Upload />} />
        <Route path="video/search" element={<Search />} />
        <Route path="settings" element={<Settings />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/export" element={<ExportData />} />
        <Route path="activity" element={<AccountActivity />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="legal" element={<Legal />} />
        <Route path="legal/fractional-agreement" element={<Legal />} />
        <Route path="music" element={<Music />} />
        <Route path="music/artist" element={<MyArtist />} />
        <Route path="music/album/:albumId" element={<Album />} />
        <Route path="music/playlist/:playlistId" element={<Playlist />} />
        <Route path="music/podcast/:podcastId" element={<Podcast />} />
        <Route path="music/upload" element={<MusicUpload />} />
        <Route path="music/library" element={<MusicLibrary />} />
        <Route path="music/library/:tab" element={<MusicLibrary />} />
        <Route path="music/podcasts/category/:category" element={<PodcastCategory />} />
        <Route path="music/search" element={<MusicSearch />} />
        <Route path="music/artist/:artistId" element={<MusicArtist />} />
        <Route path="music/track/:trackId" element={<TrackPage />} />
        <Route path="music/track/:trackId/reviews" element={<TrackReviews />} />
        <Route path="music/discover" element={<MusicDiscover />} />
        <Route path="music/leaderboard" element={<MusicLeaderboard />} />
        <Route path="music/albums" element={<AllAlbums />} />
        <Route path="music/playlists" element={<AllPlaylists />} />
        <Route path="music/podcasts" element={<AllPodcasts />} />
        <Route path="music/tracks" element={<AllTracks />} />
        <Route path="music/marketplace" element={<Marketplace />} />
        <Route path="music/marketplace/upload" element={<MarketplaceUpload />} />
        <Route path="music/admin/reanalyze" element={<ReanalyzeTracks />} />
        <Route path="clips" element={<ClipsFeed />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ReferralCapture />
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <ThemeProvider>
              <MusicThemeProvider>
                <PasswordGateProvider>
                  <WalletProvider>
                    <AudioVisualizationProvider>
                      <AudioPlayerProvider>
                      <ScrollbarTheme />
                      <ElectronAppBorder>
                        <PasswordGateModal />
                        <GlobalAudioPlayer />
                        <ElectronTitleBar />
                        <Toaster 
                          position="bottom-center"
                          toastOptions={{
                            style: {
                              background: '#1a1a2e',
                              color: '#fff',
                              border: '1px solid rgba(112, 199, 186, 0.3)',
                            },
                          }}
                        />
                        <PageTransitionProvider>
                          <PageTransition>
                            <AppRoutes />
                          </PageTransition>
                        </PageTransitionProvider>
                      </ElectronAppBorder>
                    </AudioPlayerProvider>
                    </AudioVisualizationProvider>
                  </WalletProvider>
                </PasswordGateProvider>
              </MusicThemeProvider>
            </ThemeProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
