import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Upload, Image, Sparkles, Info, Loader2, Check, AlertCircle, Eye, ZoomIn, ZoomOut, Move, X } from 'lucide-react';
import { useLocalizedNavigate } from '../components/LanguageRouter';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '@getmocha/users-service/react';
import AnimatedBackground from '../components/AnimatedBackground';
import { KaspaIcon } from '../components/KasShiLogo';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

// Preview Particle Canvas component - full screen
function PreviewParticleCanvas({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    
    const resize = () => {
      // Use window dimensions for full screen coverage
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    
    // Create particles
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -Math.random() * 0.5 - 0.2,
        size: Math.random() * 3 + 1,
        alpha: Math.random() * 0.5 + 0.3
      });
    }
    
    // Parse color
    const parseColor = (c: string) => {
      if (c.startsWith('#')) {
        const hex = c.slice(1);
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
      }
      return { r: 255, g: 255, b: 255 };
    };
    const { r, g, b } = parseColor(color);
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
        ctx.fill();
      });
      
      animationId = requestAnimationFrame(animate);
    };
    animate();
    
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [color]);
  
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none w-full h-full"
    />
  );
}

// Theme color presets for easy selection
const COLOR_PRESETS = [
  { name: 'Purple Haze', primary: '#9333ea', secondary: '#6366f1', accent: '#a855f7' },
  { name: 'Ocean Blue', primary: '#0ea5e9', secondary: '#3b82f6', accent: '#22d3ee' },
  { name: 'Sunset Orange', primary: '#f97316', secondary: '#ef4444', accent: '#fbbf24' },
  { name: 'Forest Green', primary: '#22c55e', secondary: '#10b981', accent: '#84cc16' },
  { name: 'Rose Pink', primary: '#ec4899', secondary: '#f43f5e', accent: '#fb7185' },
  { name: 'Golden', primary: '#eab308', secondary: '#f59e0b', accent: '#fcd34d' },
  { name: 'Midnight', primary: '#1e293b', secondary: '#334155', accent: '#64748b' },
  { name: 'Neon Cyan', primary: '#06b6d4', secondary: '#14b8a6', accent: '#2dd4bf' },
];

// Theme categories
const THEME_CATEGORIES = [
  { value: 'dark', label: 'Dark & Moody' },
  { value: 'bright', label: 'Bright & Vibrant' },
  { value: 'neon', label: 'Neon & Cyberpunk' },
  { value: 'nature', label: 'Nature & Organic' },
  { value: 'minimal', label: 'Minimal & Clean' },
  { value: 'retro', label: 'Retro & Vintage' },
  { value: 'abstract', label: 'Abstract & Artistic' },
  { value: 'seasonal', label: 'Seasonal & Holiday' },
  { value: 'other', label: 'Other' },
];

type QuantityType = 'unlimited' | 'limited';
type PricingMode = 'free' | 'paid';

