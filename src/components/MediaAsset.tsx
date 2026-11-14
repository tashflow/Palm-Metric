import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';
import { resolveStorageUrl } from '../lib/firebase';

interface StorageImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  disabled?: boolean;
}

export function StorageImage({
  src,
  alt,
  className = '',
  fallbackLabel,
  disabled = false,
}: StorageImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>(src ?? '');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setLoaded(false);

    if (!src) {
      setResolvedUrl('');
      return;
    }

    if (
      src.startsWith('https://') ||
      src.startsWith('http://') ||
      src.startsWith('/') ||
      src.startsWith('data:') ||
      src.startsWith('blob:')
    ) {
      setResolvedUrl(src);
      return;
    }

    resolveStorageUrl(src).then((url) => {
      if (active) {
        if (url) setResolvedUrl(url);
        else setFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [src]);

  if (!resolvedUrl || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#1D4435] to-[#132D23] text-[#C9A227] ${className}`}
        role="img"
        aria-label={alt}
      >
        <Coffee className="h-7 w-7 stroke-[1.6] opacity-85" />
        {fallbackLabel && (
          <span className="mt-2 px-3 text-center text-xs font-semibold text-[#F5F0E6]/85 line-clamp-1">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#1D4435] ${className}`}>
      {!loaded && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#1D4435] to-[#143025]"
          aria-hidden="true"
        />
      )}
      <img
        src={resolvedUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-all duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${disabled ? 'grayscale opacity-55' : ''}`}
      />
    </div>
  );
}

interface StorageVideoProps {
  src: string;
  poster?: string;
  title: string;
  className?: string;
}

export function StorageVideo({ src, poster, title, className = '' }: StorageVideoProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>(src);
  const [resolvedPoster, setResolvedPoster] = useState<string | undefined>(poster);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    resolveStorageUrl(src).then((url) => {
      if (active) {
        if (url) setResolvedUrl(url);
        else setFailed(true);
      }
    });

    if (poster) {
      resolveStorageUrl(poster).then((url) => {
        if (active && url) setResolvedPoster(url);
      });
    }

    return () => {
      active = false;
    };
  }, [src, poster]);

  if (failed || !resolvedUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#143025] to-[#1D4435] text-[#C9A227] ${className}`}
        aria-label={title}
      >
        <Coffee className="h-10 w-10 opacity-70" />
      </div>
    );
  }

  return (
    <video
      key={resolvedUrl}
      src={resolvedUrl}
      poster={resolvedPoster}
      aria-label={title}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
