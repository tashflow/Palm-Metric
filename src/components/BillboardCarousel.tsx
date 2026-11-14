import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Billboard, Language } from '../types';
import { StorageImage, StorageVideo } from './MediaAsset';

interface BillboardCarouselProps {
  lang: Language;
  billboards: Billboard[];
  loading: boolean;
  onSelectCategory?: (category: string) => void;
}

export function BillboardCarousel({
  lang,
  billboards,
  loading,
  onSelectCategory,
}: BillboardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const pointerStartX = useRef<number | null>(null);

  useEffect(() => {
    if (activeIndex >= billboards.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, billboards.length]);

  useEffect(() => {
    if (billboards.length <= 1 || isPaused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % billboards.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [billboards.length, isPaused]);

  if (loading && billboards.length === 0) {
    return (
      <div className="h-[220px] sm:h-[320px] lg:h-[380px] w-full rounded-3xl bg-[#132D23] border border-[#C9A227]/20 animate-pulse" />
    );
  }

  if (billboards.length === 0) {
    return null;
  }

  const goTo = (nextIdx: number) => {
    const count = billboards.length;
    setActiveIndex(((nextIdx % count) + count) % count);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = e.clientX;
    setIsPaused(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current !== null) {
      const delta = e.clientX - pointerStartX.current;
      if (Math.abs(delta) > 40 && billboards.length > 1) {
        const swipeNext = lang === 'ar' ? delta > 0 : delta < 0;
        if (swipeNext) goTo(activeIndex + 1);
        else goTo(activeIndex - 1);
      }
    }
    pointerStartX.current = null;
    setIsPaused(false);
  };

  return (
    <section
      aria-label="Promotional billboards"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="relative h-[220px] sm:h-[330px] lg:h-[390px] w-full overflow-hidden rounded-3xl border border-[#C9A227]/35 bg-[#132D23] shadow-[0_20px_44px_-12px_rgba(4,14,10,0.68)] select-none touch-pan-y"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerStartX.current = null;
          setIsPaused(false);
        }}
      >
        <div
          dir="ltr"
          className="flex h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {billboards.map((slide) => {
            const slideTitle =
              lang === 'ar'
                ? slide.titleAr || slide.title
                : slide.titleEn || slide.title;
            const slideSubtitle =
              lang === 'ar'
                ? slide.subtitleAr || slide.subtitle
                : slide.subtitleEn || slide.subtitle;

            return (
              <div
                key={slide.id}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="relative h-full w-full shrink-0"
              >
                {slide.mediaUrl ? (
                  slide.mediaType === 'video' ? (
                    <StorageVideo
                      src={slide.mediaUrl}
                      poster={slide.posterUrl}
                      title={slideTitle}
                      className="h-full w-full"
                    />
                  ) : (
                    <StorageImage
                      src={slide.mediaUrl}
                      alt={slideTitle}
                      className="h-full w-full"
                      fallbackLabel={slideTitle}
                    />
                  )
                ) : (
                  <div
                    className="h-full w-full bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.28),rgba(19,45,35,0.96)_62%)]"
                    aria-hidden="true"
                  />
                )}

                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D2119]/90 via-[#0D2119]/35 to-transparent"
                  aria-hidden="true"
                />

                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div className="max-w-2xl">
                    {(slide.badge || slide.isOffer) && (
                      <span className="inline-block mb-2 rounded-lg bg-[#C9A227] px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-[#142A20]">
                        {slide.badge || (lang === 'ar' ? 'عرض خاص' : 'Special Offer')}
                      </span>
                    )}
                    <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#F5F0E6] [text-wrap:balance]">
                      {slideTitle}
                    </h2>
                    {slideSubtitle && (
                      <p className="mt-1.5 text-xs sm:text-base text-[#F5F0E6]/85 line-clamp-2 max-w-xl">
                        {slideSubtitle}
                      </p>
                    )}
                  </div>

                  {(slide.category || slide.ctaLabel) && onSelectCategory && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCategory(slide.category || 'All');
                      }}
                      className="palm-btn-gold self-start sm:self-end inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>{slide.ctaLabel || slide.category}</span>
                      <ArrowRight className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {billboards.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goTo(activeIndex - 1);
              }}
              aria-label="Previous promotional slide"
              className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-[#132D23]/75 text-[#F5F0E6] border border-[#C9A227]/40 backdrop-blur-sm hover:bg-[#132D23] cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goTo(activeIndex + 1);
              }}
              aria-label="Next promotional slide"
              className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-[#132D23]/75 text-[#F5F0E6] border border-[#C9A227]/40 backdrop-blur-sm hover:bg-[#132D23] cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="absolute top-4 right-4 sm:top-5 sm:right-6 flex items-center gap-1.5">
              {billboards.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(idx);
                  }}
                  aria-label={`Slide ${idx + 1}: ${s.title}`}
                  className="p-1.5 cursor-pointer"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-200 ${
                      idx === activeIndex ? 'w-6 bg-[#C9A227]' : 'w-2 bg-[#F5F0E6]/45 hover:bg-[#F5F0E6]/80'
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
