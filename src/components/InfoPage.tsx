import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
} from 'lucide-react';
import { BUSINESS } from '../data/menu';
import { COPY } from '../data/i18n';
import type { Language, StoreSettings, UserAccount } from '../types';
import { StoreLocationMap } from './GoogleMapsLocation';

interface InfoPageProps {
  lang: Language;
  currentUser: UserAccount | null;
  storeSettings?: StoreSettings;
  onBackToMenu: () => void;
}

export function InfoPage({
  lang,
  currentUser,
  storeSettings,
  onBackToMenu,
}: InfoPageProps) {
  const t = COPY[lang];
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
  const whatsappTarget = storeSettings?.whatsappNumber?.replace(/[^\d]/g, '') || BUSINESS.whatsappNumber;

  const [reportType, setReportType] = useState<'feedback' | 'issue'>('feedback');
  const [reportTitle, setReportTitle] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setReportError(null);
    setReportSent(false);
    const cleanTitle = reportTitle.trim();
    if (!cleanTitle) {
      setReportError(lang === 'ar' ? 'يرجى كتابة عنوان الملاحظة.' : 'Please enter a subject.');
      return;
    }

    setSendingReport(true);
    const summaryLines = [
      '🌴 *Palm Metric Feedback*',
      `*Type:* ${reportType === 'feedback' ? 'Feedback' : 'Issue'}`,
      `*Subject:* ${cleanTitle}`,
      reportMessage.trim() ? `*Details:* ${reportMessage.trim()}` : '',
      currentUser?.name ? `*Customer:* ${currentUser.name}` : '',
      currentUser?.phone ? `*Phone:* ${currentUser.phone}` : '',
    ].filter(Boolean);

    const url = `https://wa.me/${whatsappTarget}?text=${encodeURIComponent(summaryLines.join('\n'))}`;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setReportTitle('');
    setReportMessage('');
    setReportSent(true);
    setSendingReport(false);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToMenu}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#234A3B] px-4 py-2 text-sm font-bold text-[#F5F0E6] hover:bg-[#2B5947] cursor-pointer"
        >
          <BackIcon className="h-4 w-4 text-[#C9A227]" />
          <span>{t.backToMenu}</span>
        </button>

        <h1 className="text-xl sm:text-2xl font-extrabold text-[#F5F0E6]">{t.infoTitle}</h1>
      </div>

      {/* Store Brand Showcase — Logo & Animated Background-Free Mascot cleanly separated */}
      <div className="relative overflow-hidden rounded-3xl border border-[#C9A227]/30 bg-gradient-to-br from-[#143025] to-[#1D4435] p-6 flex items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-16 w-16 rounded-2xl bg-[#F5F0E6] p-1 border-2 border-[#C9A227] shrink-0 shadow-[0_4px_0_#CDBE9F]">
            <img
              src={BUSINESS.logoSrc}
              alt="Palm Metric Logo"
              className="h-full w-full rounded-xl object-cover"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#F5F0E6]">
              {BUSINESS.nameAr} · <span className="font-en text-[#C9A227]">{BUSINESS.nameEn}</span>
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#F5F0E6]/80">{t.infoSubtitle}</p>
          </div>
        </div>

        <img
          src={BUSINESS.mascotSrc}
          alt="Palm Metric Mascot"
          className="hidden sm:block animate-mascot h-24 w-24 object-contain shrink-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
        />
      </div>

      {/* Map / Location Card */}
      <div className="palm-card rounded-3xl overflow-hidden">
        <StoreLocationMap lang={lang} />

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1A3C2F] text-[#C9A227]">
              <MapPin className="h-5 w-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#1A3C2F]">{t.locationCardTitle}</h2>
              <p className="mt-0.5 text-xs text-[#4A6457]">{t.locationCardDesc}</p>
            </div>
          </div>

          <a
            href={BUSINESS.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="palm-btn-gold flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold"
          >
            <MapPin className="h-4 w-4" />
            <span>{t.openGoogleMaps}</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Direct Contact */}
      <div className="palm-card rounded-3xl p-5 space-y-3">
        <h2 className="text-base font-extrabold text-[#1A3C2F]">{t.contactCardTitle}</h2>

        <a
          href={`tel:+${whatsappTarget}`}
          className="flex items-center justify-between rounded-2xl bg-[#EAE2D0] px-4 py-3.5 hover:bg-[#E1D7C0] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-[#1A3C2F]" />
            <div>
              <p className="text-xs font-bold text-[#4A6457]">{t.phoneRow}</p>
              <p className="font-en text-sm font-extrabold text-[#1A3C2F]" dir="ltr">
                +{whatsappTarget}
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-[#4A6457]" />
        </a>

        <a
          href={`https://wa.me/${whatsappTarget}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-2xl bg-[#EAE2D0] px-4 py-3.5 hover:bg-[#E1D7C0] transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-[#1E6B38]" />
            <div>
              <p className="text-xs font-bold text-[#4A6457]">{t.whatsappRow}</p>
              <p className="font-en text-sm font-extrabold text-[#1A3C2F]" dir="ltr">
                +{whatsappTarget}
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-[#4A6457]" />
        </a>

        <a
          href={`mailto:${BUSINESS.email}`}
          className="flex items-center justify-between rounded-2xl bg-[#EAE2D0] px-4 py-3.5 hover:bg-[#E1D7C0] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-[#1A3C2F]" />
            <div>
              <p className="text-xs font-bold text-[#4A6457]">{t.emailRow}</p>
              <p className="font-en text-sm font-extrabold text-[#1A3C2F]" dir="ltr">
                {BUSINESS.email}
              </p>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-[#4A6457]" />
        </a>
      </div>

      {/* Social Media */}
      <div className="palm-card rounded-3xl p-5">
        <h2 className="text-base font-extrabold text-[#1A3C2F] mb-3">{t.socialCardTitle}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a
            href={BUSINESS.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="palm-btn-forest flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          >
            <Instagram className="h-4 w-4 text-[#C9A227]" />
            <span className="font-en">Instagram</span>
          </a>

          <a
            href={BUSINESS.tiktokUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="palm-btn-forest flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          >
            <svg className="h-4 w-4 fill-[#C9A227]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
            </svg>
            <span className="font-en">TikTok</span>
          </a>

          <a
            href={BUSINESS.snapchatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="palm-btn-forest flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          >
            <svg className="h-4 w-4 fill-[#C9A227]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12.01 2c-2.73 0-4.96 1.77-5.17 5.01l-.06 1.24c-.52-.17-1.08-.12-1.45.22-.34.3-.43.82-.19 1.24.28.5.94.77 1.54.94-.22 1.44-1.26 2.88-2.92 3.51-.44.17-.68.62-.55 1.07.11.4.49.68.92.72.81.08 1.49.35 1.98.68-.18.58-.02 1.15.42 1.54.5.44 1.21.48 1.89.3.93-.24 1.79.42 2.49.94.55.41 1.16.86 1.98.86.82 0 1.43-.45 1.98-.86.7-.52 1.56-1.18 2.49-.94.68.18 1.39.14 1.89-.3.44-.39.6-.96.42-1.54.49-.33 1.17-.6 1.98-.68.43-.04.81-.32.92-.72.13-.45-.11-.9-.55-1.07-1.66-.63-2.7-2.07-2.92-3.51.6-.17 1.26-.44 1.54-.94.24-.42.15-.94-.19-1.24-.37-.34-.93-.39-1.45-.22l-.06-1.24C16.97 3.77 14.74 2 12.01 2z" />
            </svg>
            <span className="font-en">Snapchat</span>
          </a>
        </div>
      </div>
      {/* Customer Report / Feedback sent to Palm Metric Admin */}
      <div className="palm-card rounded-3xl p-5">
        <h2 className="text-base font-extrabold text-[#1A3C2F]">{t.reportCardTitle}</h2>

        <form onSubmit={handleReportSubmit} className="mt-4 space-y-3.5">
          <div>
            <span className="block text-xs font-bold text-[#3B594B] mb-1.5">
              {t.reportTypeLabel}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReportType('feedback')}
                className={`min-h-[42px] rounded-xl px-3 py-2 text-xs font-extrabold cursor-pointer transition-colors ${
                  reportType === 'feedback'
                    ? 'bg-[#1A3C2F] text-[#C9A227]'
                    : 'bg-[#E6DEC8] text-[#3B594B] hover:bg-[#DDD3B8]'
                }`}
              >
                {t.reportTypeFeedback}
              </button>
              <button
                type="button"
                onClick={() => setReportType('issue')}
                className={`min-h-[42px] rounded-xl px-3 py-2 text-xs font-extrabold cursor-pointer transition-colors ${
                  reportType === 'issue'
                    ? 'bg-[#1A3C2F] text-[#C9A227]'
                    : 'bg-[#E6DEC8] text-[#3B594B] hover:bg-[#DDD3B8]'
                }`}
              >
                {t.reportTypeIssue}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="report-title" className="block text-xs font-bold text-[#3B594B]">
              {t.reportTitleLabel}
            </label>
            <input
              id="report-title"
              type="text"
              maxLength={160}
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder={t.reportTitlePlaceholder}
              className="mt-1.5 h-11 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="report-message" className="block text-xs font-bold text-[#3B594B]">
              {t.reportMessageLabel}
            </label>
            <textarea
              id="report-message"
              rows={3}
              maxLength={1000}
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              placeholder={t.reportMessagePlaceholder}
              className="mt-1.5 w-full rounded-xl border border-[#1A3C2F]/20 bg-white p-3 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
            />
          </div>

          {reportError && (
            <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2 text-xs font-bold text-[#912018]">
              {reportError}
            </p>
          )}

          {reportSent && (
            <div className="flex items-center gap-2 rounded-xl bg-[#DCE8DE] px-3.5 py-2.5 text-xs font-bold text-[#1E6B38]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t.reportSentMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={sendingReport}
            className="palm-btn-gold flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold cursor-pointer disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            <span>{sendingReport ? t.reportSendingBtn : t.reportSubmitBtn}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