export default function MarketplaceUpload() {
  const { theme } = useMusicTheme();
  const { externalWallet } = useWallet();
  const { user: _mochaUser } = useAuth();
  const navigate = useLocalizedNavigate();
  const { titleBarPadding } = useElectronTitleBar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [previewImage, setPreviewImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [priceKas, setPriceKas] = useState('');
  const [pricingMode, setPricingMode] = useState<PricingMode>('free');
  const [quantityType, setQuantityType] = useState<QuantityType>('unlimited');
  const [quantityLimit, setQuantityLimit] = useState('10');
  const [hasParticles, setHasParticles] = useState(false);
  const [particleColor, setParticleColor] = useState('#ffffff');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customColors, setCustomColors] = useState({
    primary: '#9333ea',
    secondary: '#6366f1',
    accent: '#a855f7'
  });
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Preview state - using pixel-based positioning like ImageCropper
  const [showPreview, setShowPreview] = useState(false);
  const [previewScale, setPreviewScale] = useState(1); // 0.5 to 2.5
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 }); // pixel offset
  const [previewParticles, setPreviewParticles] = useState(false);
  const [previewParticleColor, setPreviewParticleColor] = useState('#ffffff');
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const previewContentRef = useRef<HTMLDivElement>(null);

  // Handle scroll wheel on drag layer - pass through to content area
  const handlePreviewWheel = useCallback((e: React.WheelEvent) => {
    if (previewContentRef.current) {
      previewContentRef.current.scrollTop += e.deltaY;
    }
  }, []);

  // UI state
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const authToken = externalWallet?.authToken;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be under 5MB');
        return;
      }
      setPreviewImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError('');
    }
  };

  const handlePresetSelect = (index: number) => {
    setSelectedPreset(index);
    setCustomColors(COLOR_PRESETS[index]);
  };

  // Preview drag handlers - pixel-based like ImageCropper for smooth dragging
  const handlePreviewMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - previewPosition.x,
      y: e.clientY - previewPosition.y,
      posX: previewPosition.x,
      posY: previewPosition.y
    };
  }, [previewPosition]);

  const handlePreviewMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPreviewPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  }, [isDragging]);

  const handlePreviewMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse move/up for smooth dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePreviewMouseMove);
      window.addEventListener('mouseup', handlePreviewMouseUp);
      return () => {
        window.removeEventListener('mousemove', handlePreviewMouseMove);
        window.removeEventListener('mouseup', handlePreviewMouseUp);
      };
    }
  }, [isDragging, handlePreviewMouseMove, handlePreviewMouseUp]);

  // Touch support for mobile
  const handlePreviewTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = {
      x: touch.clientX - previewPosition.x,
      y: touch.clientY - previewPosition.y,
      posX: previewPosition.x,
      posY: previewPosition.y
    };
  }, [previewPosition]);

  const handlePreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setPreviewPosition({
      x: touch.clientX - dragStartRef.current.x,
      y: touch.clientY - dragStartRef.current.y,
    });
  }, [isDragging]);

  const handlePreviewTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);



  const validateForm = (): string | null => {
    if (!title.trim()) return 'Theme title is required';
    if (title.length > 50) return 'Title must be 50 characters or less';
    if (description.length > 500) return 'Description must be 500 characters or less';
    if (!previewImage) return 'Preview image is required';
    if (!category) return 'Please select a category';
    
    if (pricingMode === 'paid') {
      const price = parseFloat(priceKas);
      if (isNaN(price) || price < 0.11) {
        return 'Price must be at least 0.11 KAS for paid themes';
      }
    }
    
    if (quantityType === 'limited') {
      const qty = parseInt(quantityLimit);
      if (isNaN(qty) || qty < 1 || qty > 10000) {
        return 'Quantity must be between 1 and 10,000';
      }
    }
    
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError('');

    try {
      // First upload the preview image
      const formData = new FormData();
      formData.append('file', previewImage!);
      formData.append('type', 'theme-preview');

      const uploadRes = await fetch('/api/marketplace/upload/theme-image', {
        method: 'POST',
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : undefined,
        credentials: 'include',
        body: formData
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload preview image');
      }

      const uploadData = await uploadRes.json();
      const imageUrl = uploadData.url;

      // Submit the theme
      const themeData = {
        title: title.trim(),
        description: description.trim() || null,
        previewImageUrl: imageUrl,
        themeData: JSON.stringify({
          colors: customColors,
          particles: hasParticles ? { enabled: true, color: particleColor } : { enabled: false }
        }),
        priceKas: pricingMode === 'paid' && parseFloat(priceKas) >= 0.11 ? priceKas : '0',
        quantityTotal: quantityType === 'unlimited' ? null : parseInt(quantityLimit),
        hasParticles,
        particleColor: hasParticles ? particleColor : null,
        category: category,
        tags: tags.length > 0 ? tags : null
      };

      const res = await fetch('/api/marketplace/themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(themeData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit theme');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit theme');
    } finally {
      setUploading(false);
    }
  };

  if (success) {
    return (
      <div className={`min-h-screen ${titleBarPadding}`}>
        <AnimatedBackground themeId={theme.id} accent={theme.accent} />
        <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Theme Submitted!</h2>
            <p className="text-gray-400 mb-6">
              Your theme has been submitted for review. An admin will review it shortly. 
              Once approved, it will appear in the marketplace.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/music/marketplace')}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors"
              >
                Back to Marketplace
              </button>
              <button
                onClick={() => {
                  setSuccess(false);
                  setTitle('');
                  setDescription('');
                  setPreviewImage(null);
                  setPreviewUrl('');
                  setPriceKas('');
                  setPricingMode('free');
                  setQuantityType('unlimited');
                  setQuantityLimit('10');
                  setHasParticles(false);
                  setCategory('');
                  setTags([]);
                }}
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
              >
                Submit Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Preview page state
  const [previewPage, setPreviewPage] = useState<'front' | 'profile'>('front');

  // Sync particle color from preview to main form
  // Temporary color for picker - only save when confirmed
  const [tempParticleColor, setTempParticleColor] = useState('#ffffff');
  const [showColorConfirm, setShowColorConfirm] = useState(false);
  
  const handleParticleColorConfirm = useCallback(() => {
    setPreviewParticleColor(tempParticleColor);
    setParticleColor(tempParticleColor);
    setShowColorConfirm(false);
  }, [tempParticleColor]);

  // Preview zoom with ref to avoid losing focus
  const zoomRef = useRef<HTMLInputElement>(null);
  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPreviewScale(parseFloat(e.target.value));
  }, []);

  // Preview Modal - rendered as inline JSX to avoid remounting issues
  const previewModalContent = showPreview && previewUrl ? (
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* Solid black background to fully cover page behind */}
      <div className="absolute inset-0 bg-black" />
      
      {/* Theme Background Image - FULL NATURAL SIZE, extends beyond viewport */}
      <div className="absolute inset-0 overflow-visible z-[101]">
        <img
          src={previewUrl}
          alt="Theme preview"
          className="pointer-events-none select-none"
          draggable={false}
          style={{
            // FULL natural image size - NO constraints, can extend beyond viewport
            position: 'absolute',
            transform: `translate(calc(-50% + ${previewPosition.x}px), calc(-50% + ${previewPosition.y}px)) scale(${previewScale})`,
            transformOrigin: 'center center',
            left: '50%',
            top: '50%',
          }}
        />
      </div>
      
      {/* Overlay gradient - MUCH lighter to match actual front page */}
      <div className="absolute inset-0 z-[102] bg-gradient-to-b from-transparent via-black/10 to-black/40 pointer-events-none" />
        
      {/* Particles - full screen, above drag layer but below controls */}
      {previewParticles && (
        <div className="absolute inset-0 z-[112] pointer-events-none">
          <PreviewParticleCanvas color={previewParticleColor} />
        </div>
      )}
      
      {/* Invisible drag layer - captures all drag events, above content */}
      <div 
        className="absolute inset-0 z-[110]"
        onMouseDown={handlePreviewMouseDown}
        onTouchStart={handlePreviewTouchStart}
        onTouchMove={handlePreviewTouchMove}
        onTouchEnd={handlePreviewTouchEnd}
        onWheel={handlePreviewWheel}
        style={{ 
          cursor: isDragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto'
        }}
      />
      
      {/* Header Controls - above drag layer so buttons work */}
      <div className="relative z-[115] flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm border-b border-white/10 pointer-events-auto">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-purple-400" />
            <span className="text-white font-medium">Theme Preview</span>
          </div>
          
          {/* Page Tabs */}
          <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1">
            <button
              onClick={() => setPreviewPage('front')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                previewPage === 'front' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Front Page
            </button>
            <button
              onClick={() => setPreviewPage('profile')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                previewPage === 'profile' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Profile Page
            </button>
          </div>
          
          <button
            onClick={() => setShowPreview(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* Mock Content Area - pointer-events-none so drag works through it, but scrollable */}
        <div ref={previewContentRef} className="relative z-[105] flex-1 overflow-y-auto pointer-events-none">
          {previewPage === 'front' ? (
            // Front Page Mock - matching actual Music.tsx layout with tabs row + track table
            <div className="px-4 pt-4 pb-24 max-w-[1400px] mx-auto">
              {/* Category Tabs Row - matching actual layout */}
              <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
                {['Liked', 'Library', 'Discover', 'History', 'Top'].map((tab, i) => (
                  <div
                    key={tab}
                    className={`flex flex-col items-center justify-center px-8 py-4 rounded-xl backdrop-blur-sm border transition-colors min-w-[140px] ${
                      i === 2 
                        ? 'bg-white/15 border-white/20' 
                        : 'bg-black/30 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-white/20 mb-2" />
                    <span className="text-white text-sm font-medium">{tab}</span>
                  </div>
                ))}
              </div>
              
              {/* Recent Tracks Section - TABLE layout matching actual */}
              <div className="mb-8 bg-black/30 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-white/20" />
                    <h2 className="text-lg font-bold text-white">Recent Tracks</h2>
                  </div>
                  <span className="text-teal-400 text-sm cursor-pointer hover:underline">See all</span>
                </div>
                
                {/* Table Header */}
                <div className="grid grid-cols-[40px_1fr_200px_80px] gap-4 px-3 py-2 text-gray-400 text-sm border-b border-white/10 mb-2">
                  <span>#</span>
                  <span>Title</span>
                  <span>Album</span>
                  <span className="text-right">Duration</span>
                </div>
                
                {/* Track Rows */}
                {[1,2,3,4,5,6,7].map(i => (
                  <div key={i} className="grid grid-cols-[40px_1fr_200px_80px] gap-4 items-center px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors">
                    <span className="text-gray-500">{i}</span>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded bg-white/10 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium truncate">Track Title {i}</span>
                          <span className="px-1.5 py-0.5 text-xs rounded bg-blue-600/80 text-white flex-shrink-0">Free</span>
                        </div>
                        <span className="text-gray-400 text-sm truncate block">Artist Name</span>
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm truncate">—</span>
                    <span className="text-gray-400 text-sm text-right">3:42</span>
                  </div>
                ))}
              </div>
              
              {/* Featured Albums Section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">Featured Albums</h2>
                  <span className="text-teal-400 text-sm">See all</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                      <div className="aspect-square rounded-lg bg-white/10 mb-2" />
                      <div className="h-3 bg-white/20 rounded mb-1.5 w-4/5" />
                      <div className="h-2 bg-white/10 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Profile Page Mock - matching actual MusicArtist.tsx layout
            <div className="max-w-4xl mx-auto px-4 pt-16 pb-24">
              {/* Artist header */}
              <div className="flex items-end gap-6 mb-8">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 border-4 border-white/20 shadow-xl flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h1 className="text-4xl font-bold text-white mb-2 truncate">Artist Name</h1>
                  <p className="text-gray-300 text-lg">1.2K followers • 24 tracks</p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="px-6 py-2 bg-purple-600 rounded-full text-white font-medium">Follow</div>
                    <div className="px-4 py-2 bg-white/10 rounded-full text-white">Tip</div>
                  </div>
                </div>
              </div>
              
              {/* Popular tracks section */}
              <h2 className="text-xl font-bold text-white mb-4">Popular Tracks</h2>
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-4 p-3 bg-black/40 backdrop-blur-sm rounded-xl border border-white/10">
                    <span className="text-gray-500 w-6 text-center">{i}</span>
                    <div className="w-12 h-12 rounded-lg bg-white/10 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="h-4 bg-white/20 rounded mb-1 w-1/3" />
                      <div className="h-3 bg-white/10 rounded w-1/4" />
                    </div>
                    <div className="text-gray-400 text-sm">3:42</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Drag hint */}
        {!isDragging && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[115] px-4 py-2 bg-black/70 backdrop-blur-sm rounded-full flex items-center gap-2 pointer-events-none">
            <Move className="w-4 h-4 text-gray-300" />
            <span className="text-gray-300 text-sm">Drag background to reposition</span>
          </div>
        )}
        
        {/* Bottom Controls */}
        <div className="relative z-[115] px-4 py-4 bg-black/70 backdrop-blur-sm border-t border-white/10 pointer-events-auto">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
            {/* Zoom Controls - using onInput for smooth dragging */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewScale(Math.max(0.5, previewScale - 0.1))}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ZoomOut className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1 w-32">
                <input
                  ref={zoomRef}
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.01"
                  value={previewScale}
                  onInput={handleZoomChange}
                  onChange={handleZoomChange}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
              <button
                onClick={() => setPreviewScale(Math.min(2.5, previewScale + 0.1))}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ZoomIn className="w-5 h-5 text-white" />
              </button>
              <span className="text-white text-sm w-12">{Math.round(previewScale * 100)}%</span>
            </div>
            
            {/* Particle Toggle & Color */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPreviewParticles(!previewParticles);
                  setHasParticles(!previewParticles);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  previewParticles 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Particles
              </button>
              
              {/* Particle Color Picker with Confirm */}
              {previewParticles && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={showColorConfirm ? tempParticleColor : previewParticleColor}
                    onChange={(e) => {
                      setTempParticleColor(e.target.value);
                      setShowColorConfirm(true);
                    }}
                    className="w-8 h-8 rounded cursor-pointer border border-white/20"
                    title="Pick Particle Color"
                  />
                  {showColorConfirm && (
                    <button
                      onClick={handleParticleColorConfirm}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      OK
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* Reset Position */}
            <button
              onClick={() => {
                setPreviewPosition({ x: 0, y: 0 });
                setPreviewScale(1);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg font-medium transition-colors"
            >
              Reset
            </button>
            
            {/* Done */}
            <button
              onClick={() => setShowPreview(false)}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className={`min-h-screen ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />

      {/* Preview Modal */}
      {previewModalContent}

      <div className="relative z-10 pt-8 pb-32 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate('/music/marketplace')}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Marketplace
          </button>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Sell Your Theme</h1>
            <p className="text-gray-400">
              Create a custom theme and sell it on the marketplace. All themes require admin approval before listing.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Preview Image */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6">
              <label className="block text-white font-medium mb-3">
                Preview Image <span className="text-red-400">*</span>
              </label>
              <p className="text-gray-500 text-sm mb-2">
                Upload the theme artwork that will be applied to your profile.
              </p>
              <p className="text-yellow-400 text-sm mb-4">
                💡 Recommended: 16:9 aspect ratio
              </p>
              
              {previewUrl ? (
                <div className="space-y-3 mb-3">
                  <div className="relative rounded-lg overflow-hidden bg-black/40">
                    <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[400px] object-contain" />
                    <button
                      onClick={() => {
                        setPreviewImage(null);
                        setPreviewUrl('');
                      }}
                      className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setPreviewParticles(hasParticles);
                      setPreviewParticleColor(particleColor);
                      setShowPreview(true);
                    }}
                    className="w-full px-4 py-3 bg-purple-600/80 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-5 h-5" />
                    Preview Theme — Adjust Position & Zoom
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[200px] rounded-lg border-2 border-dashed border-white/20 hover:border-purple-500/50 flex flex-col items-center justify-center gap-3 transition-colors py-8"
                >
                  <Image className="w-10 h-10 text-gray-500" />
                  <span className="text-gray-400">Click to upload preview image</span>
                  <span className="text-gray-600 text-sm">PNG, JPG up to 5MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>

            {/* Title & Description */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">
                  Theme Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Neon Dreams"
                  maxLength={50}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                />
                <div className="text-right text-gray-500 text-xs mt-1">{title.length}/50</div>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your theme's look and feel..."
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 resize-none"
                />
                <div className="text-right text-gray-500 text-xs mt-1">{description.length}/500</div>
              </div>
            </div>

            {/* Category & Tags */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">
                  Category <span className="text-red-400">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
                >
                  <option value="" className="bg-gray-900">Select a category</option>
                  {THEME_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value} className="bg-gray-900">{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white font-medium mb-2">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1 bg-purple-500/30 text-purple-200 rounded-full text-sm flex items-center gap-1">
                      {tag}
                      <button
                        onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                        className="hover:text-white ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim() && tags.length < 5) {
                        e.preventDefault();
                        setTags([...tags, tagInput.trim().toLowerCase()]);
                        setTagInput('');
                      }
                    }}
                    placeholder="Add a tag and press Enter"
                    maxLength={20}
                    className="flex-1 px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={() => {
                      if (tagInput.trim() && tags.length < 5) {
                        setTags([...tags, tagInput.trim().toLowerCase()]);
                        setTagInput('');
                      }
                    }}
                    disabled={!tagInput.trim() || tags.length >= 5}
                    className="px-4 py-2 bg-purple-500/30 text-purple-200 rounded-xl hover:bg-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-2">{tags.length}/5 tags (optional)</p>
              </div>
            </div>

            {/* Colors */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6">
              <label className="block text-white font-medium mb-3">Color Tags</label>
              <p className="text-gray-500 text-sm mb-4">
                Select colors that describe your theme artwork. This helps buyers find your theme when searching by color.
              </p>
              
              {/* Presets */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {COLOR_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => handlePresetSelect(i)}
                    className={`p-2 rounded-lg border-2 transition-all ${
                      selectedPreset === i ? 'border-white' : 'border-transparent hover:border-white/30'
                    }`}
                  >
                    <div className="flex gap-1 mb-1">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.primary }} />
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.secondary }} />
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.accent }} />
                    </div>
                    <div className="text-xs text-gray-400 truncate">{preset.name}</div>
                  </button>
                ))}
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Primary</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={customColors.primary}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, primary: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="w-10 h-10 rounded-full cursor-pointer border-0"
                    />
                    <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: customColors.primary }} />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Secondary</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={customColors.secondary}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, secondary: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="w-10 h-10 rounded-full cursor-pointer border-0"
                    />
                    <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: customColors.secondary }} />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Accent</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={customColors.accent}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, accent: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="w-10 h-10 rounded-full cursor-pointer border-0"
                    />
                    <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: customColors.accent }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Particles */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <div>
                    <label className="block text-white font-medium">Particle Effects</label>
                    <p className="text-gray-500 text-sm">Add animated particles to your theme</p>
                  </div>
                </div>
                <button
                  onClick={() => setHasParticles(!hasParticles)}
                  className={`w-12 h-6 rounded-full transition-colors ${hasParticles ? 'bg-purple-600' : 'bg-white/20'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${hasParticles ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              
              {hasParticles && (
                <div className="flex items-center gap-3 pt-3 border-t border-white/10">
                  <label className="text-gray-400 text-sm">Particle Color:</label>
                  <input
                    type="color"
                    value={particleColor}
                    onChange={(e) => setParticleColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={particleColor}
                    onChange={(e) => setParticleColor(e.target.value)}
                    className="w-24 px-2 py-1 bg-black/40 border border-white/10 rounded text-white text-sm"
                  />
                </div>
              )}
            </div>

            {/* Pricing */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6">
              <label className="block text-white font-medium mb-3">Pricing</label>
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => {
                    setPricingMode('free');
                    setPriceKas('');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    pricingMode === 'free' ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  Free
                </button>
                <button
                  onClick={() => {
                    setPricingMode('paid');
                    if (!priceKas) setPriceKas('0.11');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    pricingMode === 'paid' ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  Paid
                </button>
              </div>
              
              {pricingMode === 'paid' && (
                <div>
                  <div className="flex items-center gap-3">
                    <KaspaIcon className="w-6 h-6 text-[#70C7BA]" />
                    <input
                      type="number"
                      value={priceKas}
                      onChange={(e) => setPriceKas(e.target.value)}
                      placeholder="0.11"
                      min="0.11"
                      step="0.01"
                      className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                    />
                    <span className="text-gray-400">KAS</span>
                  </div>
                  <p className="text-gray-500 text-sm mt-2">Minimum price: 0.11 KAS</p>
                </div>
              )}
              {pricingMode === 'paid' && priceKas && parseFloat(priceKas) > 0 && parseFloat(priceKas) < 0.11 && (
                <p className="text-red-400 text-sm mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  Minimum price is 0.11 KAS
                </p>
              )}
            </div>

            {/* Quantity */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6">
              <label className="block text-white font-medium mb-3">Quantity</label>
              <p className="text-gray-500 text-sm mb-4">
                Choose unlimited for maximum reach, or limited to create scarcity and exclusivity.
              </p>
              
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => setQuantityType('unlimited')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    quantityType === 'unlimited' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  Unlimited
                </button>
                <button
                  onClick={() => setQuantityType('limited')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    quantityType === 'limited' ? 'bg-yellow-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  Limited Edition
                </button>
              </div>
              
              {quantityType === 'limited' && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={quantityLimit}
                    onChange={(e) => setQuantityLimit(e.target.value)}
                    placeholder="10"
                    min="1"
                    max="10000"
                    className="w-32 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  />
                  <span className="text-gray-400">copies available</span>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 flex gap-3">
              <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div className="text-sm text-purple-200">
                <p className="font-medium mb-1">Review Process</p>
                <p className="text-purple-300/80">
                  All themes are reviewed by admins before being listed. 
                  You'll receive a notification once your theme is approved.
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-red-300">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Submit Theme for Review
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
