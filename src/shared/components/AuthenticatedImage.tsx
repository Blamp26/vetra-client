import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Component for loading images with a Bearer token.
 * Implements manual lazy loading via IntersectionObserver.
 */
export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({ src, ...props }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [isInView, setIsInView] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const authToken = useAppStore((s) => s.authToken);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (objectUrl || error || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before appearing in viewport
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [objectUrl, error, isInView]);

  useEffect(() => {
    if (!isInView || !src) return;

    let cancelled = false;

    const loadImage = async () => {
      try {
        const response = await fetch(src, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        if (!response.ok) throw new Error('Failed to load image');

        const blob = await response.blob();
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setError(false);
        }
      } catch (err) {
        console.error('[AuthenticatedImage] Error:', err);
        if (!cancelled) setError(true);
      }
    };

    loadImage();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, authToken, isInView]);

  if (error) {
    return <img {...props} src="" alt="Failed to load" />;
  }

  if (!objectUrl) {
    return (
      <div 
        ref={containerRef}
        className={props.className + " bg-muted animate-pulse"} 
        style={{ ...props.style, minHeight: props.height || '100px' }} 
      />
    );
  }

  return <img {...props} src={objectUrl} />;
};
