import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import { useMusicProfile } from "../hooks/useMusic";
import { useLocalizedPath } from "../components/LocalizedLink";
import { Loader2 } from "lucide-react";

export default function MyArtist() {
  const navigate = useNavigate();
  const { externalWallet, isLoading: walletLoading } = useWallet();
  const { user } = useAuth();
  const { profile, loading: profileLoading, hasProfile, fetchProfile } = useMusicProfile();
  const buildPath = useLocalizedPath();
  const [hasRefetchedWithAuth, setHasRefetchedWithAuth] = useState(false);

  const isLoggedIn = !!(user || externalWallet);
  
  // Refetch profile once wallet is loaded with auth
  useEffect(() => {
    if (!walletLoading && isLoggedIn && !hasRefetchedWithAuth) {
      setHasRefetchedWithAuth(true);
      fetchProfile();
    }
  }, [walletLoading, isLoggedIn, hasRefetchedWithAuth, fetchProfile]);

  // Wait for wallet AND the authenticated profile fetch
  const isLoading = walletLoading || profileLoading || (isLoggedIn && !hasRefetchedWithAuth);

  useEffect(() => {
    if (isLoading) return;

    if (!isLoggedIn) {
      // Not logged in - redirect to music home
      navigate(buildPath("/music"), { replace: true });
      return;
    }

    if (hasProfile && profile?.id) {
      // Has a music profile - go to their artist page
      navigate(buildPath(`/music/artist/${profile.id}`), { replace: true });
    } else {
      // Logged in but no profile - go to music page where they can create one
      navigate(buildPath("/music"), { replace: true });
    }
  }, [isLoading, isLoggedIn, hasProfile, profile, navigate, buildPath]);

  // Show loading state while determining where to redirect
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
        <p className="text-slate-400 text-sm">Loading your artist profile...</p>
      </div>
    </div>
  );
}
