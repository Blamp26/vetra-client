import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RotateCw, MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useAppStore } from '@/store';
import { AuthenticatedImage } from './AuthenticatedImage';

interface ImageLightboxProps {
  src: string;
  author: string;
  time: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, author, time, onClose }) => {
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const authToken = useAppStore((s) => s.authToken);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const rect = container.getBoundingClientRect();
        
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        setScale(prevScale => {
          const nextScale = Math.max(1, Math.min(prevScale + delta, 5));
          
          if (nextScale === 1) {
            setPosition({ x: 0, y: 0 });
            return 1;
          }

          const ratio = nextScale / prevScale;
          
          setPosition(prevPos => {
            const nextX = mouseX - (mouseX - prevPos.x) * ratio;
            const nextY = mouseY - (mouseY - prevPos.y) * ratio;

            const limitX = Math.max(0, (rect.width * nextScale - rect.width) / 2);
            const limitY = Math.max(0, (rect.height * nextScale - rect.height) / 2);

            return {
              x: Math.max(-limitX, Math.min(nextX, limitX)),
              y: Math.max(-limitY, Math.min(nextY, limitY))
            };
          });

          return nextScale;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation(prev => (prev + 90) % 360);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      const limitX = Math.max(0, (rect.width * scale - rect.width) / 2);
      const limitY = Math.max(0, (rect.height * scale - rect.height) / 2);

      setPosition({
        x: Math.max(-limitX, Math.min(e.clientX - dragStart.x, limitX)),
        y: Math.max(-limitY, Math.min(e.clientY - dragStart.y, limitY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vetra_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/80"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <button 
        className="absolute top-4 right-4 p-2 bg-background border border-border text-foreground cursor-pointer z-[2001]"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      <div 
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center p-4 overflow-hidden"
      >
        <AuthenticatedImage 
          src={src} 
          alt="Lightbox" 
          className={cn(
             "max-w-full max-h-full object-contain select-none",
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
          )}
          style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
        />
      </div>

      <div 
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 bg-background border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col pr-4 border-r border-border">
          <span className="text-foreground text-sm font-normal">
            {author}
          </span>
          <span className="text-muted-foreground text-[10px] uppercase">
            {time}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleDownload}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleRotate}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Rotate 90°"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          <button 
            className="p-1 text-muted-foreground hover:text-foreground"
            title="More Options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
