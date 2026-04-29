import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionContextType {
  isTransitioning: boolean;
  transitionDirection: "to-music" | "to-video" | null;
}

const PageTransitionContext = createContext<PageTransitionContextType>({
  isTransitioning: false,
  transitionDirection: null,
});

export function usePageTransition() {
  return useContext(PageTransitionContext);
}

// Generate a smooth cyber whoosh sound using Web Audio API
function playCyberSound(direction: "to-music" | "to-video") {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Longer fade time to eliminate clicks
    const fadeIn = 0.08;
    
    // Create oscillators
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    
    // Gain nodes
    const gain1 = audioContext.createGain();
    const gain2 = audioContext.createGain();
    const masterGain = audioContext.createGain();
    
    // Filter for smooth sweeping
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    
    // Connect
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(filter);
    gain2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(audioContext.destination);
    
    // Start gains at 0 to prevent click
    gain1.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0, now);
    masterGain.gain.setValueAtTime(0.4, now);
    
    if (direction === "to-music") {
      // Ascending smooth whoosh for music - warmer, richer
      osc1.type = "sine";
      osc2.type = "sine";
      
      // Gentle frequency sweep
      osc1.frequency.setValueAtTime(180, now);
      osc1.frequency.exponentialRampToValueAtTime(500, now + 0.3);
      
      osc2.frequency.setValueAtTime(270, now);
      osc2.frequency.exponentialRampToValueAtTime(750, now + 0.35);
      
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.2);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
      
      // Smooth envelope - fade in, hold, fade out
      gain1.gain.linearRampToValueAtTime(0.06, now + fadeIn);
      gain1.gain.setValueAtTime(0.06, now + 0.2);
      gain1.gain.linearRampToValueAtTime(0, now + 0.4);
      
      gain2.gain.linearRampToValueAtTime(0.04, now + fadeIn);
      gain2.gain.setValueAtTime(0.04, now + 0.22);
      gain2.gain.linearRampToValueAtTime(0, now + 0.42);
      
    } else {
      // Descending smooth whoosh for video - clean, minimal
      osc1.type = "sine";
      osc2.type = "triangle";
      
      osc1.frequency.setValueAtTime(400, now);
      osc1.frequency.exponentialRampToValueAtTime(120, now + 0.25);
      
      osc2.frequency.setValueAtTime(600, now);
      osc2.frequency.exponentialRampToValueAtTime(180, now + 0.3);
      
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.25);
      
      // Smooth envelope
      gain1.gain.linearRampToValueAtTime(0.05, now + fadeIn);
      gain1.gain.setValueAtTime(0.05, now + 0.15);
      gain1.gain.linearRampToValueAtTime(0, now + 0.35);
      
      gain2.gain.linearRampToValueAtTime(0.03, now + fadeIn);
      gain2.gain.setValueAtTime(0.03, now + 0.18);
      gain2.gain.linearRampToValueAtTime(0, now + 0.38);
    }
    
    // Start oscillators
    osc1.start(now);
    osc2.start(now);
    
    // Stop well after fade out completes
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
    
    // Clean up
    setTimeout(() => {
      audioContext.close();
    }, 600);
  } catch (e) {
    console.log("Audio not available:", e);
  }
}

function isMusicRoute(pathname: string): boolean {
  return pathname.includes("/music");
}

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<"to-music" | "to-video" | null>(null);
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const hasInteractedRef = useRef(false);

  // Track user interaction for audio
  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
    };
    window.addEventListener("click", handleInteraction, { once: true });
    window.addEventListener("keydown", handleInteraction, { once: true });
    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    const currentPath = location.pathname;
    
    const wasMusic = isMusicRoute(prevPath);
    const isMusic = isMusicRoute(currentPath);
    
    // Only trigger transition when switching between video and music sections
    if (wasMusic !== isMusic && prevPath !== currentPath) {
      const direction = isMusic ? "to-music" : "to-video";
      setTransitionDirection(direction);
      setIsTransitioning(true);
      
      // Play sound only if user has interacted
      if (hasInteractedRef.current) {
        playCyberSound(direction);
      }
      
      // End transition after animation - longer for maximalist music transition
      const duration = direction === "to-music" ? 1200 : 1200;
      setTimeout(() => {
        setIsTransitioning(false);
        setTransitionDirection(null);
      }, duration);
    }
    
    prevPathRef.current = currentPath;
  }, [location.pathname]);

  return (
    <PageTransitionContext.Provider value={{ isTransitioning, transitionDirection }}>
      {children}
    </PageTransitionContext.Provider>
  );
}
