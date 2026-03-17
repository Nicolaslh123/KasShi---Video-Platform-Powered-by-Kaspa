import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle2, ArrowUpRight, ArrowDownLeft, Trash2, CheckCheck, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  transaction_id: string | null;
  created_at: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export default function NotificationPanel({ isOpen, onClose, onUnreadCountChange }: NotificationPanelProps) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        const unreadCount = data.notifications?.filter((n: Notification) => !n.is_read).length || 0;
        onUnreadCountChange?.(unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
      );
      const newUnread = notifications.filter(n => n.id !== id && !n.is_read).length;
      onUnreadCountChange?.(newUnread);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      onUnreadCountChange?.(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const clearAll = async () => {
    try {
      await fetch('/api/notifications', { method: 'DELETE' });
      setNotifications([]);
      onUnreadCountChange?.(0);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'sent':
        return <ArrowUpRight className="w-4 h-4 text-orange-400" />;
      case 'received':
        return <ArrowDownLeft className="w-4 h-4 text-[#70C7BA]" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t.notifications?.justNow || 'Just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? t.time.minute : t.time.minutes} ${t.time.ago}`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? t.time.hour : t.time.hours} ${t.time.ago}`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? t.time.day : t.time.days} ${t.time.ago}`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-slate-950 border-l border-white/10 shadow-2xl transform transition-transform duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#70C7BA]" />
            <h2 className="text-lg font-semibold text-white">{t.notifications?.title || 'Notifications'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some(n => !n.is_read) && (
              <button
                onClick={markAllAsRead}
                className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                title={t.notifications?.markAllRead || 'Mark all as read'}
              >
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                title={t.notifications?.clearAll || 'Clear all'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications list */}
        <div className="h-[calc(100%-64px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-[#70C7BA] animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/40">
              <Bell className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">{t.notifications?.noNotifications || 'No notifications yet'}</p>
              <p className="text-xs mt-1">{t.notifications?.transactionUpdatesHere || "You'll see transaction updates here"}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                  className={`p-4 hover:bg-white/5 transition-colors cursor-pointer ${
                    !notification.is_read ? 'bg-white/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${!notification.is_read ? 'text-white' : 'text-white/70'}`}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#70C7BA] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-white/30 mt-1">{formatTime(notification.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
