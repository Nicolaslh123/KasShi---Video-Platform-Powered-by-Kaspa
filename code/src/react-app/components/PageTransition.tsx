import { ReactNode, useMemo } from "react";
import { usePageTransition } from "../contexts/PageTransitionContext";
import { 
  Music, Headphones, Guitar, Mic2, Music2, Disc3,
  Camera, Tv, Film, Clapperboard, Video, Play,
} from "lucide-react";

interface PageTransitionProps {
  children: ReactNode;
}

const musicIcons = [Music, Headphones, Guitar, Mic2, Music2, Disc3];
const videoIcons = [Camera, Tv, Film, Clapperboard, Video, Play];

export default function PageTransition({ children }: PageTransitionProps) {
  const { isTransitioning, transitionDirection } = usePageTransition();
  
  const isToMusic = transitionDirection === "to-music";
  const isToVideo = transitionDirection === "to-video";

  // Music icon data (maximalist)
  const musicIconData = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const radius = 32 + (i % 4) * 9;
      return {
        id: i,
        startX: 50,
        startY: 50,
        endX: 50 + Math.cos(angle) * radius,
        endY: 50 + Math.sin(angle) * radius,
        rotation: (angle * 180 / Math.PI) + (i % 2 === 0 ? 90 : -45),
        delay: i * 18,
        iconIndex: i % musicIcons.length,
        size: 24 + (i % 3) * 8,
      };
    });
  }, []);

  const keyframes = `
    @keyframes spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
    @keyframes pulse-ring { 0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.75; } 50% { transform: translate(-50%, -50%) scale(1.25); opacity: 0.25; } }
    @keyframes eq-bounce { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.35); } }
    @keyframes float-icon { 0%, 100% { transform: translate(-50%, -50%) translateY(0px) rotate(var(--rot)); } 50% { transform: translate(-50%, -50%) translateY(-12px) rotate(calc(var(--rot) + 18deg)); } }
    @keyframes shutter-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }
    @keyframes iris-pulse { 0%, 100% { transform: translate(-50%, -50%) scale(1); box-shadow: 0 0 35px rgba(112,199,186,0.6), inset 0 0 25px rgba(112,199,186,0.3); } 50% { transform: translate(-50%, -50%) scale(1.12); box-shadow: 0 0 55px rgba(112,199,186,0.9), inset 0 0 40px rgba(112,199,186,0.5); } }
    @keyframes scanline { from { transform: translateY(-100%); } to { transform: translateY(100vh); } }
    @keyframes camera-zoom { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.18); } }
    @keyframes corner-blink { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.35; } }
    @keyframes glow-pulse { 0%, 100% { filter: drop-shadow(0 0 12px currentColor); } 50% { filter: drop-shadow(0 0 28px currentColor) drop-shadow(0 0 45px currentColor); } }
    @keyframes ring-expand { 0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; } }
    @keyframes digital-grid { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }
    @keyframes data-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes data-scroll-reverse { from { transform: translateX(-50%); } to { transform: translateX(0); } }
  `;

  // ====================== MUSIC OVERLAY (Maximalist) ======================
  const MusicOverlay = () => (
    <div className={`fixed inset-0 z-[9999] pointer-events-none overflow-hidden transition-opacity duration-150 ${isTransitioning ? "opacity-100" : "opacity-0"}`}>
      <div className={`absolute inset-0 bg-gradient-to-br from-black/80 via-purple-950/60 to-black/80 ${isTransitioning ? "opacity-100" : "opacity-0"}`} />

      {/* Spinning Vinyl */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animation: isTransitioning ? "spin 1.8s linear infinite" : "none", opacity: isTransitioning ? 1 : 0 }}>
        <div className="w-52 h-52 rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-8 border-slate-500 relative shadow-[0_0_60px_-10px] shadow-purple-500/50">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-slate-400/30" style={{ top: `${6 + i*5.5}%`, left: `${6 + i*5.5}%`, right: `${6 + i*5.5}%`, bottom: `${6 + i*5.5}%` }} />
          ))}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 via-pink-400 to-orange-400 flex items-center justify-center shadow-inner">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-[10px] font-bold tracking-[2px] rotate-12">MUSIC</div>
          </div>
        </div>
      </div>

      {/* Soundwave Rings */}
      {[...Array(5)].map((_, i) => (
        <div key={`ring-${i}`} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4" 
          style={{
            width: `${180 + i*35}px`, height: `${180 + i*35}px`,
            borderColor: ["#a855f7","#ec4899","#f97316","#22d3ee","#70c7ba"][i],
            animation: isTransitioning ? `ring-expand ${900 + i*120}ms ease-out infinite` : "none",
            animationDelay: `${i*80}ms`,
          }}
        />
      ))}

      {/* Dense Equalizer */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center items-end gap-px h-40 px-6">
        {[...Array(48)].map((_, i) => {
          const baseHeight = 45 + Math.sin((i / 48) * Math.PI * 5) * 55;
          return (
            <div key={`eq-${i}`} className="flex-1 max-w-[3px] rounded-t"
              style={{
                height: isTransitioning ? `${baseHeight}%` : "8%",
                background: `linear-gradient(to top, #a855f7, #ec4899, #f97316, #22d3ee)`,
                animation: isTransitioning ? `eq-bounce ${280 + (i%7)*80}ms ease-in-out infinite alternate` : "none",
                animationDelay: `${i*12}ms`,
              }}
            />
          );
        })}
      </div>

      {/* Floating Icons */}
      {musicIconData.map((data) => {
        const IconComponent = musicIcons[data.iconIndex];
        const colors = ["text-purple-400", "text-pink-400", "text-orange-400", "text-cyan-400", "text-teal-400"];
        return (
          <div key={`icon-${data.id}`} className={`absolute ${colors[data.id % colors.length]}`}
            style={{
              left: `${isTransitioning ? data.endX : data.startX}%`,
              top: `${isTransitioning ? data.endY : data.startY}%`,
              "--rot": `${data.rotation}deg`,
              opacity: isTransitioning ? 1 : 0,
              transition: `left 420ms cubic-bezier(0.34,1.56,0.64,1), top 420ms cubic-bezier(0.34,1.56,0.64,1), opacity 180ms ease-out`,
              transitionDelay: `${data.delay}ms`,
              animation: isTransitioning ? `float-icon 1.4s ease-in-out infinite, glow-pulse 900ms ease-in-out infinite` : "none",
            } as React.CSSProperties}
          >
            <IconComponent size={data.size} strokeWidth={2.25} />
          </div>
        );
      })}
    </div>
  );

  // ====================== VIDEO OVERLAY (Professional Kaspa HUD) ======================
  const VideoOverlay = () => (
    <div className={`fixed inset-0 z-[9999] pointer-events-none overflow-hidden transition-opacity duration-120 ${isTransitioning ? "opacity-100" : "opacity-0"}`}>
      
      {/* Subtle Kaspa grid */}
      <div className={`absolute inset-0 opacity-10 transition-opacity duration-300 ${isTransitioning ? "opacity-10" : "opacity-0"}`}
        style={{
          backgroundImage: `linear-gradient(rgba(112,199,186,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(112,199,186,0.15) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          animation: isTransitioning ? "digital-grid 8s linear infinite" : "none",
        }}
      />

      {/* Shutter Blades */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * 360;
        return (
          <div key={`blade-${i}`} className="absolute top-1/2 left-1/2 origin-left"
            style={{
              width: "140vmax",
              height: "22vmax",
              background: `linear-gradient(90deg, rgb(15,23,42) 0%, rgb(30,41,59) 25%, rgb(112,199,186) 50%, rgb(30,41,59) 75%, rgb(15,23,42) 100%)`,
              transform: `rotate(${angle}deg) translateX(${isTransitioning ? "0%" : "120%"})`,
              transition: `transform 420ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transitionDelay: `${i * 18}ms`,
              borderTop: "1px solid rgba(112,199,186,0.45)",
              animation: isTransitioning ? "shutter-pulse 900ms ease-in-out infinite" : "none",
            }}
          />
        );
      })}

      {/* Central Iris + Camera */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-8 border-[#70c7ba]"
        style={{
          width: isTransitioning ? "148px" : "0px",
          height: isTransitioning ? "148px" : "0px",
          transition: "all 420ms cubic-bezier(0.34,1.56,0.64,1)",
          transitionDelay: "120ms",
          animation: isTransitioning ? "iris-pulse 1.1s ease-in-out infinite" : "none",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Camera size={58} className="text-[#70c7ba]" strokeWidth={1.25} 
            style={{ filter: "drop-shadow(0 0 30px rgba(112,199,186,0.85)) drop-shadow(0 0 12px rgba(255,255,255,0.3))" }} 
          />
        </div>
      </div>

      {/* === FIXED FULL-WIDTH ROLLING KASPA DATA STRIPS === */}

      {/* Top Bar - Scrolling LEFT (fast & dense) */}
      <div className="absolute top-6 left-0 right-0 h-14 overflow-hidden z-10">
        <div 
          className="flex h-full will-change-transform"
          style={{ 
            width: "200%", 
            animation: isTransitioning ? "data-scroll 1.6s linear infinite" : "none" 
          }}
        >
          {[...Array(32)].map((_, i) => (
            <div key={`top-${i}`} className="flex-shrink-0 h-full w-16 flex items-center justify-center border-r border-[#70c7ba]/30">
              <div className="text-[#70c7ba] text-xs font-mono font-bold tracking-widest flex flex-col items-center gap-0.5">
                KAS
                {(() => {
                  const Icon = videoIcons[i % videoIcons.length];
                  return <Icon size={17} className="opacity-75" />;
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar - Scrolling RIGHT (fast & dense) - now fully visible from start */}
      <div className="absolute bottom-6 left-0 right-0 h-14 overflow-hidden z-10">
        <div 
          className="flex h-full will-change-transform"
          style={{ 
            width: "200%", 
            animation: isTransitioning ? "data-scroll-reverse 1.6s linear infinite" : "none" 
          }}
        >
          {[...Array(32)].map((_, i) => (
            <div key={`bot-${i}`} className="flex-shrink-0 h-full w-16 flex items-center justify-center border-r border-[#70c7ba]/30">
              <Play size={19} className="text-[#70c7ba] opacity-75" />
            </div>
          ))}
        </div>
      </div>

      {/* Clean Scanline */}
      <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[#70c7ba] to-transparent"
        style={{
          animation: isTransitioning ? "scanline 1.1s linear infinite" : "none",
          boxShadow: "0 0 12px rgba(112,199,186,0.6)",
        }}
      />

      {/* Corner HUD Markers */}
      {[
        { top: "10%", left: "8%" }, { top: "10%", right: "8%" },
        { bottom: "10%", right: "8%" }, { bottom: "10%", left: "8%" },
      ].map((pos, i) => (
        <div key={`corner-${i}`} className="absolute w-14 h-14 pointer-events-none"
          style={{ ...pos, opacity: isTransitioning ? 1 : 0, transition: "opacity 280ms ease-out", transitionDelay: `${80 + i*40}ms` }}
        >
          <div className="absolute top-0 left-0 w-full h-px bg-[#70c7ba] shadow-[0_0_10px_#70c7ba]" />
          <div className="absolute top-0 left-0 w-px h-full bg-[#70c7ba] shadow-[0_0_10px_#70c7ba]" />
        </div>
      ))}

      {/* KAS LIVE Indicator */}
      <div className="absolute top-8 right-8 flex items-center gap-2 font-mono text-xs tracking-[1.5px] font-semibold text-[#70c7ba]"
        style={{ opacity: isTransitioning ? 1 : 0, transition: "opacity 250ms ease-out", transitionDelay: "280ms" }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_#ef4444]" />
        KAS LIVE
      </div>
    </div>
  );

  return (
    <>
      <style>{keyframes}</style>

      {isToMusic && <MusicOverlay />}
      {isToVideo && <VideoOverlay />}

      {/* Content */}
      <div className={`transition-all duration-300 ease-out ${isTransitioning 
        ? isToMusic ? "opacity-0 scale-95" : "opacity-0 scale-[0.98]" 
        : "opacity-100 scale-100"}`}>
        {children}
      </div>
    </>
  );
}
