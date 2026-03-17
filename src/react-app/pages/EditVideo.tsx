import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LocalizedLink, { useLocalizedPath } from "../components/LocalizedLink";
import { useWallet } from "../contexts/WalletContext";
import { useLanguage } from "../contexts/LanguageContext";
import { usePayment } from "../hooks/usePayment";
import Navbar from "../components/Navbar";
import toast from "react-hot-toast";
import { ArrowLeft, Save, RefreshCw, Upload, Crown, Loader2, Image as ImageIcon, EyeOff, Trash2, AlertTriangle, Coins } from "lucide-react";

const EDIT_FEE_KAS = 0.0001;

interface VideoData {
  id: number;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  isMembersOnly: boolean;
  isPrivate: boolean;
  durationSeconds: number;
  priceKas: string;
  channel: {
    id: number;
    handle: string;
  };
}

export default function EditVideo() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const localizedPath = useLocalizedPath();
  const { t } = useLanguage();
  const { channel, refreshBalance, refreshPendingBalance, externalWallet } = useWallet();
  
  // Get auth headers for external wallet users
  const getAuthHeaders = () => {
    const headers: Record<string, string> = {};
    if (externalWallet?.authToken) {
      headers["Authorization"] = `Bearer ${externalWallet.authToken}`;
    }
    return headers;
  };
  const { pay } = usePayment();
  
  const [video, setVideo] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isMembersOnly, setIsMembersOnly] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [priceKas, setPriceKas] = useState("");
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchVideo();
    fetchPlatformWallet();
  }, [videoId]);

  const fetchPlatformWallet = async () => {
    try {
      const res = await fetch("/api/platform-wallet");
      if (res.ok) {
        const data = await res.json();
        setPlatformWallet(data.walletAddress);
      }
    } catch (error) {
      console.error("Failed to fetch platform wallet:", error);
    }
  };

  const fetchVideo = async () => {
    try {
      const res = await fetch(`/api/kasshi/videos/${videoId}`);
      if (!res.ok) {
        toast.error("Video not found");
        navigate(localizedPath("/"));
        return;
      }
      const data = await res.json();
      // API returns video directly, not wrapped in {video: ...}
      setVideo(data);
      setTitle(data.title || "");
      setDescription(data.description || "");
      setIsMembersOnly(data.isMembersOnly || false);
      setIsPrivate(data.isPrivate || false);
      setThumbnailUrl(data.thumbnailUrl || "");
      setThumbnailPreview(data.thumbnailUrl || "");
      // Load price - '0' or empty means free
      const videoPrice = data.priceKas || '0';
      setPriceKas(videoPrice === '0' ? '' : videoPrice);
    } catch (error) {
      toast.error("Failed to load video");
      navigate(localizedPath("/"));
    } finally {
      setLoading(false);
    }
  };

  // Check if user is the owner
  const isOwner = video && channel && video.channel.id === channel.id;

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    
    setThumbnailFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setThumbnailPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const [newDuration, setNewDuration] = useState<number | null>(null);
  
  const generateThumbnailFromVideo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!video?.videoUrl) return;
    
    const videoEl = document.createElement("video");
    videoEl.crossOrigin = "anonymous";
    videoEl.src = video.videoUrl;
    
    videoEl.onloadedmetadata = () => {
      // Capture duration if current is 0 or missing
      const duration = Math.floor(videoEl.duration);
      if (duration > 0 && (!video.durationSeconds || video.durationSeconds === 0)) {
        setNewDuration(duration);
      }
      const randomPosition = Math.random() * 0.45 + 0.05; // 5% - 50%
      videoEl.currentTime = videoEl.duration * randomPosition;
    };
    
    videoEl.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setThumbnailPreview(dataUrl);
        // Convert to file
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
            setThumbnailFile(file);
          }
        }, "image/jpeg", 0.8);
      }
    };
    
    videoEl.onerror = () => {
      toast.error("Failed to generate thumbnail from video");
    };
  };

  const uploadThumbnail = async (): Promise<string | null> => {
    if (!thumbnailFile || !video?.channel?.id) return null;
    
    const formData = new FormData();
    formData.append("file", thumbnailFile);
    formData.append("channelId", video.channel.id.toString());
    
    const res = await fetch("/api/kasshi/upload/thumbnail", {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) {
      throw new Error("Failed to upload thumbnail");
    }
    
    const data = await res.json();
    return data.url;
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    
    setSaving(true);
    
    try {
      // Pay edit fee if platform wallet is available (optional - don't block edit if unavailable)
      if (platformWallet) {
        const payResult = await pay(platformWallet, EDIT_FEE_KAS, {
          videoId: String(video?.id || 0),
          paymentType: "video_edit",
          silent: true,
        });
        if (!payResult.success) {
          console.warn("Edit fee payment failed:", payResult.error);
          // Continue with edit anyway - fee is optional
        }
      }
      
      // Upload new thumbnail if selected
      let newThumbnailUrl = thumbnailUrl;
      if (thumbnailFile) {
        const uploadedUrl = await uploadThumbnail();
        if (uploadedUrl) {
          newThumbnailUrl = uploadedUrl;
        }
      }
      
      // Calculate final price - empty or 0 = free, else must be >= 0.11
      const finalPriceKas = priceKas === '' || parseFloat(priceKas) === 0 
        ? '0' 
        : (parseFloat(priceKas) >= 0.11 ? priceKas : '0');
      
      // Save video metadata
      const updateData: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        thumbnailUrl: newThumbnailUrl,
        isMembersOnly,
        isPrivate,
        priceKas: finalPriceKas,
      };
      
      // Include duration if we captured it from regenerating thumbnail
      if (newDuration && newDuration > 0) {
        updateData.durationSeconds = newDuration;
      }
      
      const res = await fetch(`/api/kasshi/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(updateData),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save changes");
      }
      
      toast.success("Video updated successfully");
      refreshBalance();
      refreshPendingBalance();
      navigate(localizedPath(`/watch/${videoId}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/kasshi/videos/${videoId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete video");
      }
      
      toast.success("Video deleted successfully");
      navigate(localizedPath(`/channel/${channel?.handle}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete video");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] gap-4">
          <p className="text-slate-400">{t.video.videoNotFound}</p>
          <LocalizedLink to="/" className="text-teal-400 hover:underline">
            {t.video.goHome || 'Go home'}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] gap-4">
          <p className="text-slate-400">{t.video.canOnlyEditOwnVideos || 'You can only edit your own videos'}</p>
          <LocalizedLink to={`/watch/${videoId}`} className="text-teal-400 hover:underline">
            {t.video.backToVideo || 'Back to video'}
          </LocalizedLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <LocalizedLink 
            to={`/watch/${videoId}`}
            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </LocalizedLink>
          <h1 className="text-2xl font-bold text-white">{t.video.editVideo || 'Edit Video'}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column - Video preview & thumbnail */}
          <div className="space-y-6">
            {/* Video preview */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t.video.preview || 'Preview'}</label>
              <div className="aspect-video bg-black rounded-xl overflow-hidden">
                <video
                  ref={videoElementRef}
                  src={video.videoUrl}
                  className="w-full h-full object-contain"
                  controls
                />
              </div>
            </div>

            {/* Thumbnail */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t.video.thumbnail || 'Thumbnail'}</label>
              <div className="aspect-video bg-slate-800 rounded-xl overflow-hidden relative group">
                {thumbnailPreview ? (
                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-slate-600" />
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button
                    onClick={() => thumbnailInputRef.current?.click()}
                    className="p-3 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                    title={t.video.uploadThumbnail || 'Upload thumbnail'}
                  >
                    <Upload className="w-5 h-5 text-white" />
                  </button>
                  <button
                    onClick={generateThumbnailFromVideo}
                    className="p-3 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                    title={t.video.randomFrameFromVideo || 'Random frame from video'}
                  >
                    <RefreshCw className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                onChange={handleThumbnailSelect}
                className="hidden"
              />
              <p className="text-xs text-slate-500 mt-2">
                {t.video.hoverToChangeThumbnail || 'Hover to change thumbnail. Upload an image or generate from video.'}
              </p>
            </div>

            {/* AI Subtitles - Coming Soon */}
            {/* Feature will be enabled once OPENAI_API_KEY is configured */}
          </div>

          {/* Right column - Form fields */}
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                {t.upload.title} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                placeholder={t.video.enterVideoTitle || 'Enter video title'}
              />
              <p className="text-xs text-slate-500 mt-1 text-right">{title.length}/100</p>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t.upload.description}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={5000}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
                placeholder={t.video.tellViewersAboutVideo || 'Tell viewers about your video'}
              />
              <p className="text-xs text-slate-500 mt-1 text-right">{description.length}/5000</p>
            </div>

            {/* Video Price */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-3 mb-3">
                <Coins className="w-5 h-5 text-teal-400" />
                <div>
                  <h4 className="font-medium text-white">{t.upload?.videoPrice || 'Video Price'}</h4>
                  <p className="text-sm text-slate-400">{t.upload?.videoPriceDesc || 'Set a price for viewers to watch this video. Leave empty for free.'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceKas}
                    onChange={(e) => setPriceKas(e.target.value)}
                    onBlur={() => {
                      const price = parseFloat(priceKas);
                      if (priceKas !== '' && price > 0 && price < 0.11) {
                        setPriceKas('0.11');
                      }
                    }}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-teal-400 font-medium">KAS</span>
                </div>
                <span className={`text-sm font-medium px-3 py-1 rounded ${
                  priceKas === '' || priceKas === '0' 
                    ? 'bg-blue-600/20 text-blue-400' 
                    : 'bg-green-600/20 text-green-400'
                }`}>
                  {priceKas === '' || priceKas === '0' ? (t.video?.free || 'Free') : (t.video?.paid || 'Paid')}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">{t.upload?.minPriceNote || 'Minimum paid price: 0.11 KAS • You receive 95% of paid views'}</p>
            </div>

            {/* Members only toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-3">
                <Crown className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-white font-medium">{t.video.membersOnlyToggle || 'Members Only'}</p>
                  <p className="text-sm text-slate-400">
                    {t.video.onlyMembersCanWatch || 'Only channel members can watch this video'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMembersOnly(!isMembersOnly)}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  isMembersOnly ? "bg-teal-500" : "bg-slate-600"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                    isMembersOnly ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-3">
                <EyeOff className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-white font-medium">{t.video.privateVideo || 'Private Video'}</p>
                  <p className="text-sm text-slate-400">
                    {t.video.onlyYouCanSee || 'Only you can see this video'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPrivate(!isPrivate)}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  isPrivate ? "bg-teal-500" : "bg-slate-600"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                    isPrivate ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Edit fee notice */}
            <div className="p-4 bg-teal-500/10 rounded-lg border border-teal-500/20">
              <p className="text-sm text-teal-300">
                {t.video.savingChanges || 'Saving changes costs'} {EDIT_FEE_KAS} KAS {t.video.savingChangesCost || '(batched for efficiency)'}
              </p>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                saving || !title.trim()
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-teal-500 text-white hover:bg-teal-400"
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t.video.saving || 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {t.video.saveChanges || 'Save Changes'}
                </>
              )}
            </button>

            {/* Danger zone */}
            <div className="mt-8 pt-6 border-t border-slate-700">
              <h3 className="text-red-400 font-medium mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {t.video.dangerZone || 'Danger Zone'}
              </h3>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                {t.video.deleteVideo || 'Delete Video'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white">{t.video.deleteVideo || 'Delete Video'}</h2>
            </div>
            
            <p className="text-slate-300 mb-2">
              {t.video.deleteVideoConfirm || 'Are you sure you want to delete this video?'}
            </p>
            <p className="text-slate-400 text-sm mb-6">
              {t.video.deleteVideoWarning || 'This action cannot be undone. All views, comments, likes, and earnings data will be permanently deleted.'}
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-lg font-medium bg-slate-700 text-white hover:bg-slate-600 transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-lg font-medium bg-red-500 text-white hover:bg-red-400 transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t.video.deleting || 'Deleting...'}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    {t.common.delete}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
