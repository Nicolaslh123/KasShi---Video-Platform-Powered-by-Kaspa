import { useState, useRef, useEffect, useCallback } from "react";
import { Check, Move, RotateCcw, Info, ZoomIn, ZoomOut } from "lucide-react";

interface ClipCropperProps {
  videoFile: File;
  onConfirm: (cropX: number, cropY: number, zoom: number) => void;
  onBack: () => void;
}

export default function ClipCropper({ videoFile, onConfirm, onBack }: ClipCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Crop position as percentage (0-100)
  // 50 = centered, 0 = left/top edge, 100 = right/bottom edge
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  
  // Zoom level: 1 = fit to cover, higher = more zoomed in
  const [zoom, setZoom] = useState(1);
  
  // Target aspect ratio: 9:16 (vertical)
  const TARGET_ASPECT = 9 / 16;
  
  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);
  
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight
      });
      // Start playing for preview
      video.play().catch(() => {});
    }
  }, []);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Calculate movement as percentage of container, scaled by zoom
    const sensitivity = 100 / zoom;
    const deltaX = ((e.clientX - dragStart.x) / rect.width) * sensitivity;
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * sensitivity;
    
    // Update crop position (inverted because dragging video moves opposite to crop frame)
    setCropX(prev => Math.max(0, Math.min(100, prev - deltaX)));
    setCropY(prev => Math.max(0, Math.min(100, prev - deltaY)));
    
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart, zoom]);
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !containerRef.current || e.touches.length !== 1) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    const sensitivity = 100 / zoom;
    const deltaX = ((e.touches[0].clientX - dragStart.x) / rect.width) * sensitivity;
    const deltaY = ((e.touches[0].clientY - dragStart.y) / rect.height) * sensitivity;
    
    setCropX(prev => Math.max(0, Math.min(100, prev - deltaX)));
    setCropY(prev => Math.max(0, Math.min(100, prev - deltaY)));
    
    setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  }, [isDragging, dragStart, zoom]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleTouchMove, handleMouseUp]);
  
  const handleReset = () => {
    setCropX(50);
    setCropY(50);
    setZoom(1);
  };
  
  const handleConfirm = () => {
    onConfirm(cropX, cropY, zoom);
  };
  
  // Calculate video aspect ratio
  const videoAspect = videoDimensions.width / videoDimensions.height || 1;
  
  // Only consider "already vertical" if very close to 9:16 (within 5%)
  const aspectDiff = Math.abs(videoAspect - TARGET_ASPECT) / TARGET_ASPECT;
  const isAlreadyVertical = aspectDiff < 0.05; // Within 5% of 9:16
  
  // Calculate video dimensions relative to container
  // When covering: wider videos overflow horizontally, taller videos overflow vertically
  const getVideoStyle = () => {
    if (!videoDimensions.width || !videoDimensions.height) {
      return { width: "100%", height: "100%", left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    }
    
    // Calculate how to scale video to cover the container
    const containerWidth = 280;
    const containerHeight = 498;
    
    // Scale to cover (fill) the container
    const scaleToFillWidth = containerWidth / videoDimensions.width;
    const scaleToFillHeight = containerHeight / videoDimensions.height;
    const coverScale = Math.max(scaleToFillWidth, scaleToFillHeight);
    
    // Apply zoom on top of cover scale
    const totalScale = coverScale * zoom;
    
    const videoWidth = videoDimensions.width * totalScale;
    const videoHeight = videoDimensions.height * totalScale;
    
    // Calculate overflow
    const overflowX = Math.max(0, videoWidth - containerWidth);
    const overflowY = Math.max(0, videoHeight - containerHeight);
    
    // Position based on crop values (0-100)
    // cropX/Y of 50 = centered, 0 = left/top edge visible, 100 = right/bottom edge visible
    const offsetX = -(overflowX * (cropX / 100)) + (containerWidth - videoWidth) / 2 + containerWidth / 2;
    const offsetY = -(overflowY * (cropY / 100)) + (containerHeight - videoHeight) / 2 + containerHeight / 2;
    
    return {
      width: `${videoWidth}px`,
      height: `${videoHeight}px`,
      left: `${offsetX}px`,
      top: `${offsetY}px`,
      transform: "translate(-50%, -50%)",
    };
  };
  
  // Calculate if dragging would have any effect
  const containerWidth = 280;
  const containerHeight = 498;
  const scaleToFillWidth = videoDimensions.width ? containerWidth / videoDimensions.width : 1;
  const scaleToFillHeight = videoDimensions.height ? containerHeight / videoDimensions.height : 1;
  const coverScale = Math.max(scaleToFillWidth, scaleToFillHeight);
  const totalScale = coverScale * zoom;
  const videoWidth = (videoDimensions.width || 280) * totalScale;
  const videoHeight = (videoDimensions.height || 498) * totalScale;
  const canDragX = videoWidth > containerWidth + 1;
  const canDragY = videoHeight > containerHeight + 1;
  const canDrag = canDragX || canDragY;
  
  // Check if video is horizontal (wider than 1:1)
  const isHorizontal = videoAspect > 1;
  
  return (
    <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-white">Position Your Clip</h2>
        <p className="text-slate-400 text-sm flex items-center justify-center gap-2">
          <Move className="w-4 h-4" />
          {isAlreadyVertical 
            ? "Your video is already vertical format"
            : canDrag
              ? "Drag to position your video"
              : "Use zoom to adjust framing"
          }
        </p>
      </div>
      
      {/* Zoom slider */}
      <div className="flex items-center gap-3 w-full max-w-xs">
        <ZoomOut className="w-4 h-4 text-slate-400" />
        <input
          type="range"
          min="1"
          max="3"
          step="0.1"
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <ZoomIn className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-400 w-12 text-right">{zoom.toFixed(1)}x</span>
      </div>
      
      {/* Crop preview container */}
      <div 
        ref={containerRef}
        className="relative bg-black rounded-xl overflow-hidden shadow-2xl shadow-orange-500/20 border-2 border-orange-500/50"
        style={{ 
          width: "280px", 
          height: "498px", // 9:16 aspect ratio
          cursor: canDrag ? (isDragging ? "grabbing" : "grab") : "default"
        }}
        onMouseDown={canDrag ? handleMouseDown : undefined}
        onTouchStart={canDrag ? handleTouchStart : undefined}
      >
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            className="absolute"
            style={getVideoStyle()}
            muted
            loop
            playsInline
            autoPlay
          />
        )}
        
        {/* Overlay grid for visual guidance */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="w-full h-full grid grid-cols-3 grid-rows-3">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="border border-white/10" />
            ))}
          </div>
        </div>
        
        {/* Drag indicator */}
        {canDrag && !isDragging && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-3 animate-pulse">
              <Move className="w-6 h-6 text-white" />
            </div>
          </div>
        )}
      </div>
      
      {/* Info box */}
      <div className="flex items-start gap-2 bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 max-w-sm">
        <Info className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <span>
          {isAlreadyVertical 
            ? "Great! Your video is already in vertical format and will display perfectly in the Clips feed."
            : isHorizontal
              ? "Use the zoom slider to fill the frame, then drag to position. Your horizontal video will be cropped to fit the vertical Clips format."
              : "Drag to choose which portion of your video to show in the Clips feed."
          }
        </span>
      </div>
      
      {/* Action buttons */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
        >
          Back
        </button>
        
        <button
          onClick={handleReset}
          className="px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors"
          title="Reset position"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        
        <button
          onClick={handleConfirm}
          className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-medium transition-all flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" />
          Confirm
        </button>
      </div>
    </div>
  );
}
