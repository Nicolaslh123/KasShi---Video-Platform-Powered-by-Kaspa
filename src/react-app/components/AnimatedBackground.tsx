import { useEffect, useRef, memo } from 'react';

interface AnimatedBackgroundProps {
  themeId: string;
  accent: string;
}

// Preload all theme background images on first render
let imagesPreloaded = false;
function preloadThemeImages() {
  if (imagesPreloaded) return;
  imagesPreloaded = true;
  
  const imageUrls = [
    'https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/fotor_2026-03-01_01-33-03.jpg',
    'https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ocean-coral-reef.jpg',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80',
    'https://media.giphy.com/media/mjTpgz6FGNVDoMg5lx/giphy.gif',
    'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80',
    'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=80',
    'https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ufdhqj0kdlo31.jpg'
  ];
  
  imageUrls.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

// Theme base colors for body background
const themeBaseColors: Record<string, string> = {
  space: '#0a0a1a',
  ocean: '#0a2535',
  forest: '#0a1a0f',
  neon: '#0a0012',
  aurora: '#0c1a1a',
  sunset: '#1a0f05',
  minimal: '#0a0a0a',
  default: '#0f0f23'
};

// Particle system for stars, bubbles, fireflies etc.
function ParticleCanvas({ 
  particleCount = 50, 
  color = '#ffffff',
  minSize = 1,
  maxSize = 3,
  speed = 0.5,
  direction = 'up' as 'up' | 'down' | 'random',
  glow = false,
  twinkle = false
}: {
  particleCount?: number;
  color?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  direction?: 'up' | 'down' | 'random';
  glow?: boolean;
  twinkle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    opacity: number;
    twinkleSpeed: number;
  }>>([]);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: minSize + Math.random() * (maxSize - minSize),
      speedX: direction === 'random' ? (Math.random() - 0.5) * speed : 0,
      speedY: direction === 'up' ? -speed * (0.5 + Math.random() * 0.5) : 
              direction === 'down' ? speed * (0.5 + Math.random() * 0.5) : 
              (Math.random() - 0.5) * speed,
      opacity: 0.3 + Math.random() * 0.7,
      twinkleSpeed: 0.01 + Math.random() * 0.02
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach(particle => {
        // Update position
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        // Twinkle effect
        if (twinkle) {
          particle.opacity += Math.sin(Date.now() * particle.twinkleSpeed) * 0.02;
          particle.opacity = Math.max(0.2, Math.min(1, particle.opacity));
        }

        // Wrap around edges
        if (particle.y < -10) particle.y = canvas.height + 10;
        if (particle.y > canvas.height + 10) particle.y = -10;
        if (particle.x < -10) particle.x = canvas.width + 10;
        if (particle.x > canvas.width + 10) particle.x = -10;

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        
        if (glow) {
          ctx.shadowBlur = particle.size * 4;
          ctx.shadowColor = color;
        }
        
        ctx.fillStyle = color.replace(')', `, ${particle.opacity})`).replace('rgb', 'rgba');
        if (!color.includes('rgb')) {
          ctx.globalAlpha = particle.opacity;
          ctx.fillStyle = color;
        }
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [particleCount, color, minSize, maxSize, speed, direction, glow, twinkle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.8 }}
    />
  );
}

// Underwater ocean effect with coral reef background
function UnderwaterEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Rising bubbles */}
      <ParticleCanvas 
        particleCount={35}
        color="rgba(255, 255, 255, 0.5)"
        minSize={2}
        maxSize={6}
        speed={0.6}
        direction="up"
      />
      
      {/* Cyan light particles */}
      <ParticleCanvas 
        particleCount={20}
        color="#22d3ee"
        minSize={1}
        maxSize={3}
        speed={0.3}
        direction="up"
        glow={true}
      />
      
      {/* Soft teal floating particles */}
      <ParticleCanvas 
        particleCount={15}
        color="#2dd4bf"
        minSize={1}
        maxSize={2}
        speed={0.2}
        direction="random"
        glow={true}
        twinkle={true}
      />
    </div>
  );
}

// Space astronaut effect with moving particles
function SpaceEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Moving white stars */}
      <ParticleCanvas 
        particleCount={60}
        color="#ffffff"
        minSize={0.5}
        maxSize={2}
        speed={0.3}
        direction="random"
        twinkle={true}
      />
      
      {/* Moving purple/pink particles */}
      <ParticleCanvas 
        particleCount={25}
        color="#a78bfa"
        minSize={1}
        maxSize={3}
        speed={0.4}
        direction="random"
        glow={true}
      />
      
      {/* Moving cyan particles */}
      <ParticleCanvas 
        particleCount={20}
        color="#22d3ee"
        minSize={1}
        maxSize={2.5}
        speed={0.35}
        direction="random"
        glow={true}
      />
      
      {/* Slow-moving large glowing orbs */}
      <ParticleCanvas 
        particleCount={8}
        color="#ec4899"
        minSize={3}
        maxSize={5}
        speed={0.15}
        direction="random"
        glow={true}
        twinkle={true}
      />
    </div>
  );
}

// Forest with fireflies
function ForestEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Mist layers */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(180deg, transparent 0%, rgba(16, 185, 129, 0.1) 50%, rgba(6, 95, 70, 0.2) 100%)
          `,
          animation: 'mistDrift 15s ease-in-out infinite'
        }}
      />
      {/* Fireflies */}
      <ParticleCanvas 
        particleCount={40}
        color="#fde047"
        minSize={2}
        maxSize={4}
        speed={0.3}
        direction="random"
        glow={true}
        twinkle={true}
      />
      <style>{`
        @keyframes mistDrift {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 0.4; transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}

