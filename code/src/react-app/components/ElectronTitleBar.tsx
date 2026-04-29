import { useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useMusicTheme } from '../contexts/MusicThemeContext';

// Extend Window interface to include Electron API
declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

// Detect if running inside Electron - computed once at module load for consistency
const ELECTRON_DETECTED = (() => {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return true;
  }
  if (typeof window !== 'undefined' && window.electronAPI) {
    return true;
  }
  return false;
})();

// Theme colors for backgrounds and borders
const themeColors: Record<string, { bg: string; border: string; accent: string }> = {
  moonlight: { 
    bg: 'rgba(15, 23, 42, 0.95)', 
    border: 'rgba(125, 211, 252, 0.5)', 
    accent: 'rgba(125, 211, 252, 0.2)' 
  },
  default: { 
    bg: 'rgba(17, 24, 39, 0.95)', 
    border: 'rgba(112, 199, 186, 0.5)', 
    accent: 'rgba(112, 199, 186, 0.2)' 
  },
  space: { 
    bg: 'rgba(17, 7, 33, 0.95)', 
    border: 'rgba(168, 85, 247, 0.5)', 
    accent: 'rgba(168, 85, 247, 0.2)' 
  },
  ocean: { 
    bg: 'rgba(8, 27, 41, 0.95)', 
    border: 'rgba(34, 211, 238, 0.5)', 
    accent: 'rgba(34, 211, 238, 0.2)' 
  },
  forest: { 
    bg: 'rgba(6, 28, 21, 0.95)', 
    border: 'rgba(52, 211, 153, 0.5)', 
    accent: 'rgba(52, 211, 153, 0.2)' 
  },
  neon: { 
    bg: 'rgba(26, 10, 31, 0.95)', 
    border: 'rgba(244, 114, 182, 0.5)', 
    accent: 'rgba(244, 114, 182, 0.2)' 
  },
  aurora: { 
    bg: 'rgba(10, 27, 33, 0.95)', 
    border: 'rgba(45, 212, 191, 0.5)', 
    accent: 'rgba(45, 212, 191, 0.2)' 
  },
  sunset: { 
    bg: 'rgba(33, 17, 10, 0.95)', 
    border: 'rgba(251, 146, 60, 0.5)', 
    accent: 'rgba(251, 146, 60, 0.2)' 
  },
  galaxy: { 
    bg: 'rgba(15, 10, 33, 0.95)', 
    border: 'rgba(139, 92, 246, 0.5)', 
    accent: 'rgba(139, 92, 246, 0.2)' 
  },
  retro: { 
    bg: 'rgba(33, 25, 10, 0.95)', 
    border: 'rgba(251, 191, 36, 0.5)', 
    accent: 'rgba(251, 191, 36, 0.2)' 
  },
  vapor: { 
    bg: 'rgba(25, 15, 35, 0.95)', 
    border: 'rgba(192, 132, 252, 0.5)', 
    accent: 'rgba(192, 132, 252, 0.2)' 
  },
  cyber: { 
    bg: 'rgba(5, 20, 25, 0.95)', 
    border: 'rgba(0, 255, 255, 0.5)', 
    accent: 'rgba(0, 255, 255, 0.2)' 
  },
};

const videoColors = { 
  bg: 'rgba(15, 23, 42, 0.95)', 
  border: 'rgba(20, 184, 166, 0.5)', 
  accent: 'rgba(20, 184, 166, 0.2)' 
};

export default function ElectronTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const location = useLocation();
  
  let currentThemeId = 'default';
  try {
    const { theme } = useMusicTheme();
    currentThemeId = theme.id;
  } catch {
    // Not in music context
  }

  if (!ELECTRON_DETECTED) {
    return null;
  }

  const isMusicRoute = location.pathname.includes('/music');
  const colors = isMusicRoute 
    ? (themeColors[currentThemeId] || themeColors.default)
    : videoColors;

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => {
    window.electronAPI?.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.electronAPI?.close();

  return (
    <>
      {/* Invisible drag region across the top-left - allows dragging the window */}
      <div 
        className="fixed top-0 left-0 right-[180px] h-8 z-[9998]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      
      {/* Window controls bar - dedicated area with theme background and bottom border */}
      <div 
        className="fixed top-0 right-0 h-8 flex items-center z-[9999] rounded-bl-lg transition-colors duration-300"
        style={{ 
          backgroundColor: colors.bg,
          borderBottom: `1px solid ${colors.border}`,
          borderLeft: `1px solid ${colors.border}`,
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          onMouseEnter={() => setHoveredButton('min')}
          onMouseLeave={() => setHoveredButton(null)}
          className="h-full w-11 flex items-center justify-center transition-all duration-150"
          style={{ 
            backgroundColor: hoveredButton === 'min' ? colors.accent : 'transparent'
          }}
          title="Minimize"
        >
          <Minus className="w-4 h-4 text-white/70" />
        </button>

        {/* Maximize/Restore */}
        <button
          onClick={handleMaximize}
          onMouseEnter={() => setHoveredButton('max')}
          onMouseLeave={() => setHoveredButton(null)}
          className="h-full w-11 flex items-center justify-center transition-all duration-150"
          style={{ 
            backgroundColor: hoveredButton === 'max' ? colors.accent : 'transparent'
          }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 text-white/70" />
          ) : (
            <Square className="w-3.5 h-3.5 text-white/70" />
          )}
        </button>

        {/* Close - red hover */}
        <button
          onClick={handleClose}
          onMouseEnter={() => setHoveredButton('close')}
          onMouseLeave={() => setHoveredButton(null)}
          className="h-full w-11 flex items-center justify-center transition-all duration-150 rounded-tr-lg"
          style={{ 
            backgroundColor: hoveredButton === 'close' ? '#e81123' : 'transparent'
          }}
          title="Close"
        >
          <X className={`w-4 h-4 transition-colors ${hoveredButton === 'close' ? 'text-white' : 'text-white/70'}`} />
        </button>
      </div>
    </>
  );
}

// Hook for other components to check if in Electron and adjust padding
export function useElectronTitleBar() {
  return {
    isElectron: ELECTRON_DETECTED,
    showTitleBar: ELECTRON_DETECTED,
    titleBarHeight: ELECTRON_DETECTED ? 32 : 0,
    titleBarPadding: ELECTRON_DETECTED ? 'pt-8' : ''
  };
}

// App border wrapper for Electron - Spotify-style border around entire app
export function ElectronAppBorder({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  let currentThemeId = 'default';
  try {
    const { theme } = useMusicTheme();
    currentThemeId = theme.id;
  } catch {
    // Not in music context
  }

  if (!ELECTRON_DETECTED) {
    return <>{children}</>;
  }

  const isMusicRoute = location.pathname.includes('/music');
  const colors = isMusicRoute 
    ? (themeColors[currentThemeId] || themeColors.default)
    : videoColors;

  return (
    <div 
      className="min-h-screen w-full transition-all duration-300"
      style={{
        border: `2px solid ${colors.border}`,
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: `0 0 20px ${colors.border.replace('0.5', '0.15')}`
      }}
    >
      {children}
    </div>
  );
}
