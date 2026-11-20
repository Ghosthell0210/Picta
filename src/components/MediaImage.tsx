import React, { useEffect, useMemo, useState } from 'react';
import { Film, Tv } from 'lucide-react';
import { getPictaImageCandidates, sizedImageMissCache } from '../lib/pictaClient';

interface MediaImageProps {
  src?: string;
  size?: string;
  alt: string;
  className?: string;
  variant?: 'video' | 'avatar' | 'poster';
  fallbackText?: string;
  priority?: boolean;
}

export const MediaImage: React.FC<MediaImageProps> = React.memo(({
  src,
  size = '480x270',
  alt,
  className = '',
  variant = 'video',
  fallbackText,
  priority = false,
}) => {
  const candidates = useMemo(() => getPictaImageCandidates(src, size), [src, size]);
  const [candidateIdx, setCandidateIdx] = useState(0);

  useEffect(() => {
    setCandidateIdx(0);
  }, [src, size]);

  const activeUrl = candidateIdx < candidates.length ? candidates[candidateIdx] : '';

  if (!activeUrl) {
    const initial = (fallbackText || alt || 'P').trim().charAt(0).toUpperCase();
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#181B22] via-[#111318] to-[#0B0C10] text-[#9CA3AF] select-none ${className}`}
        aria-label={alt}
      >
        {variant === 'avatar' ? (
          <span className="font-display font-semibold text-sm text-[#F5F6F8]">{initial}</span>
        ) : variant === 'poster' ? (
          <Tv className="w-7 h-7 opacity-40" />
        ) : (
          <Film className="w-7 h-7 opacity-40" />
        )}
      </div>
    );
  }

  return (
    <img
      src={activeUrl}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      referrerPolicy="no-referrer"
      onError={() => {
        if (candidateIdx === 0 && src && candidates.length > 2 && activeUrl !== src && !activeUrl.startsWith('/api/')) {
          sizedImageMissCache.add(`${size}::${src}`);
        }
        setCandidateIdx((idx) => idx + 1);
      }}
      className={className}
    />
  );
});
