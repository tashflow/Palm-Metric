import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { COPY } from '../data/i18n';
import type { Language, MenuItem, TempChoice } from '../types';
import { StorageImage } from './MediaAsset';

interface MenuItemModalProps {
  lang: Language;
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, note: string, temp?: TempChoice) => void;
}

const PRESETS_AR = ['حرارة إضافية', 'سكر أقل', 'حليب شوفان', 'ثلج خفيف'];
const PRESETS_EN = ['Extra hot', 'Less sugar', 'Oat milk', 'Light ice'];

export function MenuItemModal({
  lang,
  item,
  onClose,
  onAddToCart,
}: MenuItemModalProps) {
  const t = COPY[lang];
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [temp, setTemp] = useState<TempChoice>('hot');

  useEffect(() => {
    if (item) {
      setQuantity(1);
      setNote('');
      setTemp('hot');
    }
  }, [item]);

  if (!item) return null;

  const presets = lang === 'ar' ? PRESETS_AR : PRESETS_EN;

  const togglePreset = (preset: string) => {
    const parts = note
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = parts.some((p) => p.toLowerCase() === preset.toLowerCase());
    if (exists) {
      setNote(parts.filter((p) => p.toLowerCase() !== preset.toLowerCase()).join(', '));
    } else {
      setNote([...parts, preset].join(', '));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.inStock) return;
    onAddToCart(item, quantity, note.trim(), item.supportsTemp ? temp : undefined);
    onClose();
  };

  const primaryName =
    lang === 'ar' ? item.nameAr || item.name : item.nameEn || item.name;
  const secondaryName =
    lang === 'ar'
      ? item.nameEn || (item.nameAr ? item.name : '')
      : item.nameAr || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="palm-card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-3xl">
          <StorageImage
            src={item.imageUrl}
            alt={primaryName}
            fallbackLabel={primaryName}
            className="h-full w-full"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 end-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#132D23]/85 text-[#F5F0E6] border border-[#C9A227]/40 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#8C6E10]">{item.category}</p>
              <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-[#1A3C2F]">
                {primaryName}
              </h2>
              {secondaryName && secondaryName !== primaryName && (
                <p className="text-xs font-semibold text-[#546E61]">{secondaryName}</p>
              )}
            </div>

            <span className="shrink-0 rounded-xl bg-[#1A3C2F] px-3 py-1.5 font-en text-base font-extrabold text-[#F5F0E6] tabular-nums">
              {item.price} {t.currency}
            </span>
          </div>

          {item.description && (
            <p className="text-sm text-[#3B594B] leading-relaxed">{item.description}</p>
          )}

          {item.supportsTemp && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTemp('hot')}
                className={`flex-1 min-h-[42px] rounded-xl text-xs font-bold cursor-pointer ${
                  temp === 'hot' ? 'bg-[#1A3C2F] text-[#C9A227]' : 'bg-[#E6DEC8] text-[#3B594B]'
                }`}
              >
                {t.hotLabel}
              </button>
              <button
                type="button"
                onClick={() => setTemp('cold')}
                className={`flex-1 min-h-[42px] rounded-xl text-xs font-bold cursor-pointer ${
                  temp === 'cold' ? 'bg-[#1A3C2F] text-[#C9A227]' : 'bg-[#E6DEC8] text-[#3B594B]'
                }`}
              >
                {t.coldLabel}
              </button>
            </div>
          )}

          <div>
            <label htmlFor="modal-note" className="block text-xs font-bold text-[#3B594B]">
              {t.notesLabel}
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((preset) => {
                const selected = note
                  .toLowerCase()
                  .split(',')
                  .map((s) => s.trim())
                  .includes(preset.toLowerCase());
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => togglePreset(preset)}
                    className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer ${
                      selected
                        ? 'bg-[#1A3C2F] text-[#C9A227]'
                        : 'bg-[#E6DEC8] text-[#3B594B] hover:bg-[#DDD3B8]'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <input
              id="modal-note"
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notesPlaceholder}
              className="mt-2.5 h-11 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-[#1A3C2F]/10">
            <div className="flex items-center rounded-xl bg-[#1A3C2F] p-1 text-[#F5F0E6]">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#254E3E] cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-en text-sm font-extrabold text-[#C9A227] tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                aria-label="Increase quantity"
                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#254E3E] cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="submit"
              disabled={!item.inStock}
              className="palm-btn-gold flex-1 min-h-[48px] rounded-xl px-4 py-3 text-sm font-extrabold cursor-pointer disabled:opacity-50"
            >
              {t.addBtn} · {item.price * quantity} {t.currency}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
