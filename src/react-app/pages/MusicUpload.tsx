import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LocalizedLink, { useLocalizedPath } from '../components/LocalizedLink';
import Navbar from '../components/Navbar';
import { 
  Upload, Music, Mic2, X, Image, Plus, Trash2, Clock, 
  ArrowLeft, ChevronDown, ChevronUp, GripVertical,
  Disc3, Album, ListMusic, Loader2, CheckCircle, Wallet, Film
} from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { useMusicTheme } from '../contexts/MusicThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCreateMusic, useMusicProfile } from '../hooks/useMusic';
import { usePayment } from '../hooks/usePayment';
import AnimatedBackground from '../components/AnimatedBackground';
import { SecurityVerificationModal } from '../components/SecurityVerificationModal';
import { KaspaIcon } from '../components/KasShiLogo';
import { useElectronTitleBar } from '../components/ElectronTitleBar';
import toast from 'react-hot-toast';

type UploadType = 'track' | 'album' | 'podcast';
type UploadStep = 'select-type' | 'details' | 'chapters' | 'uploading' | 'complete';

interface ChapterInput {
  id: string;
  title: string;
  startTime: string; // MM:SS format for input
  startTimeSeconds: number;
}

interface TrackInput {
  id: string;
  file: File | null;
  title: string;
  durationSeconds: number;
  chapters: ChapterInput[];
}

