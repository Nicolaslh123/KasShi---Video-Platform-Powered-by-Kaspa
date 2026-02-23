import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@getmocha/users-service/react";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import Channel from "./pages/Channel";
import Upload from "./pages/Upload";
import Settings from "./pages/Settings";
import Search from "./pages/Search";
import Admin from "./pages/Admin";
import EditVideo from "./pages/EditVideo";
import AuthCallback from "./pages/AuthCallback";
import Legal from "./pages/Legal";
import { Toaster } from "react-hot-toast";
import { WalletProvider } from "./contexts/WalletContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PasswordGateProvider } from "./contexts/PasswordGateContext";
import PasswordGateModal from "./components/PasswordGateModal";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <ThemeProvider>
      <PasswordGateProvider>
      <WalletProvider>
        <PasswordGateModal />
        <BrowserRouter>
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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watch/:videoId" element={<Watch />} />
          <Route path="/edit/:videoId" element={<EditVideo />} />
          <Route path="/channel/:channelId" element={<Channel />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/legal" element={<Legal />} />
        </Routes>
        </BrowserRouter>
      </WalletProvider>
      </PasswordGateProvider>
      </ThemeProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
