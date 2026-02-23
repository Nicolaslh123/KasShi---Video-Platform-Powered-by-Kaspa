import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { Upload as UploadIcon, Film, X, Image, Info, Wallet, Loader2, CheckCircle, AlertCircle, User, AtSign, Sparkles, RotateCcw } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { usePayment } from "../hooks/usePayment";

// localStorage key for persisting upload state
const UPLOAD_STATE_KEY = "kasshi_upload_draft";

interface SavedUploadState {
  title: string;
  description: string;
  isMembersOnly: boolean;
  isPrivate: boolean;
  thumbnailPreview: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
  savedAt: number;
}

// Tiered upload fee based on file size
const getUploadFee = (fileSizeBytes: number): number => {
  const sizeInGB = fileSizeBytes / (1024 * 1024 * 1024);
  if (sizeInGB > 5) return 15; // Above 5GB: 15 KAS
  if (sizeInGB >= 1) return 10; // 1GB - 5GB: 10 KAS
  return 5; // Below 1GB: 5 KAS
};
import { WalletModal } from "../components/WalletModal";
import toast from "react-hot-toast";
import { KaspaIcon } from "../components/KasShiLogo";

type UploadStep = "select" | "details" | "uploading" | "complete";

export default function Upload() {
  const navigate = useNavigate();
  const { isConnected, channel, hasChannel, createChannel, createExternalChannel, externalWallet, isLoading: walletLoading, balance, micropay } = useWallet();
  const { pay, isExternalWallet } = usePayment();
  const [step, setStep] = useState<UploadStep>("select");
  
  // Unified payment function for both internal and external wallets
  const unifiedPay = useCallback(async (
    toAddress: string,
    amount: number,
    videoIdParam?: string,
    paymentType?: string,
    recipientChannelId?: number,
    commentId?: number
  ) => {
    if (isExternalWallet) {
      return pay(toAddress, amount, {
        videoId: videoIdParam,
        paymentType,
        recipientChannelId,
        commentId,
      });
    } else {
      return micropay(toAddress, amount, videoIdParam, paymentType, recipientChannelId, commentId);
    }
  }, [isExternalWallet, pay, micropay]);
  
  // Platform wallet for upload fees (fetched dynamically)
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  
  useEffect(() => {
    fetch("/api/platform-wallet")
      .then(res => res.json())
      .then(data => setPlatformWallet(data.walletAddress))
      .catch(err => console.error("Failed to fetch platform wallet:", err));
  }, []);
  
  // Channel creation state
  const [channelName, setChannelName] = useState("");
  const [channelHandle, setChannelHandle] = useState("");
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isMembersOnly, setIsMembersOnly] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [_isPayingUploadFee, setIsPayingUploadFee] = useState(false);
  const [savedDraft, setSavedDraft] = useState<SavedUploadState | null>(null);
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(UPLOAD_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SavedUploadState;
        // Only show recovery if saved within last 24 hours
        const hoursSinceSave = (Date.now() - parsed.savedAt) / (1000 * 60 * 60);
        if (hoursSinceSave < 24) {
          setSavedDraft(parsed);
          setShowDraftRecovery(true);
        } else {
          localStorage.removeItem(UPLOAD_STATE_KEY);
        }
      }
    } catch (e) {
      console.error("Failed to load saved draft:", e);
    }
  }, []);
  
  // Save draft to localStorage when form changes (debounced)
  const saveDraft = useCallback(() => {
    if (selectedFile && title.trim()) {
      const draft: SavedUploadState = {
        title,
        description,
        isMembersOnly,
        isPrivate,
        thumbnailPreview,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        savedAt: Date.now(),
      };
      localStorage.setItem(UPLOAD_STATE_KEY, JSON.stringify(draft));
    }
  }, [selectedFile, title, description, isMembersOnly, thumbnailPreview]);
  
  useEffect(() => {
    if (step === "details" && selectedFile) {
      const timeout = setTimeout(saveDraft, 500);
      return () => clearTimeout(timeout);
    }
  }, [step, selectedFile, saveDraft]);
  
  // Clear draft when upload completes
  useEffect(() => {
    if (step === "complete") {
      localStorage.removeItem(UPLOAD_STATE_KEY);
    }
  }, [step]);
  
  // Warn before leaving during upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === "uploading") {
        e.preventDefault();
        e.returnValue = "Your upload is in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step]);
  
  // Restore draft
  const handleRestoreDraft = () => {
    if (savedDraft) {
      setTitle(savedDraft.title);
      setDescription(savedDraft.description);
      setIsMembersOnly(savedDraft.isMembersOnly);
      setIsPrivate(savedDraft.isPrivate || false);
      setThumbnailPreview(savedDraft.thumbnailPreview);
      setShowDraftRecovery(false);
      // Prompt user to re-select file
      toast("Please re-select your video file to continue", { icon: "📁", duration: 4000 });
      fileInputRef.current?.click();
    }
  };
  
  const handleDismissDraft = () => {
    setShowDraftRecovery(false);
    setSavedDraft(null);
    localStorage.removeItem(UPLOAD_STATE_KEY);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateVideoFile(file)) {
        setSelectedFile(file);
        setStep("details");
      }
    }
  };

  const validateVideoFile = (file: File): boolean => {
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please use MP4, WebM, or MOV");
      return false;
    }
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 10GB");
      return false;
    }
    return true;
  };
  
  // Chunked upload for large files (> 95MB)
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (smaller for better reliability)
  const SINGLE_UPLOAD_LIMIT = 95 * 1024 * 1024; // 95MB
  const MAX_RETRIES = 5; // Retry failed chunks
  const CHUNK_DELAY_MS = 100; // Small delay between chunks to prevent connection overload
  
  const uploadVideoChunked = async (
    file: File, 
    channelId: string,
    onProgress: (percent: number) => void
  ): Promise<{ url: string; key: string }> => {
    // Throttle progress updates to prevent excessive re-renders
    let lastProgressUpdate = 0;
    const throttledProgress = (percent: number) => {
      const now = Date.now();
      if (now - lastProgressUpdate > 200 || percent >= 100) { // Update max every 200ms
        lastProgressUpdate = now;
        onProgress(percent);
      }
    };
    
    // Step 1: Initialize multipart upload
    const initResponse = await fetch("/api/kasshi/upload/video/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      }),
    });
    
    if (!initResponse.ok) {
      const err = await initResponse.json();
      throw new Error(err.error || "Failed to initialize upload");
    }
    
    const { uploadId, key } = await initResponse.json();
    
    // Step 2: Upload chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadedParts: { partNumber: number; etag: string }[] = [];
    
    // Helper to upload a single chunk with retries
    const uploadChunkWithRetry = async (
      chunk: Blob,
      partNumber: number,
      chunkIndex: number,
      totalChunks: number
    ): Promise<{ etag: string }> => {
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const formData = new FormData();
          formData.append("chunk", chunk);
          formData.append("key", key);
          formData.append("uploadId", uploadId);
          formData.append("partNumber", partNumber.toString());
          
          const result = await new Promise<{ etag: string }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const chunkProgress = e.loaded / e.total;
                const overallProgress = ((chunkIndex + chunkProgress) / totalChunks) * 100;
                throttledProgress(overallProgress);
              }
            });
            
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const res = JSON.parse(xhr.responseText);
                  resolve(res);
                } catch {
                  reject(new Error("Invalid server response"));
                }
              } else {
                try {
                  const err = JSON.parse(xhr.responseText);
                  reject(new Error(err.error || `Failed to upload part ${partNumber}`));
                } catch {
                  reject(new Error(`Chunk upload failed with status ${xhr.status}`));
                }
              }
            });
            
            xhr.addEventListener("error", () => reject(new Error("Network error during chunk upload")));
            xhr.addEventListener("timeout", () => reject(new Error("Chunk upload timed out")));
            xhr.addEventListener("abort", () => reject(new Error("Chunk upload was aborted")));
            
            xhr.open("POST", "/api/kasshi/upload/video/part");
            xhr.timeout = 2 * 60 * 1000; // 2 minute timeout per chunk (reduced for smaller chunks)
            xhr.send(formData);
          });
          
          return result;
        } catch (err) {
          lastError = err as Error;
          console.warn(`Chunk ${partNumber} upload attempt ${attempt + 1} failed:`, err);
          
          // Wait before retry (longer exponential backoff for SSL recovery)
          if (attempt < MAX_RETRIES - 1) {
            const delay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s...
            console.log(`Retrying chunk ${partNumber} in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      
      throw lastError || new Error(`Failed to upload chunk ${partNumber} after ${MAX_RETRIES} attempts`);
    };
    
    try {
      let successfulChunks = 0;
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const partNumber = i + 1;
        
        // Add small delay between chunks to prevent connection overload
        if (i > 0) {
          await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
        }
        
        const { etag } = await uploadChunkWithRetry(chunk, partNumber, i, totalChunks);
        
        uploadedParts.push({ partNumber, etag });
        successfulChunks++;
        
        // Log progress every 10 chunks or on last chunk
        if (successfulChunks % 10 === 0 || i === totalChunks - 1) {
          console.log(`Upload progress: ${successfulChunks}/${totalChunks} chunks uploaded`);
        }
      }
      
      // Verify all chunks were uploaded before completing
      if (uploadedParts.length !== totalChunks) {
        throw new Error(`Upload incomplete: only ${uploadedParts.length} of ${totalChunks} chunks uploaded`);
      }
      
      console.log(`All ${totalChunks} chunks uploaded successfully, completing multipart upload...`);
      
      // Step 3: Complete multipart upload with size verification
      const completeResponse = await fetch("/api/kasshi/upload/video/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          key, 
          uploadId, 
          parts: uploadedParts,
          expectedSize: file.size 
        }),
      });
      
      if (!completeResponse.ok) {
        const err = await completeResponse.json();
        throw new Error(err.error || "Failed to complete upload");
      }
      
      const result = await completeResponse.json();
      return { url: result.url, key: result.key };
    } catch (error) {
      // Abort upload on error to clean up
      try {
        await fetch("/api/kasshi/upload/video/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, uploadId }),
        });
      } catch {
        // Ignore abort errors
      }
      throw error;
    }
  };

  // Auto-generate thumbnail from video frame
  // For large videos, this may take longer as the browser needs to load enough data to seek
  const generateThumbnailFromVideo = useCallback(async (videoFile: File): Promise<{ file: File; preview: string; duration: number } | null> => {
    // Calculate timeout based on file size - larger files need more time to load
    const fileSizeMB = videoFile.size / (1024 * 1024);
    const baseTimeout = 15000; // 15s for small files
    const additionalTimeout = Math.min(fileSizeMB * 50, 60000); // +50ms per MB, max +60s
    const totalTimeout = baseTimeout + additionalTimeout;
    
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      let videoDurationSeconds = 0;
      let hasResolved = false;
      let durationReady = false;
      let frameReady = false;
      let seekAttempts = 0;
      const maxSeekAttempts = 3;
      
      video.preload = "auto"; // Load more than just metadata for better duration detection
      video.muted = true;
      video.playsInline = true;
      
      const cleanup = () => {
        try {
          URL.revokeObjectURL(video.src);
          video.remove();
        } catch {
          // Ignore cleanup errors
        }
      };
      
      const captureDuration = () => {
        const duration = video.duration;
        // Validate duration - must be a finite positive number
        if (duration && Number.isFinite(duration) && duration > 0) {
          videoDurationSeconds = Math.floor(duration);
          durationReady = true;
        }
      };
      
      // Try to finish when both duration and frame are ready
      const tryFinish = () => {
        if (hasResolved) return;
        if (!frameReady) return;
        
        // If duration not ready, wait a bit more
        if (!durationReady) {
          captureDuration(); // One more attempt
        }
        
        doCapture();
      };
      
      const doCapture = () => {
        if (hasResolved) return;
        
        // Final duration check
        captureDuration();
        
        // Set canvas dimensions (max 1280x720 for thumbnail)
        const maxWidth = 1280;
        const maxHeight = 720;
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width <= 0 || height <= 0) {
          // If dimensions invalid, try seeking again
          if (seekAttempts < maxSeekAttempts) {
            seekAttempts++;
            const seekTime = seekAttempts * 2; // Try 2s, 4s, 6s
            video.currentTime = seekTime;
            return;
          }
          cleanup();
          resolve(null);
          hasResolved = true;
          return;
        }
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          
          // Check if the frame is not all black (common issue with large videos)
          const imageData = ctx.getImageData(0, 0, Math.min(100, width), Math.min(100, height));
          const pixels = imageData.data;
          let totalBrightness = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            totalBrightness += pixels[i] + pixels[i + 1] + pixels[i + 2];
          }
          const avgBrightness = totalBrightness / (pixels.length / 4) / 3;
          
          // If frame is too dark, try seeking to a later point
          if (avgBrightness < 10 && seekAttempts < maxSeekAttempts) {
            seekAttempts++;
            const seekTime = Math.min(videoDurationSeconds * 0.1 * (seekAttempts + 1), videoDurationSeconds * 0.5);
            video.currentTime = seekTime > 0 ? seekTime : seekAttempts * 5;
            frameReady = false;
            return;
          }
          
          canvas.toBlob((blob) => {
            if (blob && !hasResolved) {
              const fileName = videoFile.name.replace(/\.[^/.]+$/, "") + "_thumb.jpg";
              const file = new File([blob], fileName, { type: "image/jpeg" });
              const preview = canvas.toDataURL("image/jpeg", 0.9);
              cleanup();
              hasResolved = true;
              resolve({ file, preview, duration: videoDurationSeconds });
            } else if (!hasResolved) {
              cleanup();
              hasResolved = true;
              resolve(null);
            }
          }, "image/jpeg", 0.9);
        } else {
          cleanup();
          hasResolved = true;
          resolve(null);
        }
      };
      
      video.onloadedmetadata = () => {
        captureDuration();
        // Seek to 10% of the video or 2 seconds for large videos
        const seekTime = videoDurationSeconds > 0 
          ? Math.min(videoDurationSeconds * 0.1, fileSizeMB > 500 ? 5 : 2)
          : 1; // Default to 1s if duration unknown
        video.currentTime = seekTime;
      };
      
      // Also try to capture duration on loadeddata (more reliable for some formats)
      video.onloadeddata = () => {
        captureDuration();
      };
      
      // Capture on durationchange event (fires when duration becomes known)
      video.ondurationchange = () => {
        captureDuration();
        if (frameReady) tryFinish();
      };
      
      video.onseeked = () => {
        frameReady = true;
        // Wait a bit for frame to render, then try to finish
        setTimeout(() => tryFinish(), 200);
      };
      
      video.onerror = () => {
        if (!hasResolved) {
          cleanup();
          hasResolved = true;
          resolve(null);
        }
      };
      
      // Progress event helps track loading for large files
      video.onprogress = () => {
        captureDuration();
      };
      
      // Set timeout based on file size
      setTimeout(() => {
        if (!hasResolved) {
          // Try to capture whatever we have
          if (video.videoWidth > 0) {
            frameReady = true;
            doCapture();
          } else {
            cleanup();
            hasResolved = true;
            resolve(null);
          }
        }
      }, totalTimeout);
      
      video.src = URL.createObjectURL(videoFile);
      video.load(); // Explicitly start loading
    });
  }, []);
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateVideoFile(file)) {
        setSelectedFile(file);
        setStep("details");
        
        // Auto-generate thumbnail and extract duration
        if (!thumbnail) {
          const fileSizeMB = file.size / (1024 * 1024);
          const loadingMsg = fileSizeMB > 500 
            ? "Generating thumbnail (large file, this may take a minute)..." 
            : fileSizeMB > 100 
              ? "Generating thumbnail (loading video)..." 
              : "Generating thumbnail...";
          toast.loading(loadingMsg, { id: "thumb-gen" });
          const result = await generateThumbnailFromVideo(file);
          if (result) {
            setThumbnail(result.file);
            setThumbnailPreview(result.preview);
            setVideoDuration(result.duration);
            toast.success("Thumbnail generated!", { id: "thumb-gen" });
          } else {
            toast.error("Couldn't auto-generate thumbnail. Please upload one manually.", { id: "thumb-gen", duration: 5000 });
          }
        } else {
          // If user provides custom thumbnail, still extract duration from video
          toast.loading("Extracting video info...", { id: "duration-extract" });
          const durationResult = await generateThumbnailFromVideo(file);
          toast.dismiss("duration-extract");
          if (durationResult) {
            setVideoDuration(durationResult.duration);
          }
        }
      }
    }
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid thumbnail format. Use JPEG, PNG, WebP, or GIF");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Thumbnail too large. Maximum size is 10MB");
        return;
      }
      setThumbnail(file);
      const reader = new FileReader();
      reader.onload = (e) => setThumbnailPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) return;
    
    // Calculate upload fee based on file size
    const uploadFee = getUploadFee(selectedFile.size);
    
    // Check balance for upload fee
    if (balance !== null && Number(balance) < uploadFee) {
      toast.error("Insufficient balance");
      setIsWalletModalOpen(true);
      return;
    }
    
    setStep("uploading");
    setError(null);
    setUploadProgress(0);
    
    try {
      // Verify platform wallet is configured
      if (!platformWallet) {
        throw new Error("Platform wallet not configured. Please contact the administrator.");
      }
      
      // Step 1: Upload video file FIRST (before charging fee)
      setUploadStatus("Uploading video...");
      setUploadProgress(5);
      
      let videoResult: { url: string; key: string };
      
      if (selectedFile.size > SINGLE_UPLOAD_LIMIT) {
        // Use chunked upload for large files
        videoResult = await uploadVideoChunked(
          selectedFile,
          channel!.id.toString(),
          (percent) => {
            // Map 0-100% of upload to 5-35% of total progress
            const mappedProgress = 5 + (percent * 0.30);
            setUploadProgress(Math.round(mappedProgress));
          }
        );
      } else {
        // Use single upload for small files (XMLHttpRequest for progress)
        videoResult = await new Promise<{ url: string; key: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const videoFormData = new FormData();
          videoFormData.append("file", selectedFile);
          videoFormData.append("channelId", channel!.id.toString());
          
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              // Map 0-100% of upload to 5-35% of total progress
              const uploadPercent = (e.loaded / e.total) * 100;
              const mappedProgress = 5 + (uploadPercent * 0.30);
              setUploadProgress(Math.round(mappedProgress));
            }
          });
          
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result = JSON.parse(xhr.responseText);
                resolve(result);
              } catch {
                reject(new Error("Invalid server response"));
              }
            } else {
              try {
                const err = JSON.parse(xhr.responseText);
                reject(new Error(err.error || "Failed to upload video"));
              } catch {
                reject(new Error(`Upload failed with status ${xhr.status}`));
              }
            }
          });
          
          xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
          xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
          xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
          
          xhr.open("POST", "/api/kasshi/upload/video");
          xhr.timeout = 10 * 60 * 1000; // 10 minute timeout
          xhr.send(videoFormData);
        });
      }
      
      setUploadProgress(40);
      
      // Step 2: Upload thumbnail if provided
      let thumbnailUrl = null;
      if (thumbnail) {
        setUploadStatus("Uploading thumbnail...");
        const thumbFormData = new FormData();
        thumbFormData.append("file", thumbnail);
        thumbFormData.append("channelId", channel!.id.toString());
        
        const thumbResponse = await fetch("/api/kasshi/upload/thumbnail", {
          method: "POST",
          body: thumbFormData,
        });
        
        if (thumbResponse.ok) {
          const thumbResult = await thumbResponse.json();
          thumbnailUrl = thumbResult.url;
        }
      }
      setUploadProgress(60);
      
      // Step 3: Create video record (still unpublished until fee paid)
      setUploadStatus("Creating video record...");
      const createResponse = await fetch("/api/kasshi/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel!.id,
          title: title.trim(),
          description: description.trim() || null,
          videoUrl: videoResult.url,
          thumbnailUrl: thumbnailUrl,
          durationSeconds: videoDuration,
          isMembersOnly: isMembersOnly,
          isPrivate: isPrivate,
        }),
      });
      
      if (!createResponse.ok) {
        throw new Error("Failed to create video record");
      }
      
      const video = await createResponse.json();
      setUploadProgress(80);
      
      // Step 4: Pay upload fee AFTER successful upload
      // This ensures user doesn't lose KAS if upload fails
      setUploadStatus("Processing upload fee...");
      setIsPayingUploadFee(true);
      
      const feeResult = await unifiedPay(platformWallet, uploadFee, undefined, "upload_fee", undefined, undefined);
      
      if (!feeResult.success) {
        setIsPayingUploadFee(false);
        if (feeResult.needsConsolidation) {
          // Video is uploaded but fee failed - notify user
          toast.error("Video uploaded but fee payment failed. Please consolidate your wallet in Settings and try again.", { duration: 6000 });
          // Still navigate to the video since it's already uploaded
          setTimeout(() => navigate(`/watch/${video.publicId || video.id}`), 2000);
          setUploadProgress(100);
          setStep("complete");
          return;
        }
        // Video is uploaded but fee failed - still show success since video is live
        toast("Video uploaded! Fee payment failed but your video is live.", { icon: "⚠️", duration: 5000 });
        setTimeout(() => navigate(`/watch/${video.publicId || video.id}`), 2000);
        setUploadProgress(100);
        setStep("complete");
        return;
      }
      
      setIsPayingUploadFee(false);
      setUploadProgress(100);
      setStep("complete");
      
      toast.success("Video uploaded successfully!");
      
      // Navigate to video after delay
      setTimeout(() => {
        navigate(`/watch/${video.publicId || video.id}`);
      }, 2000);
      
    } catch (err) {
      // Upload failed BEFORE fee was charged - user loses nothing
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setError(errorMessage);
      setStep("details");
      setIsPayingUploadFee(false);
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes("Network error") || errorMessage.includes("SSL")) {
        toast.error("Network connection lost. Please check your connection and try again.", { duration: 5000 });
      } else if (errorMessage.includes("incomplete") || errorMessage.includes("size mismatch")) {
        toast.error("Upload was interrupted. Please try again with a stable connection.", { duration: 5000 });
      } else if (errorMessage.includes("timed out")) {
        toast.error("Upload timed out. Try with a smaller file or better connection.", { duration: 5000 });
      } else {
        toast.error(errorMessage || "Upload failed. Please try again.");
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim() || !channelHandle.trim()) {
      setChannelError("Please enter a channel name and handle");
      return;
    }

    // Validate handle format
    const handleRegex = /^[a-zA-Z0-9_]+$/;
    if (!handleRegex.test(channelHandle)) {
      setChannelError("Handle can only contain letters, numbers, and underscores");
      return;
    }

    if (channelHandle.length < 3) {
      setChannelError("Handle must be at least 3 characters");
      return;
    }

    setIsCreatingChannel(true);
    setChannelError(null);

    // Use appropriate channel creation based on wallet type
    const result = externalWallet 
      ? await createExternalChannel(channelName.trim(), channelHandle.trim())
      : await createChannel(channelName.trim(), channelHandle.trim());

    if (result.success) {
      toast.success("Channel created successfully!");
    } else {
      setChannelError(result.error || "Failed to create channel");
    }

    setIsCreatingChannel(false);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col">
      <Navbar />
      
      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Upload Video</h1>
        <p className="text-slate-400 mb-8">Share your content and earn KAS from every view</p>

        {/* Draft recovery banner */}
        {showDraftRecovery && savedDraft && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-white">Resume previous upload?</h3>
                <p className="text-slate-400 text-sm mt-1">
                  You have an unsaved draft: "<span className="text-white">{savedDraft.title}</span>" ({formatFileSize(savedDraft.fileSize)})
                </p>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={handleRestoreDraft}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Restore Draft
                  </button>
                  <button
                    onClick={handleDismissDraft}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input for draft restoration */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={async (e) => {
            if (e.target.files && e.target.files[0]) {
              const file = e.target.files[0];
              // Verify file matches saved draft
              if (savedDraft && (file.name !== savedDraft.fileName || file.size !== savedDraft.fileSize)) {
                toast.error("Please select the same file as your draft", { duration: 3000 });
                return;
              }
              if (validateVideoFile(file)) {
                setSelectedFile(file);
                setStep("details");
                
                // Auto-generate thumbnail if none restored from draft
                if (!thumbnailPreview && !thumbnail) {
                  toast.loading("Generating thumbnail...", { id: "thumb-gen" });
                  const result = await generateThumbnailFromVideo(file);
                  if (result) {
                    setThumbnail(result.file);
                    setThumbnailPreview(result.preview);
                    toast.success("Thumbnail generated!", { id: "thumb-gen" });
                  } else {
                    toast.dismiss("thumb-gen");
                  }
                }
              }
            }
          }}
          className="hidden"
        />

        {/* Loading state */}
        {walletLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
          </div>
        )}

        {/* Wallet connection notice - shown when not connected */}
        {!walletLoading && !isConnected && (
          <div className="mb-8 p-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-400 text-lg">Connect Wallet to Upload</h3>
                <p className="text-slate-400 text-sm mt-1">
                  You'll need to connect your Kaspa wallet to upload videos and start earning. Your wallet address will be linked to your channel for receiving payments.
                </p>
                <button 
                  onClick={() => setIsWalletModalOpen(true)}
                  className="mt-4 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white rounded-full font-medium text-sm transition-all shadow-lg shadow-teal-500/25"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Channel creation - shown when connected but no channel */}
        {!walletLoading && isConnected && !hasChannel && (
          <div className="mb-8 p-6 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/30 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-violet-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-violet-400 text-lg">Create Your Channel</h3>
                <p className="text-slate-400 text-sm mt-1 mb-4">
                  Set up your creator channel to start uploading videos. Your channel will be linked to your Kaspa wallet for receiving earnings.
                </p>
                
                {channelError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{channelError}</p>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      Channel Name
                    </label>
                    <input
                      type="text"
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      placeholder="My Awesome Channel"
                      maxLength={50}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                      <AtSign className="w-4 h-4 text-slate-400" />
                      Channel Handle
                    </label>
                    <input
                      type="text"
                      value={channelHandle}
                      onChange={(e) => setChannelHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      placeholder="myawesomechannel"
                      maxLength={30}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                    <p className="text-slate-500 text-xs mt-1">
                      This will be your unique @handle. Letters, numbers, and underscores only.
                    </p>
                  </div>
                  
                  <button 
                    onClick={handleCreateChannel}
                    disabled={isCreatingChannel || !channelName.trim() || !channelHandle.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-full font-semibold transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:shadow-none flex items-center gap-2"
                  >
                    {isCreatingChannel ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating Channel...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Create Channel
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show current channel info when connected and has channel */}
        {!walletLoading && isConnected && hasChannel && channel && (
          <div className="mb-6 p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-bold">
              {channel.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{channel.name}</p>
              <p className="text-slate-400 text-sm">@{channel.handle}</p>
            </div>
            <Link 
              to={`/channel/${channel.handle}`}
              className="text-teal-400 hover:text-teal-300 text-sm font-medium transition-colors"
            >
              View Channel
            </Link>
          </div>
        )}

        {/* Step 1: File Selection - only show when user has a channel */}
        {!walletLoading && hasChannel && step === "select" && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
              dragActive
                ? "border-teal-500 bg-teal-500/10"
                : "border-slate-700 hover:border-slate-600 bg-slate-900/50"
            }`}
          >
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center border bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border-teal-500/30">
              <UploadIcon className="w-10 h-10 text-teal-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-white mb-2">
              Drag and drop video files to upload
            </h2>
            <p className="text-slate-400 mb-6">
              Your videos will be public. Supported formats: MP4, WebM, MOV (max 10GB)
            </p>
            
            <button className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-medium transition-colors">
              Select Files
            </button>
          </div>
        )}

        {/* Step 2: Video Details Form */}
        {step === "details" && selectedFile && (
          <div className="space-y-6">
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400">{error}</p>
              </div>
            )}
            
            {/* Selected file preview */}
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Film className="w-8 h-8 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{selectedFile.name}</p>
                <p className="text-sm text-slate-400">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button 
                onClick={() => {
                  setSelectedFile(null);
                  setVideoDuration(0);
                  setStep("select");
                }}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Thumbnail */}
              <div 
                onClick={() => thumbnailInputRef.current?.click()}
                className="aspect-video bg-slate-900 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-slate-600 transition-colors overflow-hidden"
              >
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleThumbnailSelect}
                  className="hidden"
                />
                {thumbnailPreview ? (
                  <div className="relative w-full h-full group">
                    <img 
                      src={thumbnailPreview} 
                      alt="Thumbnail preview" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-opacity">
                      <p className="text-white text-sm font-medium">Click to upload custom</p>
                      {selectedFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Regenerate from a random frame
                            toast.loading("Regenerating thumbnail...", { id: "thumb-regen" });
                            const video = document.createElement("video");
                            video.preload = "metadata";
                            video.muted = true;
                            video.onloadedmetadata = () => {
                              // Pick a random time between 5% and 50% of the video
                              const seekTime = video.duration * (0.05 + Math.random() * 0.45);
                              video.currentTime = seekTime;
                            };
                            video.onseeked = () => {
                              const canvas = document.createElement("canvas");
                              const ctx = canvas.getContext("2d");
                              const maxWidth = 1280, maxHeight = 720;
                              let width = video.videoWidth, height = video.videoHeight;
                              if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
                              if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
                              canvas.width = width;
                              canvas.height = height;
                              if (ctx) {
                                ctx.drawImage(video, 0, 0, width, height);
                                canvas.toBlob((blob) => {
                                  if (blob) {
                                    const fileName = selectedFile.name.replace(/\.[^/.]+$/, "") + "_thumb.jpg";
                                    const file = new File([blob], fileName, { type: "image/jpeg" });
                                    setThumbnail(file);
                                    setThumbnailPreview(canvas.toDataURL("image/jpeg", 0.9));
                                    toast.success("New thumbnail generated!", { id: "thumb-regen" });
                                  } else {
                                    toast.error("Failed to generate thumbnail", { id: "thumb-regen" });
                                  }
                                  URL.revokeObjectURL(video.src);
                                }, "image/jpeg", 0.9);
                              }
                            };
                            video.onerror = () => {
                              toast.error("Failed to load video", { id: "thumb-regen" });
                              URL.revokeObjectURL(video.src);
                            };
                            video.src = URL.createObjectURL(selectedFile);
                          }}
                          className="px-3 py-1.5 bg-teal-500/80 hover:bg-teal-500 text-white text-xs rounded-full transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 inline mr-1" />
                          Random frame
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <Image className="w-10 h-10 text-slate-500 mb-2" />
                    <p className="text-slate-400 text-sm">Upload thumbnail</p>
                    <p className="text-slate-500 text-xs mt-1">Auto-generated or upload custom</p>
                  </>
                )}
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Add a title that describes your video"
                    maxLength={100}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                  <p className="text-slate-500 text-xs mt-1 text-right">{title.length}/100</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell viewers about your video"
                    rows={4}
                    maxLength={5000}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
                  />
                </div>
                
                {/* Members-only toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Members Only</h4>
                      <p className="text-sm text-slate-400">Restrict this video to channel members</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMembersOnly(!isMembersOnly)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      isMembersOnly ? "bg-purple-500" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        isMembersOnly ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                
                {/* Private video toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500/20 to-slate-600/20 flex items-center justify-center border border-slate-500/30">
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">Private Video</h4>
                      <p className="text-sm text-slate-400">Only you can see this video</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      isPrivate ? "bg-slate-500" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        isPrivate ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Pricing info */}
            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white">Earnings Structure</h3>
                  <ul className="mt-2 space-y-1 text-sm text-slate-400">
                    <li>• <span className="text-teal-400">95%</span> of view payments (0.11-0.25 KAS based on video length)</li>
                    <li>• <span className="text-teal-400">0.5 KAS</span> per subscription (100% to you)</li>
                    <li>• <span className="text-teal-400">100%</span> of tips and memberships</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Upload fee notice */}
            <div className="p-4 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 rounded-xl border border-teal-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Upload Fee</p>
                  <p className="text-slate-400 text-sm">One-time fee to publish your video</p>
                </div>
                <div className="flex items-center gap-2">
                  <KaspaIcon size={20} />
                  <span className="text-xl font-bold text-white">{selectedFile ? getUploadFee(selectedFile.size) : 5}</span>
                  <span className="text-teal-400">KAS</span>
                </div>
                <p className="text-zinc-500 text-xs mt-1">
                  {selectedFile && selectedFile.size < 1024 * 1024 * 1024 
                    ? "Under 1GB" 
                    : selectedFile && selectedFile.size >= 5 * 1024 * 1024 * 1024 
                      ? "Over 5GB" 
                      : "1GB - 5GB"}
                </p>
                {balance !== null && selectedFile && Number(balance) < getUploadFee(selectedFile.size) && (
                  <p className="text-red-400 text-sm mt-2">
                    Insufficient balance. You have {Number(balance).toFixed(2)} KAS.
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-4">
              <Link 
                to="/"
                className="px-6 py-3 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </Link>
              <button 
                onClick={handleUpload}
                disabled={!title.trim()}
                className="px-8 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-full font-semibold transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 disabled:shadow-none"
              >
                Upload Video
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Uploading Progress */}
        {step === "uploading" && (
          <div className="max-w-md mx-auto text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center border border-teal-500/30">
              <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
            </div>
            
            <h2 className="text-xl font-semibold text-white mb-2">Uploading your video</h2>
            <p className="text-slate-400 mb-6">{uploadStatus}</p>
            
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-slate-400 mt-2">{uploadProgress}% complete</p>
          </div>
        )}

        {/* Step 4: Upload Complete */}
        {step === "complete" && (
          <div className="max-w-md mx-auto text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center border border-green-500/30">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-white mb-2">Upload Complete!</h2>
            <p className="text-slate-400 mb-6">Your video is now live. Redirecting...</p>
            
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 w-full" />
            </div>
          </div>
        )}
      </main>

      {/* Wallet Modal */}
      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </div>
  );
}
