import { useState, useRef } from 'react';
import { ArrowLeft, Upload, Image, Sparkles, Info, Loader2, Check, AlertCircle } from 'lucide-react';
import { useLocalizedNavigate } from '../components/LanguageRouter';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '@getmocha/users-service/react';
import AnimatedBackground from '../components/AnimatedBackground';
import { KaspaIcon } from '../components/KasShiLogo';
import { useElectronTitleBar } from '../components/ElectronTitleBar';

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

type QuantityType = 'unlimited' | 'limited';

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

  const validateForm = (): string | null => {
    if (!title.trim()) return 'Theme title is required';
    if (title.length > 50) return 'Title must be 50 characters or less';
    if (!description.trim()) return 'Description is required';
    if (description.length < 20) return 'Description must be at least 20 characters';
    if (description.length > 500) return 'Description must be 500 characters or less';
    if (!previewImage) return 'Preview image is required';
    
    const price = parseFloat(priceKas);
    if (priceKas && !isNaN(price) && price > 0 && price < 0.11) {
      return 'Price must be at least 0.11 KAS (or free)';
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

      const uploadRes = await fetch('/api/upload', {
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
        description: description.trim(),
        previewImageUrl: imageUrl,
        themeData: JSON.stringify({
          colors: customColors,
          particles: hasParticles ? { enabled: true, color: particleColor } : { enabled: false }
        }),
        priceKas: priceKas && parseFloat(priceKas) >= 0.11 ? priceKas : '0',
        quantityTotal: quantityType === 'unlimited' ? null : parseInt(quantityLimit),
        hasParticles,
        particleColor: hasParticles ? particleColor : null
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
                  setQuantityType('unlimited');
                  setQuantityLimit('10');
                  setHasParticles(false);
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

  return (
    <div className={`min-h-screen ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />

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
              <p className="text-gray-500 text-sm mb-4">
                Upload an image that shows what your theme looks like. Recommended: 16:9 aspect ratio, at least 1280x720.
              </p>
              
              {previewUrl ? (
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black/40 mb-3">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
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
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video rounded-lg border-2 border-dashed border-white/20 hover:border-purple-500/50 flex flex-col items-center justify-center gap-3 transition-colors"
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
                  Description <span className="text-red-400">*</span>
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

            {/* Colors */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-6">
              <label className="block text-white font-medium mb-3">Theme Colors</label>
              <p className="text-gray-500 text-sm mb-4">Select a preset or customize your own colors.</p>
              
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
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.primary }} />
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.secondary }} />
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.accent }} />
                    </div>
                    <div className="text-xs text-gray-400 truncate">{preset.name}</div>
                  </button>
                ))}
              </div>

              {/* Custom Colors */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Primary</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={customColors.primary}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, primary: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customColors.primary}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, primary: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="flex-1 px-2 py-1 bg-black/40 border border-white/10 rounded text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Secondary</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={customColors.secondary}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, secondary: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customColors.secondary}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, secondary: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="flex-1 px-2 py-1 bg-black/40 border border-white/10 rounded text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Accent</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={customColors.accent}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, accent: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customColors.accent}
                      onChange={(e) => {
                        setCustomColors({ ...customColors, accent: e.target.value });
                        setSelectedPreset(null);
                      }}
                      className="flex-1 px-2 py-1 bg-black/40 border border-white/10 rounded text-white text-sm"
                    />
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
                  onClick={() => setPriceKas('')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    !priceKas ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  Free
                </button>
                <button
                  onClick={() => setPriceKas('1')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    priceKas ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  Paid
                </button>
              </div>
              
              {priceKas && (
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
              )}
              {priceKas && parseFloat(priceKas) > 0 && parseFloat(priceKas) < 0.11 && (
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
                  All themes are reviewed by admins before being listed. This typically takes 24-48 hours. 
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
