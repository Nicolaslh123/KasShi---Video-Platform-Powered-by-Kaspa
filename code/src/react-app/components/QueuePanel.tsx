import { useState, useRef } from 'react';
import { X, GripVertical, Play, Trash2, ListMusic } from 'lucide-react';
import { AudioTrack } from './AudioPlayer';

interface QueuePanelProps {
  queue: AudioTrack[];
  currentTrack: AudioTrack | null;
  onClose: () => void;
  onPlayFromQueue: (index: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onReorderQueue: (fromIndex: number, toIndex: number) => void;
  onClearQueue: () => void;
  accent?: string;
}

export default function QueuePanel({
  queue,
  currentTrack,
  onClose,
  onPlayFromQueue,
  onRemoveFromQueue,
  onReorderQueue,
  onClearQueue,
  accent = '#70C7BA',
}: QueuePanelProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    dragNodeRef.current = e.target as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    // Add a slight delay to allow the drag image to be set
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === toIndex) return;
    onReorderQueue(draggedIndex, toIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full sm:w-[480px] max-h-[80vh] bg-slate-900/95 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <ListMusic className="w-5 h-5" style={{ color: accent }} />
            <h2 className="text-white font-semibold">Queue</h2>
            <span className="text-white/50 text-sm">({queue.length} tracks)</span>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={onClearQueue}
                className="text-white/50 hover:text-red-400 text-sm px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Now Playing */}
        {currentTrack && (
          <div className="p-4 border-b border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Now Playing</p>
            <div className="flex items-center gap-3">
              <img 
                src={currentTrack.coverArtUrl} 
                alt={currentTrack.title}
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{currentTrack.title}</p>
                <p className="text-white/50 text-sm truncate">{currentTrack.artist}</p>
              </div>
              <span className="text-white/40 text-sm">
                {formatDuration(currentTrack.durationSeconds)}
              </span>
            </div>
          </div>
        )}
        
        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-2">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ListMusic className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/50 mb-2">Your queue is empty</p>
              <p className="text-white/30 text-sm">Add songs from albums or playlists</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-white/40 uppercase tracking-wider px-2 py-2">Next Up</p>
              {queue.map((track, index) => (
                <div
                  key={`${track.id}-${index}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`
                    group flex items-center gap-3 p-2 rounded-lg cursor-grab active:cursor-grabbing
                    transition-all duration-150
                    ${draggedIndex === index ? 'opacity-50' : ''}
                    ${dragOverIndex === index ? 'bg-white/10 scale-[1.02]' : 'hover:bg-white/5'}
                  `}
                >
                  {/* Drag Handle */}
                  <div className="text-white/30 group-hover:text-white/50 transition-colors">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  
                  {/* Track Number */}
                  <span className="text-white/40 text-sm w-5 text-center">{index + 1}</span>
                  
                  {/* Cover Art */}
                  <img 
                    src={track.coverArtUrl} 
                    alt={track.title}
                    className="w-10 h-10 rounded object-cover"
                  />
                  
                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{track.title}</p>
                    <p className="text-white/50 text-xs truncate">{track.artist}</p>
                  </div>
                  
                  {/* Duration */}
                  <span className="text-white/40 text-xs">
                    {formatDuration(track.durationSeconds)}
                  </span>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onPlayFromQueue(index)}
                      className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                      style={{ color: accent }}
                      title="Play now"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                    <button
                      onClick={() => onRemoveFromQueue(index)}
                      className="p-1.5 text-white/50 hover:text-red-400 rounded-full hover:bg-white/10 transition-colors"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