// Synthwave neon city effect with animated GIF background
function NeonEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Floating neon particles for extra depth */}
      <ParticleCanvas 
        particleCount={20}
        color="#ff69b4"
        minSize={1}
        maxSize={2}
        speed={0.2}
        direction="up"
        glow={true}
      />
    </div>
  );
}

// Aurora borealis effect with northern lights photo
function AuroraEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Twinkling stars */}
      <ParticleCanvas 
        particleCount={50}
        color="#ffffff"
        minSize={0.5}
        maxSize={1.5}
        speed={0.05}
        direction="random"
        twinkle={true}
      />
      
      {/* Floating teal/cyan aurora particles */}
      <ParticleCanvas 
        particleCount={25}
        color="#2dd4bf"
        minSize={1}
        maxSize={3}
        speed={0.25}
        direction="up"
        glow={true}
        twinkle={true}
      />
      
      {/* Green aurora glow particles */}
      <ParticleCanvas 
        particleCount={20}
        color="#34d399"
        minSize={1}
        maxSize={2.5}
        speed={0.2}
        direction="random"
        glow={true}
      />
      
      {/* Slow-moving large glowing orbs */}
      <ParticleCanvas 
        particleCount={8}
        color="#22d3ee"
        minSize={3}
        maxSize={5}
        speed={0.1}
        direction="random"
        glow={true}
        twinkle={true}
      />
    </div>
  );
}

// Sunset/golden hour particles
function SunsetEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Warm glow */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 100%, rgba(251, 146, 60, 0.2) 0%, transparent 70%)',
          animation: 'sunGlow 10s ease-in-out infinite'
        }}
      />
      {/* Floating dust particles */}
      <ParticleCanvas 
        particleCount={40}
        color="#fcd34d"
        minSize={1}
        maxSize={3}
        speed={0.2}
        direction="random"
        glow={true}
      />
      <style>{`
        @keyframes sunGlow {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Default midnight theme with moonlit mountain scene
function DefaultEffect({ accent }: { accent: string }) {
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* Floating particles */}
      <ParticleCanvas 
        particleCount={40}
        color={accent}
        minSize={1}
        maxSize={2.5}
        speed={0.2}
        direction="random"
        glow={true}
        twinkle={true}
      />
      
      {/* Additional subtle white stars */}
      <ParticleCanvas 
        particleCount={25}
        color="#ffffff"
        minSize={0.5}
        maxSize={1.5}
        speed={0.1}
        direction="random"
        twinkle={true}
      />
    </div>
  );
}

// Theme background images - use null for themes that should have no background image
const themeBackgrounds: Record<string, string | null> = {
  space: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/fotor_2026-03-01_01-33-03.jpg)',
  ocean: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ocean-coral-reef.jpg)',
  forest: 'url(https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80)',
  neon: 'url(https://media.giphy.com/media/mjTpgz6FGNVDoMg5lx/giphy.gif)',
  aurora: 'url(https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80)',
  sunset: 'url(https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=80)',
  minimal: null,
  default: 'url(https://019c0f5d-4b05-7157-9c49-90a9187d1eb1.mochausercontent.com/ufdhqj0kdlo31.jpg)'
};

function AnimatedBackgroundInner({ themeId, accent }: AnimatedBackgroundProps) {
  // Preload all theme images on first render
  useEffect(() => {
    preloadThemeImages();
  }, []);
  
  // Set background directly on html element for full coverage
  useEffect(() => {
    const baseColor = themeBaseColors[themeId] || themeBaseColors.default;
    // Check if theme has explicit background (use hasOwnProperty to distinguish null from undefined)
    const bgImage = themeId in themeBackgrounds 
      ? themeBackgrounds[themeId] 
      : themeBackgrounds.default;
    
    document.documentElement.style.backgroundColor = baseColor;
    document.documentElement.style.backgroundImage = bgImage || 'none';
    document.documentElement.style.backgroundSize = 'cover';
    document.documentElement.style.backgroundPosition = 'center';
    document.documentElement.style.backgroundRepeat = 'no-repeat';
    document.documentElement.style.backgroundAttachment = 'fixed';
    
    document.body.style.backgroundColor = 'transparent';
    
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.documentElement.style.backgroundImage = '';
      document.documentElement.style.backgroundSize = '';
      document.documentElement.style.backgroundPosition = '';
      document.documentElement.style.backgroundRepeat = '';
      document.documentElement.style.backgroundAttachment = '';
      document.body.style.backgroundColor = '';
    };
  }, [themeId]);
  
  switch (themeId) {
    case 'space':
      return <SpaceEffect />;
    case 'ocean':
      return <UnderwaterEffect />;
    case 'forest':
      return <ForestEffect />;
    case 'neon':
      return <NeonEffect />;
    case 'aurora':
      return <AuroraEffect />;
    case 'sunset':
      return <SunsetEffect />;
    case 'minimal':
      return null;
    default:
      return <DefaultEffect accent={accent} />;
  }
}

// Memoize to prevent re-renders
const AnimatedBackground = memo(AnimatedBackgroundInner);
export default AnimatedBackground;
