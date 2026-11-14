import { Clock, Globe, MapPin, User } from 'lucide-react';
import { BUSINESS } from '../data/menu';
import { COPY } from '../data/i18n';
import type { Language, PageView, UserAccount } from '../types';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
  activeView: PageView;
  onNavigate: (view: PageView) => void;
  currentUser: UserAccount | null;
  hasActiveOrder: boolean;
}

export function Header({
  lang,
  onToggleLang,
  activeView,
  onNavigate,
  currentUser,
  hasActiveOrder,
}: HeaderProps) {
  const t = COPY[lang];

  return (
    <header className="sticky top-0 z-30 h-16 w-full overflow-x-clip bg-[#132D23]/92 backdrop-blur-md border-b border-[#C9A227]/30">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-2 sm:gap-6 px-3 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('menu')}
          className="flex min-w-0 items-center gap-2 sm:gap-2.5 cursor-pointer group"
        >
          <div className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 rounded-2xl bg-[#F5F0E6] p-1 border border-[#C9A227]/60 shadow-[0_3px_0_#CDBE9F] transition-transform duration-150 group-hover:-translate-y-0.5">
            <img
              src={BUSINESS.logoSrc}
              alt="Palm Metric Logo"
              className="h-full w-full rounded-xl object-cover"
            />
          </div>
          <div className="min-w-0 text-start">
            <span className="block truncate text-sm sm:text-lg font-extrabold tracking-tight text-[#F5F0E6] leading-none">
              {lang === 'ar' ? BUSINESS.nameAr : BUSINESS.nameEn}
            </span>
            <span className="mt-1 block truncate text-[10px] font-bold tracking-wider text-[#C9A227] leading-none">
              {lang === 'ar' ? BUSINESS.nameEn : BUSINESS.nameAr}
            </span>
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold">
          <button
            type="button"
            onClick={() => onNavigate('menu')}
            className={`relative py-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeView === 'menu' ? 'text-[#C9A227]' : 'text-[#F5F0E6]/80 hover:text-[#F5F0E6]'
            }`}
          >
            {t.navMenu}
            {activeView === 'menu' && (
              <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-[#C9A227]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('track')}
            className={`relative py-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeView === 'track' ? 'text-[#C9A227]' : 'text-[#F5F0E6]/80 hover:text-[#F5F0E6]'
            }`}
          >
            <span>{t.navTrack}</span>
            {hasActiveOrder && activeView !== 'track' && (
              <span className="ms-1.5 text-xs font-extrabold text-[#C9A227]">•</span>
            )}
            {activeView === 'track' && (
              <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-[#C9A227]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('info')}
            className={`relative py-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeView === 'info' ? 'text-[#C9A227]' : 'text-[#F5F0E6]/80 hover:text-[#F5F0E6]'
            }`}
          >
            {t.navInfo}
            {activeView === 'info' && (
              <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-[#C9A227]" />
            )}
          </button>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('track')}
            aria-label={t.navTrack}
            className={`md:hidden flex h-9 w-9 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
              activeView === 'track'
                ? 'border-[#C9A227] bg-[#C9A227]/20 text-[#C9A227]'
                : 'border-[#F5F0E6]/20 bg-[#1A3C2F] text-[#F5F0E6]'
            }`}
          >
            <Clock className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('info')}
            aria-label={t.navInfo}
            className={`md:hidden flex h-9 w-9 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
              activeView === 'info'
                ? 'border-[#C9A227] bg-[#C9A227]/20 text-[#C9A227]'
                : 'border-[#F5F0E6]/20 bg-[#1A3C2F] text-[#F5F0E6]'
            }`}
          >
            <MapPin className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex min-h-[36px] sm:min-h-[40px] items-center gap-1 rounded-xl border border-[#C9A227]/45 bg-[#1A3C2F] px-2 sm:px-3 py-1.5 text-xs font-bold text-[#F5F0E6] hover:border-[#C9A227] hover:text-[#C9A227] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Globe className="h-3.5 w-3.5 text-[#C9A227]" />
            <span>{t.langSwitch}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('account')}
            className={`inline-flex min-h-[36px] sm:min-h-[40px] items-center gap-1 sm:gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              currentUser
                ? 'bg-[#F5F0E6] text-[#1A3C2F] shadow-[0_3px_0_#CDBE9F]'
                : 'palm-btn-gold'
            }`}
          >
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[72px] truncate">
              {currentUser ? currentUser.name.split(' ')[0] : t.navLogin}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