export default function MusicUpload() {
  const navigate = useNavigate();
  const localizedPath = useLocalizedPath();
  const { } = useLanguage();
  const { isConnected, externalWallet, balance } = useWallet();
  const { theme } = useMusicTheme();
  const { titleBarPadding } = useElectronTitleBar();
  const { createAlbum, createTrack, createPodcast, createEpisode } = useCreateMusic();
  const { loading: profileLoading, createProfile, hasProfile, fetchProfile } = useMusicProfile();
  const { pay, canPay } = usePayment();
  
  // Profile creation state
  const [profileName, setProfileName] = useState('');
  const [profileHandle, setProfileHandle] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileGenre, setProfileGenre] = useState('');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [videoProfileExists, setVideoProfileExists] = useState(false);
  const [copyingFromVideo, setCopyingFromVideo] = useState(false);
  
  // Upload state
  const [uploadType, setUploadType] = useState<UploadType>('track');
  const [step, setStep] = useState<UploadStep>('select-type');
  
  // Payment state
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  
  // Single track state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear().toString());
  const [trackPrice, setTrackPrice] = useState('');
  
  // Cover art
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  
  // Chapters
  const [chapters, setChapters] = useState<ChapterInput[]>([]);
  const [showChapterEditor, setShowChapterEditor] = useState(false);
  
  // Album tracks
  const [albumTracks, setAlbumTracks] = useState<TrackInput[]>([]);
  
  // Podcast-specific
  const [isNewPodcast, setIsNewPodcast] = useState(true);
  const [existingPodcasts, setExistingPodcasts] = useState<{id: number; title: string; host_name: string; cover_art_url: string | null}[]>([]);
  const [selectedPodcastId, setSelectedPodcastId] = useState<number | null>(null);
  const [loadingPodcasts, setLoadingPodcasts] = useState(false);
  const [podcastTitle, setPodcastTitle] = useState('');
  const [hostName, setHostName] = useState('');
  const [category, setCategory] = useState('Technology');
  const [hasVideo, setHasVideo] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeDescription, setEpisodeDescription] = useState('');
  const [episodePrice, setEpisodePrice] = useState('');
  
  // Upload progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  
  // Refs
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const albumTrackInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  
  // Genre options
  const genres = [
    'Afrobeats', 'Electronic', 'Hip Hop', 'Pop', 'Rock', 'R&B', 'Jazz', 'Classical',
    'Country', 'Folk', 'Indie', 'Metal', 'Punk', 'Reggae', 'Soul',
    'Ambient', 'Dance', 'House', 'Techno', 'Lo-Fi', 'Other'
  ];
  
  // Podcast categories
  const podcastCategories = [
    'Technology', 'Business', 'Comedy', 'Education', 'News',
    'True Crime', 'Health', 'Science', 'Arts', 'Sports',
    'Music', 'Society & Culture', 'History', 'Fiction'
  ];
  
  // Validation
  const isConnectedUser = isConnected || externalWallet;
  const hasRequiredFields = uploadType === 'track' 
    ? audioFile && title && artist
    : uploadType === 'album'
    ? coverFile && albumTitle && artist && albumTracks.length > 0
    : (hasVideo ? videoFile : audioFile) && (isNewPodcast ? (podcastTitle && hostName) : selectedPodcastId) && episodeTitle;
  
  // Fetch user's existing podcasts when selecting podcast upload
  useEffect(() => {
    if (uploadType === 'podcast' && isConnectedUser) {
      const fetchPodcasts = async () => {
        setLoadingPodcasts(true);
        try {
          const headers: HeadersInit = {};
          const token = externalWallet?.authToken;
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const res = await fetch('/api/music/my-podcasts', { headers, credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            setExistingPodcasts(data.podcasts || []);
          }
        } catch {
          // Silently fail
        } finally {
          setLoadingPodcasts(false);
        }
      };
      fetchPodcasts();
    }
  }, [uploadType, isConnectedUser, externalWallet?.authToken]);
  
  // Fetch platform wallet on mount
  useEffect(() => {
    const fetchPlatformWallet = async () => {
      try {
        const res = await fetch('/api/platform-wallet');
        if (res.ok) {
          const data = await res.json();
          setPlatformWallet(data.walletAddress);
        }
      } catch {
        // Silently fail
      }
    };
    fetchPlatformWallet();
  }, []);
  
  // Calculate upload fee based on type and duration
  const calculateUploadFee = useCallback((): number => {
    if (uploadType === 'track' || uploadType === 'album') {
      // Songs: 1 KAS per track
      if (uploadType === 'album') {
        return Math.max(1, albumTracks.length); // 1 KAS per track, minimum 1
      }
      return 1;
    } else if (uploadType === 'podcast') {
      // Podcasts: depends on video and duration
      if (!hasVideo) {
        return 1; // Audio-only: 1 KAS
      }
      // Video podcasts based on duration
      const durationMins = videoDuration / 60;
      if (durationMins <= 30) {
        return 5; // ≤30 mins: 5 KAS
      } else if (durationMins <= 120) {
        return 10; // 30-120 mins: 10 KAS
      } else {
        return 15; // >120 mins: 15 KAS
      }
    }
    return 1;
  }, [uploadType, hasVideo, videoDuration, albumTracks.length]);
  
  // Extract video duration
  const extractVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => {
        resolve(0);
      };
      video.src = URL.createObjectURL(file);
    });
  };
  
  // Extract audio duration
  const extractAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };
      audio.onerror = () => {
        resolve(0);
      };
      audio.src = URL.createObjectURL(file);
    });
  };
  
  // Handle audio file selection
  const handleAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
      toast.error('Please select an audio file (MP3, WAV, FLAC, etc.)');
      return;
    }
    
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 2GB');
      return;
    }
    
    setAudioFile(file);
    const duration = await extractAudioDuration(file);
    setAudioDuration(duration);
    
    // Auto-fill title from filename
    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }
  };
  
  // Handle cover art selection
  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCoverPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Handle album track addition
  const handleAlbumTrackSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newTracks: TrackInput[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;
      
      const duration = await extractAudioDuration(file);
      newTracks.push({
        id: `track-${Date.now()}-${i}`,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        durationSeconds: duration,
        chapters: [],
      });
    }
    
    setAlbumTracks(prev => [...prev, ...newTracks]);
  };
  
  // Handle video file selection for podcasts
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file (MP4, MOV, etc.)');
      return;
    }
    
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      toast.error('Video file too large. Maximum size is 2GB');
      return;
    }
    
    setVideoFile(file);
    setHasVideo(true);
    
    // Extract video duration for fee calculation
    const duration = await extractVideoDuration(file);
    setVideoDuration(duration);
  };
  
  // Chapter management
  const parseTimeToSeconds = (time: string): number => {
    const parts = time.split(':').map(Number);
    if (parts.length === 2) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    } else if (parts.length === 3) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    return 0;
  };
  
  const formatSecondsToTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const addChapter = () => {
    const newChapter: ChapterInput = {
      id: `chapter-${Date.now()}`,
      title: '',
      startTime: formatSecondsToTime(chapters.length === 0 ? 0 : 
        (chapters[chapters.length - 1]?.startTimeSeconds || 0) + 60),
      startTimeSeconds: chapters.length === 0 ? 0 : 
        (chapters[chapters.length - 1]?.startTimeSeconds || 0) + 60,
    };
    setChapters(prev => [...prev, newChapter]);
  };
  
  const updateChapter = (id: string, field: 'title' | 'startTime', value: string) => {
    setChapters(prev => prev.map(ch => {
      if (ch.id !== id) return ch;
      if (field === 'startTime') {
        return { ...ch, startTime: value, startTimeSeconds: parseTimeToSeconds(value) };
      }
      return { ...ch, [field]: value };
    }));
  };
  
  const removeChapter = (id: string) => {
    setChapters(prev => prev.filter(ch => ch.id !== id));
  };
  
  const removeAlbumTrack = (id: string) => {
    setAlbumTracks(prev => prev.filter(t => t.id !== id));
  };
  
  // Upload file to R2 storage
  const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
  
  const uploadFileToR2 = async (file: File): Promise<string> => {
    const headers: Record<string, string> = {};
    if (externalWallet?.authToken) {
      headers['Authorization'] = `Bearer ${externalWallet.authToken}`;
    }
    
    // Use chunked upload for files > 95MB (Cloudflare single request limit)
    // Don't rely on MIME type detection as some browsers return empty or incorrect types
    if (file.size > 95 * 1024 * 1024) {
      // Initialize multipart upload
      const initResponse = await fetch('/api/upload/music/init', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });
      
      if (!initResponse.ok) {
        const error = await initResponse.json();
        throw new Error(error.error || 'Failed to initialize upload');
      }
      
      const { uploadId, key } = await initResponse.json();
      const parts: { partNumber: number; etag: string }[] = [];
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      
      // Upload each chunk
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const partNumber = i + 1;
        
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('key', key);
        formData.append('uploadId', uploadId);
        formData.append('partNumber', partNumber.toString());
        
        const partResponse = await fetch('/api/upload/music/part', {
          method: 'POST',
          headers,
          body: formData,
        });
        
        if (!partResponse.ok) {
          throw new Error(`Failed to upload part ${partNumber}`);
        }
        
        const partData = await partResponse.json();
        parts.push({ partNumber, etag: partData.etag });
      }
      
      // Complete multipart upload
      const completeResponse = await fetch('/api/upload/music/complete', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, uploadId, parts }),
      });
      
      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }
      
      const completeData = await completeResponse.json();
      return completeData.url;
    }
    
    // Simple upload for small files
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload/music', {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload file');
    }
    
    const data = await response.json();
    return data.url;
  };

  // Handle upload fee payment
  const handlePaymentAndUpload = async () => {
    if (!hasRequiredFields) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    const fee = calculateUploadFee();
    const balanceNum = parseFloat(balance) || 0;
    
    // Check if user has enough balance
    if (balanceNum < fee) {
      toast.error(`Insufficient balance. You need ${fee} KAS to upload.`);
      return;
    }
    
    if (!platformWallet) {
      toast.error('Unable to process payment. Please try again.');
      return;
    }
    
    // Show security modal for payment verification
    setShowSecurityModal(true);
  };
  
  // Execute upload after security verification - UPLOAD FIRST, then payment
  const executeUploadWithPayment = async (_password?: string) => {
    setShowSecurityModal(false);
    
    if (!hasRequiredFields) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setStep('uploading');
    setUploadProgress(0);
    setUploadStatus('Uploading files...');
    
    try {
      // STEP 1: Upload all files to R2 first (before payment)
      let coverArtUrl: string | undefined;
      let audioUrl: string | undefined;
      let videoUrl: string | undefined;
      const uploadedTrackUrls: { [key: string]: string } = {};
      
      // Upload cover art if provided
      if (coverFile) {
        setUploadStatus('Uploading cover art...');
        setUploadProgress(5);
        coverArtUrl = await uploadFileToR2(coverFile);
      }
      
      if (uploadType === 'track') {
        if (audioFile) {
          setUploadStatus('Uploading audio...');
          setUploadProgress(20);
          audioUrl = await uploadFileToR2(audioFile);
        }
      } else if (uploadType === 'album') {
        // Upload all album tracks
        for (let i = 0; i < albumTracks.length; i++) {
          const track = albumTracks[i];
          if (track.file) {
            setUploadStatus(`Uploading track ${i + 1} of ${albumTracks.length}...`);
            setUploadProgress(10 + Math.floor((i + 1) / albumTracks.length * 40));
            uploadedTrackUrls[track.id] = await uploadFileToR2(track.file);
          }
        }
      } else if (uploadType === 'podcast') {
        if (hasVideo && videoFile) {
          setUploadStatus('Uploading episode video...');
          setUploadProgress(20);
          videoUrl = await uploadFileToR2(videoFile);
          audioUrl = videoUrl;
        } else if (audioFile) {
          setUploadStatus('Uploading episode audio...');
          setUploadProgress(20);
          audioUrl = await uploadFileToR2(audioFile);
        }
      }
      
      setUploadProgress(50);
      setUploadStatus('Processing payment...');
      
      // STEP 2: Process payment only after successful file upload
      const fee = calculateUploadFee();
      setIsProcessingPayment(true);
      
      const paymentResult = await pay(platformWallet!, fee, {
        paymentType: 'upload_fee',
        silent: false,
      });
      
      setIsProcessingPayment(false);
      
      if (!paymentResult.success) {
        toast.error(paymentResult.error || 'Payment failed');
        setStep('details');
        return;
      }
      
      toast.success(`Upload fee of ${fee} KAS paid!`);
      setUploadProgress(60);
      
      // STEP 3: Save to database after payment succeeds
      await saveToDatabase(coverArtUrl, audioUrl, videoUrl, uploadedTrackUrls);
      
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      toast.error(errorMessage);
      setIsProcessingPayment(false);
      setStep('details');
    }
  };
  
  // Save content to database (called after successful file upload and payment)
  const saveToDatabase = async (
    coverArtUrl: string | undefined,
    audioUrl: string | undefined,
    videoUrl: string | undefined,
    uploadedTrackUrls: { [key: string]: string }
  ) => {
    setUploadStatus('Saving...');

    try {
      if (uploadType === 'track') {
        setUploadProgress(70);
        setUploadStatus('Saving track...');
        const trackData = {
          title,
          description,
          audioUrl,
          coverArtUrl,
          durationSeconds: Math.floor(audioDuration),
          genre,
          priceKas: trackPrice && parseFloat(trackPrice) >= 0.11 ? trackPrice : '0',
          isExplicit: false,
          chapters: chapters.map((ch, idx) => ({
            title: ch.title,
            startTimeSeconds: ch.startTimeSeconds,
            orderIndex: idx,
          })),
        };
        
        await createTrack(trackData);
        setUploadProgress(100);
        
      } else if (uploadType === 'album') {
        // Create album first
        setUploadStatus('Creating album...');
        const albumData = {
          title: albumTitle,
          description,
          coverArtUrl,
          genre,
          releaseDate: `${releaseYear}-01-01`,
          priceKas: '0',
        };
        
        const albumId = await createAlbum(albumData);
        if (!albumId) throw new Error('Failed to create album');
        
        setUploadProgress(70);
        
        // Save each track to database
        for (let i = 0; i < albumTracks.length; i++) {
          const track = albumTracks[i];
          setUploadStatus(`Saving track ${i + 1} of ${albumTracks.length}...`);
          
          await createTrack({
            title: track.title,
            audioUrl: uploadedTrackUrls[track.id],
            coverArtUrl,
            durationSeconds: Math.floor(track.durationSeconds),
            trackNumber: i + 1,
            genre,
            priceKas: '0',
            isExplicit: false,
            albumId,
            chapters: track.chapters.map((ch, idx) => ({
              title: ch.title,
              startTimeSeconds: ch.startTimeSeconds,
              orderIndex: idx,
            })),
          });
          
          setUploadProgress(70 + Math.floor((i + 1) / albumTracks.length * 30));
        }
        
      } else if (uploadType === 'podcast') {
        // Create or get podcast
        let podcastId: number;
        
        if (!isNewPodcast && selectedPodcastId) {
          // Use existing podcast
          setUploadStatus('Adding to existing podcast...');
          podcastId = selectedPodcastId;
        } else {
          // Create new podcast
          setUploadStatus('Creating podcast...');
          const podcastData = {
            title: podcastTitle,
            description: episodeDescription,
            coverArtUrl,
            category,
            isVideoPodcast: hasVideo,
            isExplicit: false,
          };
          
          const newPodcastId = await createPodcast(podcastData);
          if (!newPodcastId) throw new Error('Failed to create podcast');
          podcastId = newPodcastId;
        }
        
        setUploadProgress(80);
        
        // Create episode
        setUploadStatus('Creating episode...');
        await createEpisode({
          podcastId,
          title: episodeTitle,
          description: episodeDescription,
          audioUrl,
          videoUrl,
          durationSeconds: Math.floor(audioDuration),
          episodeNumber: 1,
          seasonNumber: 1,
          isExplicit: false,
          priceKas: episodePrice && parseFloat(episodePrice) >= 0.11 ? episodePrice : '0',
          chapters: chapters.map((ch, idx) => ({
            title: ch.title,
            startTimeSeconds: ch.startTimeSeconds,
            orderIndex: idx,
          })),
        });
        
        setUploadProgress(100);
      }
      
      setUploadStatus('Complete!');
      setStep('complete');
      toast.success('Upload complete!');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed. Please try again.');
      setStep('details');
    }
  };
  
  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (!isConnectedUser) {
    return (
      <div className={`min-h-screen relative ${titleBarPadding}`}>
        <AnimatedBackground themeId={theme.id} accent={theme.accent} />
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 pt-24 pb-8 relative z-10">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 text-center">
            <Music className="w-16 h-16 mx-auto mb-4 text-white/40" />
            <h2 className="text-2xl font-bold text-white mb-2">Sign in to Upload</h2>
            <p className="text-white/60 mb-6">Connect your wallet to upload music and podcasts</p>
            <LocalizedLink 
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-black font-medium"
              style={{ backgroundColor: theme.accent }}
            >
              Go Home
            </LocalizedLink>
          </div>
        </div>
      </div>
    );
  }

  // Handle profile creation
  const handleCreateProfile = async () => {
    if (!profileName.trim() || !profileHandle.trim()) {
      toast.error('Name and handle are required');
      return;
    }
    
    // Validate handle format
    const handleRegex = /^[a-zA-Z0-9_]+$/;
    if (!handleRegex.test(profileHandle)) {
      toast.error('Handle can only contain letters, numbers, and underscores');
      return;
    }
    
    setCreatingProfile(true);
    try {
      await createProfile({
        name: profileName.trim(),
        handle: profileHandle.trim().toLowerCase(),
        bio: profileBio.trim() || undefined,
        genre: profileGenre || undefined,
      });
      toast.success('Music profile created!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setCreatingProfile(false);
    }
  };

  // Check if user has a video channel to copy from
  const checkVideoProfile = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      const token = externalWallet?.authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch('/api/music/copy-from-video', {
        headers,
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setVideoProfileExists(data.exists);
      }
    } catch (error) {
      console.error('Error checking video profile:', error);
    }
  }, [externalWallet?.authToken]);

  // Copy profile data from video site
  const handleCopyFromVideo = async () => {
    setCopyingFromVideo(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = externalWallet?.authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch('/api/music/copy-from-video', {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to copy profile');
      }
      
      // Profile was created by the backend - refresh profile state
      await fetchProfile();
      
      toast.success('Profile copied from KasShi Video!');
    } catch (error) {
      console.error('Error copying video profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to copy profile');
    } finally {
      setCopyingFromVideo(false);
    }
  };

  // Check for video profile when showing profile creation
  useEffect(() => {
    if ((isConnected || externalWallet) && !hasProfile && !profileLoading) {
      checkVideoProfile();
    }
  }, [isConnected, externalWallet, hasProfile, profileLoading, checkVideoProfile]);

  if (profileLoading) {
    return (
      <div className={`min-h-screen relative ${titleBarPadding}`}>
        <AnimatedBackground themeId={theme.id} accent={theme.accent} />
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 pt-24 pb-8 relative z-10">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-white/60 animate-spin" />
            <p className="text-white/60">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <div className={`min-h-screen relative ${titleBarPadding}`}>
        <AnimatedBackground themeId={theme.id} accent={theme.accent} />
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 pt-24 pb-8 relative z-10">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8">
            <div className="text-center mb-8">
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${theme.accent}20` }}
              >
                <Music className="w-10 h-10" style={{ color: theme.accent }} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Create Your Music Profile</h2>
              <p className="text-white/60">Set up your artist profile to start uploading music and podcasts</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Artist / Creator Name *
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                />
              </div>
              
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Handle *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">@</span>
                  <input
                    type="text"
                    value={profileHandle}
                    onChange={(e) => setProfileHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="your_handle"
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                  />
                </div>
                <p className="text-white/40 text-xs mt-1">Letters, numbers, and underscores only</p>
              </div>
              
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Bio
                </label>
                <textarea
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  placeholder="Tell listeners about yourself..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Primary Genre
                </label>
                <select
                  value={profileGenre}
                  onChange={(e) => setProfileGenre(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:border-white/30"
                >
                  <option value="" className="bg-slate-900">Select genre</option>
                  {genres.map(g => (
                    <option key={g} value={g} className="bg-slate-900">{g}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col gap-3">
                {videoProfileExists && (
                  <button
                    onClick={handleCopyFromVideo}
                    disabled={copyingFromVideo}
                    className="w-full py-3 rounded-xl font-medium text-white transition-all bg-white/10 border border-white/20 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {copyingFromVideo ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Copying...
                      </>
                    ) : (
                      <>
                        <Film className="w-5 h-5" />
                        Copy Video Profile
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={handleCreateProfile}
                  disabled={creatingProfile || !profileName.trim() || !profileHandle.trim()}
                  className="w-full py-3 rounded-xl font-medium text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ backgroundColor: theme.accent }}
                >
                  {creatingProfile ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating Profile...
                    </>
                  ) : (
                    'Create Music Profile'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`min-h-screen relative ${titleBarPadding}`}>
      <AnimatedBackground themeId={theme.id} accent={theme.accent} />
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-24 sm:pb-32 relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <button 
            onClick={() => step === 'select-type' ? navigate(localizedPath('/music')) : setStep('select-type')}
            className="p-1.5 sm:p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Upload Music</h1>
        </div>
        
        {/* Step: Select Type */}
        {step === 'select-type' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Single Track */}
            <button
              onClick={() => { setUploadType('track'); setStep('details'); }}
              className="group bg-white/5 hover:bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl p-5 sm:p-8 text-left transition-all border border-transparent hover:border-white/20"
            >
              <div 
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${theme.accent}20` }}
              >
                <Music className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: theme.accent }} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 sm:mb-2">Single Track</h3>
              <p className="text-white/60 text-xs sm:text-sm">Upload a single song with cover art and chapters</p>
            </button>
            
            {/* Album */}
            <button
              onClick={() => { setUploadType('album'); setStep('details'); }}
              className="group bg-white/5 hover:bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl p-5 sm:p-8 text-left transition-all border border-transparent hover:border-white/20"
            >
              <div 
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${theme.accent}20` }}
              >
                <Disc3 className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: theme.accent }} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 sm:mb-2">Album / EP</h3>
              <p className="text-white/60 text-xs sm:text-sm">Upload multiple tracks as a cohesive release</p>
            </button>
            
            {/* Podcast */}
            <button
              onClick={() => { setUploadType('podcast'); setStep('details'); }}
              className="group bg-white/5 hover:bg-white/10 backdrop-blur-xl rounded-xl sm:rounded-2xl p-5 sm:p-8 text-left transition-all border border-transparent hover:border-white/20"
            >
              <div 
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${theme.accent}20` }}
              >
                <Mic2 className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: theme.accent }} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 sm:mb-2">Podcast Episode</h3>
              <p className="text-white/60 text-xs sm:text-sm">Upload a podcast episode with chapters</p>
            </button>
          </div>
        )}
        
        {/* Step: Details */}
        {step === 'details' && (
          <div className="bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8">
            {/* Upload Type Badge */}
            <div className="flex items-center gap-2 mb-4 sm:mb-6">
              {uploadType === 'track' && <Music className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />}
              {uploadType === 'album' && <Disc3 className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />}
              {uploadType === 'podcast' && <Mic2 className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.accent }} />}
              <span className="text-white/60 text-xs sm:text-sm capitalize">{uploadType} Upload</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {/* Cover Art */}
              <div className="flex justify-center md:block">
                <div className="w-full max-w-[200px] md:max-w-none">
                  <label className="block text-white/80 text-xs sm:text-sm font-medium mb-2">
                    Cover Art *
                  </label>
                  <div 
                    onClick={() => coverInputRef.current?.click()}
                    className="aspect-square rounded-lg sm:rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 transition-colors cursor-pointer overflow-hidden flex items-center justify-center bg-white/5"
                  >
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-3 sm:p-4">
                        <Image className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-white/40" />
                        <p className="text-white/40 text-xs sm:text-sm">Click to upload</p>
                        <p className="text-white/30 text-[10px] sm:text-xs mt-1">1:1 ratio recommended</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverSelect}
                    className="hidden"
                  />
                  {coverFile && (
                    <button 
                      onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                      className="mt-2 text-xs sm:text-sm text-red-400 hover:text-red-300"
                    >
                      Remove cover
                    </button>
                  )}
                </div>
              </div>
              
              {/* Metadata */}
              <div className="md:col-span-2 space-y-4">
                {/* Single Track / Album Common Fields */}
                {(uploadType === 'track' || uploadType === 'album') && (
                  <>
                    {uploadType === 'track' && (
                      <>
                        {/* Audio File */}
                        <div>
                          <label className="block text-white/80 text-sm font-medium mb-2">
                            Audio File *
                          </label>
                          {audioFile ? (
                            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
                              <Music className="w-5 h-5 text-white/60" />
                              <div className="flex-1 min-w-0">
                                <p className="text-white truncate">{audioFile.name}</p>
                                <p className="text-white/40 text-sm">
                                  {(audioFile.size / 1024 / 1024).toFixed(1)} MB • {formatDuration(audioDuration)}
                                </p>
                              </div>
                              <button 
                                onClick={() => { setAudioFile(null); setAudioDuration(0); }}
                                className="p-1 hover:bg-white/10 rounded"
                              >
                                <X className="w-4 h-4 text-white/60" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => audioInputRef.current?.click()}
                              className="w-full p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-xl transition-colors"
                            >
                              <Upload className="w-6 h-6 mx-auto mb-2 text-white/40" />
                              <p className="text-white/60">Select audio file</p>
                              <p className="text-white/40 text-xs mt-1">MP3, WAV, FLAC up to 2GB</p>
                            </button>
                          )}
                          <input
                            ref={audioInputRef}
                            type="file"
                            accept="audio/*"
                            onChange={handleAudioSelect}
                            className="hidden"
                          />
                        </div>
                        
                        {/* Track Title */}
                        <div>
                          <label className="block text-white/80 text-sm font-medium mb-2">
                            Track Title *
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter track title"
                            className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </>
                    )}
                    
                    {uploadType === 'album' && (
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Album Title *
                        </label>
                        <input
                          type="text"
                          value={albumTitle}
                          onChange={(e) => setAlbumTitle(e.target.value)}
                          placeholder="Enter album title"
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                        />
                      </div>
                    )}
                    
                    {/* Artist */}
                    <div>
                      <label className="block text-white/80 text-sm font-medium mb-2">
                        Artist Name *
                      </label>
                      <input
                        type="text"
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        placeholder="Enter artist name"
                        className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Genre */}
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Genre
                        </label>
                        <select
                          value={genre}
                          onChange={(e) => setGenre(e.target.value)}
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 appearance-none cursor-pointer"
                        >
                          <option value="" className="bg-slate-900">Select genre</option>
                          {genres.map(g => (
                            <option key={g} value={g} className="bg-slate-900">{g}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Release Year */}
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Release Year
                        </label>
                        <input
                          type="number"
                          value={releaseYear}
                          onChange={(e) => setReleaseYear(e.target.value)}
                          min="1900"
                          max={new Date().getFullYear() + 1}
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                    
                    {uploadType === 'track' && (
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Album (Optional)
                        </label>
                        <input
                          type="text"
                          value={albumTitle}
                          onChange={(e) => setAlbumTitle(e.target.value)}
                          placeholder="If part of an album"
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                        />
                      </div>
                    )}
                    
                    {/* Price for tracks */}
                    {uploadType === 'track' && (
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Price (KAS)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={trackPrice}
                            onChange={(e) => setTrackPrice(e.target.value)}
                            placeholder="0 = Free, minimum 0.11 KAS"
                            min="0"
                            step="0.01"
                            className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <p className="text-white/40 text-xs mt-1">
                          Leave empty or 0 for free. Paid tracks require minimum 0.11 KAS.
                        </p>
                      </div>
                    )}
                  </>
                )}
                
                {/* Podcast Fields */}
                {uploadType === 'podcast' && (
                  <>
                    {/* Video/Audio toggle - moved before file upload */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasVideo}
                        onChange={(e) => {
                          setHasVideo(e.target.checked);
                          // Clear file when switching between audio/video
                          setAudioFile(null);
                          setVideoFile(null);
                          setAudioDuration(0);
                        }}
                        className="w-5 h-5 rounded bg-white/10 border-white/20"
                      />
                      <span className="text-white/80">This episode has a video version</span>
                    </label>
                    
                    {/* Episode File - switches between audio and video based on hasVideo */}
                    <div>
                      <label className="block text-white/80 text-sm font-medium mb-2">
                        {hasVideo ? 'Episode Video *' : 'Episode Audio *'}
                      </label>
                      {(hasVideo ? videoFile : audioFile) ? (
                        <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
                          {hasVideo ? (
                            <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          ) : (
                            <Mic2 className="w-5 h-5 text-white/60" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate">{(hasVideo ? videoFile : audioFile)?.name}</p>
                            <p className="text-white/40 text-sm">
                              {(((hasVideo ? videoFile : audioFile)?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
                              {!hasVideo && audioDuration > 0 && ` • ${formatDuration(audioDuration)}`}
                            </p>
                          </div>
                          <button 
                            onClick={() => {
                              if (hasVideo) {
                                setVideoFile(null);
                              } else {
                                setAudioFile(null);
                                setAudioDuration(0);
                              }
                            }}
                            className="p-1 hover:bg-white/10 rounded"
                          >
                            <X className="w-4 h-4 text-white/60" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => hasVideo ? videoInputRef.current?.click() : audioInputRef.current?.click()}
                          className="w-full p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-xl transition-colors"
                        >
                          <Upload className="w-6 h-6 mx-auto mb-2 text-white/40" />
                          <p className="text-white/60">Select {hasVideo ? 'video' : 'audio'} file</p>
                          <p className="text-white/40 text-xs mt-1">{hasVideo ? 'MP4, MOV up to 2GB' : 'MP3, WAV, FLAC up to 2GB'}</p>
                        </button>
                      )}
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioSelect}
                        className="hidden"
                      />
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleVideoSelect}
                        className="hidden"
                      />
                    </div>
                    
                    {/* Podcast Selection: New vs Existing */}
                    {loadingPodcasts && (
                      <div className="text-white/60 text-sm">Loading your podcasts...</div>
                    )}
                    {!loadingPodcasts && existingPodcasts.length > 0 && (
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={() => { setIsNewPodcast(false); setSelectedPodcastId(existingPodcasts[0]?.id || null); }}
                          className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                            !isNewPodcast 
                              ? 'bg-white/20 text-white border border-white/30' 
                              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                          }`}
                        >
                          Add to Existing Podcast
                        </button>
                        <button
                          onClick={() => { setIsNewPodcast(true); setSelectedPodcastId(null); }}
                          className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                            isNewPodcast 
                              ? 'bg-white/20 text-white border border-white/30' 
                              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                          }`}
                        >
                          Create New Podcast
                        </button>
                      </div>
                    )}
                    
                    {!isNewPodcast && existingPodcasts.length > 0 ? (
                      <div>
                        <label className="block text-white/80 text-sm font-medium mb-2">
                          Select Podcast *
                        </label>
                        <select
                          value={selectedPodcastId || ''}
                          onChange={(e) => setSelectedPodcastId(Number(e.target.value))}
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 appearance-none cursor-pointer"
                        >
                          {existingPodcasts.map(p => (
                            <option key={p.id} value={p.id} className="bg-slate-900">
                              {p.title} {p.host_name ? `(${p.host_name})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-white/80 text-sm font-medium mb-2">
                            Podcast Name *
                          </label>
                          <input
                            type="text"
                            value={podcastTitle}
                            onChange={(e) => setPodcastTitle(e.target.value)}
                            placeholder="Your podcast name"
                            className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-white/80 text-sm font-medium mb-2">
                              Host Name *
                            </label>
                            <input
                              type="text"
                              value={hostName}
                              onChange={(e) => setHostName(e.target.value)}
                              placeholder="Host name"
                              className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                            />
                          </div>
                          <div>
                            <label className="block text-white/80 text-sm font-medium mb-2">
                              Category
                            </label>
                            <select
                              value={category}
                              onChange={(e) => setCategory(e.target.value)}
                              className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white focus:outline-none focus:border-white/30 appearance-none cursor-pointer"
                            >
                              {podcastCategories.map(c => (
                                <option key={c} value={c} className="bg-slate-900">{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                    
                    <div>
                      <label className="block text-white/80 text-sm font-medium mb-2">
                        Episode Title *
                      </label>
                      <input
                        type="text"
                        value={episodeTitle}
                        onChange={(e) => setEpisodeTitle(e.target.value)}
                        placeholder="Episode title"
                        className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-white/80 text-sm font-medium mb-2">
                        Episode Description
                      </label>
                      <textarea
                        value={episodeDescription}
                        onChange={(e) => setEpisodeDescription(e.target.value)}
                        placeholder="Describe this episode"
                        rows={3}
                        className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30 resize-none"
                      />
                    </div>
                    
                    {/* Episode Price */}
                    <div>
                      <label className="block text-white/80 text-sm font-medium mb-2">
                        Episode Price (KAS)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={episodePrice}
                          onChange={(e) => setEpisodePrice(e.target.value)}
                          placeholder="0 = Free, minimum 0.11 KAS"
                          min="0"
                          step="0.01"
                          className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                        />
                      </div>
                      <p className="text-white/40 text-xs mt-1">
                        Leave empty or 0 for free. Paid episodes require minimum 0.11 KAS.
                      </p>
                    </div>

                  </>
                )}
                
                {/* Description (all types) */}
                {uploadType !== 'podcast' && (
                  <div>
                    <label className="block text-white/80 text-sm font-medium mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add a description"
                      rows={3}
                      className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/30 resize-none"
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* Album Track List */}
            {uploadType === 'album' && (
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <ListMusic className="w-5 h-5" style={{ color: theme.accent }} />
                    Tracks ({albumTracks.length})
                  </h3>
                  <button
                    onClick={() => albumTrackInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-black transition-colors"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <Plus className="w-4 h-4" />
                    Add Tracks
                  </button>
                  <input
                    ref={albumTrackInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleAlbumTrackSelect}
                    className="hidden"
                  />
                </div>
                
                {albumTracks.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-white/10 rounded-xl">
                    <Album className="w-10 h-10 mx-auto mb-2 text-white/30" />
                    <p className="text-white/40">No tracks added yet</p>
                    <p className="text-white/30 text-sm mt-1">Click "Add Tracks" to select audio files</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {albumTracks.map((track, index) => (
                      <div 
                        key={track.id}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl group"
                      >
                        <GripVertical className="w-4 h-4 text-white/20 cursor-grab" />
                        <span className="w-6 text-center text-white/40 text-sm">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={track.title}
                            onChange={(e) => {
                              setAlbumTracks(prev => prev.map(t => 
                                t.id === track.id ? { ...t, title: e.target.value } : t
                              ));
                            }}
                            className="bg-transparent text-white w-full focus:outline-none"
                            placeholder="Track title"
                          />
                        </div>
                        <span className="text-white/40 text-sm">{formatDuration(track.durationSeconds)}</span>
                        <button
                          onClick={() => removeAlbumTrack(track.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Episode Editor Toggle - Podcasts only */}
            {uploadType === 'podcast' && audioFile && (
              <div className="mt-8 border-t border-white/10 pt-6">
                <button
                  onClick={() => setShowChapterEditor(!showChapterEditor)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" style={{ color: theme.accent }} />
                    <span className="text-white font-medium">Episodes</span>
                    {chapters.length > 0 && (
                      <span className="px-2 py-0.5 bg-white/10 rounded-full text-white/60 text-xs">
                        {chapters.length}
                      </span>
                    )}
                  </div>
                  {showChapterEditor ? (
                    <ChevronUp className="w-5 h-5 text-white/40" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-white/40" />
                  )}
                </button>
                
                {showChapterEditor && (
                  <div className="mt-4 space-y-3">
                    {chapters.map((chapter, index) => (
                      <div key={chapter.id} className="flex items-center gap-3">
                        <span className="w-6 text-center text-white/40 text-sm">{index + 1}</span>
                        <input
                          type="text"
                          value={chapter.startTime}
                          onChange={(e) => updateChapter(chapter.id, 'startTime', e.target.value)}
                          placeholder="0:00"
                          className="w-20 px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-center focus:outline-none focus:border-white/30"
                        />
                        <input
                          type="text"
                          value={chapter.title}
                          onChange={(e) => updateChapter(chapter.id, 'title', e.target.value)}
                          placeholder="Episode title"
                          className="flex-1 px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                        />
                        <button
                          onClick={() => removeChapter(chapter.id)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ))}
                    
                    <button
                      onClick={addChapter}
                      className="flex items-center gap-2 text-sm hover:bg-white/5 px-3 py-2 rounded-lg transition-colors"
                      style={{ color: theme.accent }}
                    >
                      <Plus className="w-4 h-4" />
                      Add Episode
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Upload Fee Display */}
            <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Upload Fee
                  </h4>
                  <p className="text-white/60 text-sm mt-1">
                    {uploadType === 'track' && 'Single track upload'}
                    {uploadType === 'album' && `Album with ${albumTracks.length} track${albumTracks.length !== 1 ? 's' : ''}`}
                    {uploadType === 'podcast' && (hasVideo 
                      ? `Video episode (${videoDuration > 0 ? Math.floor(videoDuration / 60) : '?'} mins)`
                      : 'Audio-only episode'
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xl font-bold" style={{ color: theme.accent }}>
                    <KaspaIcon size={20} />
                    <span>{calculateUploadFee()} KAS</span>
                  </div>
                  <p className="text-white/40 text-sm">
                    Balance: {parseFloat(balance || '0').toFixed(2)} KAS
                  </p>
                </div>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="mt-6 flex justify-end gap-4">
              <button
                onClick={() => setStep('select-type')}
                className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handlePaymentAndUpload}
                disabled={!hasRequiredFields || !canPay || parseFloat(balance || '0') < calculateUploadFee() || isProcessingPayment}
                className="px-8 py-3 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ 
                  backgroundColor: hasRequiredFields && canPay && parseFloat(balance || '0') >= calculateUploadFee() ? theme.accent : 'rgba(255,255,255,0.1)',
                  color: hasRequiredFields && canPay && parseFloat(balance || '0') >= calculateUploadFee() ? 'black' : 'rgba(255,255,255,0.4)'
                }}
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Pay & Upload {uploadType === 'album' ? 'Album' : uploadType === 'podcast' ? 'Episode' : 'Track'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        
        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8">
            <div className="text-center max-w-md mx-auto">
              {/* Cover Preview */}
              {coverPreview && (
                <div className="w-32 h-32 mx-auto mb-6 rounded-xl overflow-hidden shadow-2xl">
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                </div>
              )}
              
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: theme.accent }} />
              <h2 className="text-xl font-bold text-white mb-2">{uploadStatus}</h2>
              
              {/* Progress Bar */}
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-6">
                <div 
                  className="h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%`, backgroundColor: theme.accent }}
                />
              </div>
              <p className="text-white/60 mt-2">{uploadProgress}%</p>
            </div>
          </div>
        )}
        
        {/* Step: Complete */}
        {step === 'complete' && (
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8">
            <div className="text-center max-w-md mx-auto">
              {coverPreview && (
                <div className="w-32 h-32 mx-auto mb-6 rounded-xl overflow-hidden shadow-2xl">
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                </div>
              )}
              
              <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: theme.accent }} />
              <h2 className="text-2xl font-bold text-white mb-2">Upload Complete!</h2>
              <p className="text-white/60 mb-6">
                Your {uploadType === 'album' ? 'album' : uploadType === 'podcast' ? 'episode' : 'track'} has been uploaded successfully.
              </p>
              
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    setStep('select-type');
                    setAudioFile(null);
                    setCoverFile(null);
                    setCoverPreview(null);
                    setTitle('');
                    setArtist('');
                    setAlbumTitle('');
                    setChapters([]);
                    setAlbumTracks([]);
                    setPodcastTitle('');
                    setEpisodeTitle('');
                    setEpisodeDescription('');
                    setVideoFile(null);
                    setHasVideo(false);
                  }}
                  className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
                >
                  Upload Another
                </button>
                <LocalizedLink
                  to="/music"
                  className="px-6 py-3 rounded-full font-medium text-black"
                  style={{ backgroundColor: theme.accent }}
                >
                  Go to Music
                </LocalizedLink>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Security Verification Modal */}
      <SecurityVerificationModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        onVerified={executeUploadWithPayment}
        transactionType="upload_fee"
        amount={calculateUploadFee()}
      />
    </div>
  );
}
