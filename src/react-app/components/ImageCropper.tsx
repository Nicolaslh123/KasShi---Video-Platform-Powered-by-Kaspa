import { useState, useRef, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Check } from "lucide-react";

interface ImageCropperProps {
  isOpen: boolean;
  onClose: () => void;
  imageFile: File;
  onCropComplete: (croppedFile: File) => void;
  aspectRatio?: "square" | "banner";
  outputSize?: { width: number; height: number };
}

export function ImageCropper({
  isOpen,
  onClose,
  imageFile,
  onCropComplete,
  aspectRatio = "square",
  outputSize = { width: 400, height: 400 },
}: ImageCropperProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [displayScale, setDisplayScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Crop area sizes
  const cropSize = aspectRatio === "square" 
    ? { width: 200, height: 200 }
    : { width: 400, height: 100 };

  // Container dimensions
  const containerHeight = aspectRatio === "square" ? 300 : 200;

  // Load image when file changes
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImageUrl(url);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return () => URL.revokeObjectURL(url);
    }
  }, [imageFile]);

  // Calculate display scale when image loads
  const handleImageLoad = () => {
    if (imageRef.current && containerRef.current) {
      const img = imageRef.current;
      
      setNaturalSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });

      // Scale image to cover crop area initially
      const scaleX = cropSize.width / img.naturalWidth;
      const scaleY = cropSize.height / img.naturalHeight;
      const initialScale = Math.max(scaleX, scaleY) * 1.2; // 20% larger than minimum
      
      setDisplayScale(initialScale);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Touch support
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleZoom = (delta: number) => {
    setScale((prev) => Math.min(Math.max(prev + delta, 0.5), 3));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleCrop = async () => {
    if (!imageRef.current || !containerRef.current || !naturalSize.width) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = outputSize.width;
    canvas.height = outputSize.height;

    // Get container center
    const container = containerRef.current;
    const containerCenterX = container.clientWidth / 2;
    const containerCenterY = container.clientHeight / 2;

    // Effective scale (base display scale * user zoom)
    const effectiveScale = displayScale * scale;

    // Displayed image dimensions
    const displayedWidth = naturalSize.width * effectiveScale;
    const displayedHeight = naturalSize.height * effectiveScale;

    // Image top-left position in container
    const imageLeft = containerCenterX - displayedWidth / 2 + position.x;
    const imageTop = containerCenterY - displayedHeight / 2 + position.y;

    // Crop area position (centered in container)
    const cropLeft = containerCenterX - cropSize.width / 2;
    const cropTop = containerCenterY - cropSize.height / 2;

    // Calculate what portion of the original image is in the crop area
    // Convert crop area coordinates to original image coordinates
    const sourceX = (cropLeft - imageLeft) / effectiveScale;
    const sourceY = (cropTop - imageTop) / effectiveScale;
    const sourceWidth = cropSize.width / effectiveScale;
    const sourceHeight = cropSize.height / effectiveScale;

    // Clamp source coordinates to image bounds
    const clampedSourceX = Math.max(0, Math.min(sourceX, naturalSize.width - sourceWidth));
    const clampedSourceY = Math.max(0, Math.min(sourceY, naturalSize.height - sourceHeight));
    const clampedSourceWidth = Math.min(sourceWidth, naturalSize.width - clampedSourceX);
    const clampedSourceHeight = Math.min(sourceHeight, naturalSize.height - clampedSourceY);

    // Draw the cropped image
    ctx.drawImage(
      imageRef.current,
      clampedSourceX,
      clampedSourceY,
      clampedSourceWidth,
      clampedSourceHeight,
      0,
      0,
      outputSize.width,
      outputSize.height
    );

    // Convert to blob with high quality
    const quality = aspectRatio === "banner" ? 0.95 : 0.92;
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const croppedFile = new File([blob], imageFile.name, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          onCropComplete(croppedFile);
          onClose();
        }
      },
      "image/jpeg",
      quality
    );
  };

  if (!isOpen) return null;

  // Calculate displayed image size
  const effectiveScale = displayScale * scale;
  const displayedWidth = naturalSize.width * effectiveScale;
  const displayedHeight = naturalSize.height * effectiveScale;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full mx-4 shadow-2xl ${
          aspectRatio === "banner" ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            Adjust {aspectRatio === "square" ? "Profile Picture" : "Banner"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          Drag to reposition, use controls to zoom
        </p>

        {/* Crop area */}
        <div
          ref={containerRef}
          className="relative w-full bg-slate-800 rounded-xl overflow-hidden cursor-move select-none"
          style={{ height: containerHeight }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Image */}
          {imageUrl && (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop preview"
              onLoad={handleImageLoad}
              className="absolute pointer-events-none"
              style={{
                width: displayedWidth || "auto",
                height: displayedHeight || "auto",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
              }}
              draggable={false}
            />
          )}

          {/* Overlay with crop window cutout */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Top overlay */}
            <div 
              className="absolute left-0 right-0 top-0 bg-black/60"
              style={{ height: `calc(50% - ${cropSize.height / 2}px)` }}
            />
            {/* Bottom overlay */}
            <div 
              className="absolute left-0 right-0 bottom-0 bg-black/60"
              style={{ height: `calc(50% - ${cropSize.height / 2}px)` }}
            />
            {/* Left overlay */}
            <div 
              className="absolute left-0 bg-black/60"
              style={{ 
                top: `calc(50% - ${cropSize.height / 2}px)`,
                height: cropSize.height,
                width: `calc(50% - ${cropSize.width / 2}px)`
              }}
            />
            {/* Right overlay */}
            <div 
              className="absolute right-0 bg-black/60"
              style={{ 
                top: `calc(50% - ${cropSize.height / 2}px)`,
                height: cropSize.height,
                width: `calc(50% - ${cropSize.width / 2}px)`
              }}
            />
            
            {/* Crop window border */}
            <div
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/90 ${
                aspectRatio === "square" ? "rounded-full" : "rounded-lg"
              }`}
              style={{
                width: cropSize.width,
                height: cropSize.height,
              }}
            />
          </div>

          {/* Grid lines for rule of thirds */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ width: cropSize.width, height: cropSize.height }}
          >
            {/* Vertical lines */}
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
            {/* Horizontal lines */}
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => handleZoom(-0.1)}
            className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-5 h-5 text-white" />
          </button>
          
          <div className="flex-1 max-w-40">
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full accent-teal-500"
            />
          </div>
          
          <button
            onClick={() => handleZoom(0.1)}
            className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-5 h-5 text-white" />
          </button>
          
          <button
            onClick={handleReset}
            className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Zoom level indicator */}
        <p className="text-center text-sm text-slate-500 mt-2">
          {Math.round(scale * 100)}% zoom
        </p>

        {/* Action buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
