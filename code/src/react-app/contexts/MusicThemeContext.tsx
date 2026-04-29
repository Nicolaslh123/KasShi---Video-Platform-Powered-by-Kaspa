import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface MusicTheme {
  id: string;
  name: string;
  background: string; // URL or gradient
  overlay: string; // CSS for overlay effect
  accent: string; // Accent color for UI elements
}

// These backgrounds must match AnimatedBackground.tsx themeBackgrounds exactly
const themes: MusicTheme[] = [
  {
    id: 'moonlight',
    name: 'Moonlight',
    background: 'linear-gradient(135deg, #1a2a4a 0%, #2d3a5c 30%, #1e3a5f 60%, #0f2847 100%)',
    overlay: 'bg-blue-950/20',
    accent: '#7dd3fc'
  },
  {
    id: 'default',
    name: 'Midnight',
    background: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ufdhqj0kdlo31.jpg)',
    overlay: 'bg-black/20',
    accent: '#70C7BA'
  },
  {
    id: 'space',
    name: 'Deep Space',
    background: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/fotor_2026-03-01_01-33-03.jpg)',
    overlay: 'bg-black/60',
    accent: '#a855f7'
  },
  {
    id: 'ocean',
    name: 'Ocean Depths',
    background: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ocean-coral-reef.jpg)',
    overlay: 'bg-blue-950/70',
    accent: '#22d3ee'
  },
  // TEMPORARILY DISABLED - reactive-ocean theme
  // {
  //   id: 'reactive-ocean',
  //   name: 'Reactive Ocean',
  //   background: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ocean-coral-reef.jpg)',
  //   overlay: 'bg-blue-950/60',
  //   accent: '#22d3ee'
  // },
  {
    id: 'forest',
    name: 'Enchanted Forest',
    background: 'url(https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80)',
    overlay: 'bg-emerald-950/70',
    accent: '#34d399'
  },
  {
    id: 'neon',
    name: 'Neon City',
    background: 'url(https://media.giphy.com/media/mjTpgz6FGNVDoMg5lx/giphy.gif)',
    overlay: 'bg-fuchsia-950/60',
    accent: '#f472b6'
  },
  {
    id: 'aurora',
    name: 'Aurora',
    background: 'url(https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80)',
    overlay: 'bg-black/10',
    accent: '#2dd4bf'
  },
  {
    id: 'sunset',
    name: 'Golden Hour',
    background: 'url(https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=80)',
    overlay: 'bg-orange-950/60',
    accent: '#fb923c'
  },
  {
    id: 'minimal',
    name: 'Minimal Dark',
    background: '#0a0a0a',
    overlay: '',
    accent: '#ffffff'
  }
];

interface MusicThemeContextValue {
  theme: MusicTheme;
  setThemeById: (id: string) => void;
  themes: MusicTheme[];
}

const MusicThemeContext = createContext<MusicThemeContextValue | null>(null);

export function MusicThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MusicTheme>(themes[0]);

  useEffect(() => {
    const savedThemeId = localStorage.getItem('kasshi_music_theme');
    if (savedThemeId) {
      const savedTheme = themes.find(t => t.id === savedThemeId);
      if (savedTheme) setTheme(savedTheme);
    }
  }, []);

  const setThemeById = (id: string) => {
    const newTheme = themes.find(t => t.id === id);
    if (newTheme) {
      setTheme(newTheme);
      localStorage.setItem('kasshi_music_theme', id);
    }
  };

  return (
    <MusicThemeContext.Provider value={{ theme, setThemeById, themes }}>
      {children}
    </MusicThemeContext.Provider>
  );
}

export function useMusicTheme() {
  const context = useContext(MusicThemeContext);
  if (!context) {
    throw new Error('useMusicTheme must be used within a MusicThemeProvider');
  }
  return context;
}
