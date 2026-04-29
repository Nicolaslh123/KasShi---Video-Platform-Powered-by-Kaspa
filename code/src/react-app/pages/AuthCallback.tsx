import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@getmocha/users-service/react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { exchangeCodeForSessionToken } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        await exchangeCodeForSessionToken();
        // Track session after successful authentication
        try {
          await fetch('/api/sessions/track', {
            method: 'POST',
            credentials: 'include',
          });
        } catch (trackError) {
          // Session tracking is non-critical, just log it
          console.log('Session tracking skipped:', trackError);
        }
        navigate('/');
      } catch (error) {
        console.error('Failed to exchange code for session token:', error);
        navigate('/');
      }
    };

    handleCallback();
  }, [exchangeCodeForSessionToken, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[#70C7BA]/30 border-t-[#70C7BA] rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white/60">Completing sign in...</p>
      </div>
    </div>
  );
}
