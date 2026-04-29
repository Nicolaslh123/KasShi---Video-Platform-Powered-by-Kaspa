import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface UserSettings {
  preferred_currency: string;
  notifications_payments: boolean;
  notifications_deposits: boolean;
  notifications_marketing: boolean;
  require_confirm_large: boolean;
  large_payment_threshold: string;
  hide_balance: boolean;
  compact_mode: boolean;
  show_kas_amounts: boolean;
  default_currency_send: string;
  auto_convert_to_kas: boolean;
  theme: 'default' | 'light' | 'dark';
}

const defaultSettings: UserSettings = {
  preferred_currency: 'USD',
  notifications_payments: true,
  notifications_deposits: true,
  notifications_marketing: false,
  require_confirm_large: true,
  large_payment_threshold: '100',
  hide_balance: false,
  compact_mode: false,
  show_kas_amounts: true,
  default_currency_send: 'USD',
  auto_convert_to_kas: true,
  theme: 'default',
};

interface SettingsContextType {
  settings: UserSettings;
  loading: boolean;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

// Helper to convert DB values (0/1) to booleans
function normalizeSettings(data: Record<string, unknown>): UserSettings {
  return {
    preferred_currency: (data.preferred_currency as string) || defaultSettings.preferred_currency,
    notifications_payments: Boolean(data.notifications_payments ?? defaultSettings.notifications_payments),
    notifications_deposits: Boolean(data.notifications_deposits ?? defaultSettings.notifications_deposits),
    notifications_marketing: Boolean(data.notifications_marketing ?? defaultSettings.notifications_marketing),
    require_confirm_large: Boolean(data.require_confirm_large ?? defaultSettings.require_confirm_large),
    large_payment_threshold: (data.large_payment_threshold as string) || defaultSettings.large_payment_threshold,
    hide_balance: Boolean(data.hide_balance ?? defaultSettings.hide_balance),
    compact_mode: Boolean(data.compact_mode ?? defaultSettings.compact_mode),
    show_kas_amounts: Boolean(data.show_kas_amounts ?? defaultSettings.show_kas_amounts),
    default_currency_send: (data.default_currency_send as string) || defaultSettings.default_currency_send,
    auto_convert_to_kas: Boolean(data.auto_convert_to_kas ?? defaultSettings.auto_convert_to_kas),
    theme: (data.theme as UserSettings['theme']) || defaultSettings.theme,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(normalizeSettings(data));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-default', 'theme-light', 'theme-dark');
    root.classList.add(`theme-${settings.theme}`);
    
    // Also set compact mode class
    if (settings.compact_mode) {
      root.classList.add('compact-mode');
    } else {
      root.classList.remove('compact-mode');
    }
  }, [settings.theme, settings.compact_mode]);

  const updateSetting = useCallback(async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      console.error('Failed to save setting:', err);
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSetting, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
