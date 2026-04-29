import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "@getmocha/users-service/react";
import { useLocalizedPath } from "../components/LocalizedLink";
import { Loader2 } from "lucide-react";

export default function MyChannel() {
  const navigate = useNavigate();
  const { channel, isLoading, externalWallet } = useWallet();
  const { user } = useAuth();
  const buildPath = useLocalizedPath();

  const isLoggedIn = !!(user || externalWallet);

  useEffect(() => {
    if (isLoading) return;

    if (!isLoggedIn) {
      // Not logged in - redirect to home
      navigate(buildPath("/video"), { replace: true });
      return;
    }

    if (channel?.handle) {
      // Has a channel - go to their channel page
      navigate(buildPath(`/video/channel/${channel.handle}`), { replace: true });
    } else {
      // Logged in but no channel - go to upload/create channel page
      navigate(buildPath("/video/upload"), { replace: true });
    }
  }, [isLoading, isLoggedIn, channel, navigate, buildPath]);

  // Show loading state while determining where to redirect
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
        <p className="text-slate-400 text-sm">Loading your channel...</p>
      </div>
    </div>
  );
}
