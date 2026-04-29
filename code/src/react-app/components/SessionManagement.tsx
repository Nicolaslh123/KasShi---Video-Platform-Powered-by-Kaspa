import { useState, useEffect } from 'react';
import { X, Monitor, Smartphone, Tablet, MapPin, Clock, Shield, AlertTriangle, Loader2, LogOut, Trash2 } from 'lucide-react';

interface Session {
  id: number;
  sessionId: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  ipAddress: string;
  location: string;
  isCurrent: boolean;
  lastActiveAt: string;
  createdAt: string;
}

interface SessionManagementProps {
  onClose: () => void;
}

export default function SessionManagement({ onClose }: SessionManagementProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      // First track current session
      await fetch('/api/sessions/track', { method: 'POST' });
      
      // Then load all sessions
      const res = await fetch('/api/sessions/list');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to revoke session');
      }
    } catch {
      setError('Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      const res = await fetch('/api/sessions/revoke-others', { method: 'POST' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.isCurrent));
      } else {
        setError('Failed to revoke sessions');
      }
    } catch {
      setError('Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile': return Smartphone;
      case 'tablet': return Tablet;
      default: return Monitor;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const otherSessions = sessions.filter(s => !s.isCurrent);
  const currentSession = sessions.find(s => s.isCurrent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Active Sessions</h2>
              <p className="text-white/50 text-sm">Manage your logged-in devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#70C7BA] animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Current Session */}
            {currentSession && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Current Session
                </h3>
                <SessionCard session={currentSession} getDeviceIcon={getDeviceIcon} formatTime={formatTime} />
              </div>
            )}

            {/* Other Sessions */}
            {otherSessions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white/60">
                    Other Sessions ({otherSessions.length})
                  </h3>
                  <button
                    onClick={handleRevokeAll}
                    disabled={revokingAll}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    {revokingAll ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <LogOut className="w-3 h-3" />
                    )}
                    Log out all
                  </button>
                </div>

                <div className="space-y-3">
                  {otherSessions.map(session => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      getDeviceIcon={getDeviceIcon}
                      formatTime={formatTime}
                      onRevoke={() => handleRevokeSession(session.sessionId)}
                      revoking={revoking === session.sessionId}
                    />
                  ))}
                </div>
              </div>
            )}

            {sessions.length === 1 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                <Shield className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <p className="text-white font-medium mb-1">All Clear</p>
                <p className="text-white/50 text-sm">
                  You're only logged in on this device.
                </p>
              </div>
            )}
          </>
        )}

        {/* Security Tips */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <h4 className="text-sm font-medium text-white/60 mb-3">Security Tips</h4>
          <ul className="text-xs text-white/40 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-[#70C7BA]">•</span>
              Revoke sessions you don't recognize immediately
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#70C7BA]">•</span>
              Log out from shared or public devices after use
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#70C7BA]">•</span>
              Enable PIN lock to protect your wallet
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: Session;
  getDeviceIcon: (type: string) => React.ComponentType<{ className?: string }>;
  formatTime: (dateStr: string) => string;
  onRevoke?: () => void;
  revoking?: boolean;
}

function SessionCard({ session, getDeviceIcon, formatTime, onRevoke, revoking }: SessionCardProps) {
  const DeviceIcon = getDeviceIcon(session.deviceType);
  
  return (
    <div className={`bg-white/5 border rounded-xl p-4 ${session.isCurrent ? 'border-green-500/30' : 'border-white/10'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          session.isCurrent ? 'bg-green-500/20' : 'bg-white/10'
        }`}>
          <DeviceIcon className={`w-5 h-5 ${session.isCurrent ? 'text-green-400' : 'text-white/60'}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-white">{session.deviceName}</span>
            <span className="text-white/40">•</span>
            <span className="text-white/60 text-sm">{session.browser}</span>
            {session.isCurrent && (
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                This device
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {session.location}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(session.lastActiveAt)}
            </span>
          </div>
          
          <p className="text-xs text-white/30 mt-1 font-mono">
            IP: {session.ipAddress}
          </p>
        </div>
        
        {onRevoke && (
          <button
            onClick={onRevoke}
            disabled={revoking}
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
            title="Log out this device"
          >
            {revoking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
