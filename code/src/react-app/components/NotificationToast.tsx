import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ArrowUpRight, ArrowDownLeft, X, Info, AlertTriangle } from 'lucide-react';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'sent' | 'received';
  title: string;
  message: string;
  duration?: number;
}

interface NotificationToastProps {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
  sent: ArrowUpRight,
  received: ArrowDownLeft,
};

const COLORS = {
  success: 'from-green-500/20 to-green-600/20 border-green-500/30',
  error: 'from-red-500/20 to-red-600/20 border-red-500/30',
  info: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
  warning: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
  sent: 'from-orange-500/20 to-orange-600/20 border-orange-500/30',
  received: 'from-[#70C7BA]/20 to-[#49EACB]/20 border-[#70C7BA]/30',
};

const ICON_COLORS = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  sent: 'text-orange-400',
  received: 'text-[#70C7BA]',
};

function Toast({ notification, onDismiss }: { notification: ToastNotification; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = ICONS[notification.type];
  
  useEffect(() => {
    const duration = notification.duration || 5000;
    const exitTimer = setTimeout(() => setIsExiting(true), duration - 300);
    const dismissTimer = setTimeout(onDismiss, duration);
    
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [notification.duration, onDismiss]);

  return (
    <div 
      className={`
        relative w-full max-w-sm bg-gradient-to-r ${COLORS[notification.type]} 
        backdrop-blur-xl border rounded-xl p-4 shadow-2xl
        transform transition-all duration-300 ease-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${ICON_COLORS[notification.type]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{notification.title}</p>
          <p className="text-xs text-white/70 mt-0.5 truncate">{notification.message}</p>
        </div>
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(onDismiss, 300);
          }}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-b-xl overflow-hidden">
        <div 
          className={`h-full ${ICON_COLORS[notification.type].replace('text-', 'bg-')}`}
          style={{
            animation: `shrink ${notification.duration || 5000}ms linear forwards`,
          }}
        />
      </div>
      
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export default function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <Toast notification={notification} onDismiss={() => onDismiss(notification.id)} />
        </div>
      ))}
    </div>
  );
}
