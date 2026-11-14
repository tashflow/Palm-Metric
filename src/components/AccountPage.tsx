import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  MapPin,
  User,
} from 'lucide-react';
import { COPY } from '../data/i18n';
import type { GeoLocation, Language, UserAccount } from '../types';
import { DeliveryMapPicker } from './GoogleMapsLocation';

interface AccountPageProps {
  lang: Language;
  currentUser: UserAccount | null;
  onLogin: (phone: string, password: string) => string | null;
  onRegister: (input: {
    name: string;
    phone: string;
    password: string;
    address: string;
    location?: GeoLocation;
  }) => string | null;
  onUpdateLocation: (loc: GeoLocation) => void;
  onLogout: () => void;
  onBackToMenu: () => void;
}

export function AccountPage({
  lang,
  currentUser,
  onLogin,
  onRegister,
  onUpdateLocation,
  onLogout,
  onBackToMenu,
}: AccountPageProps) {
  const t = COPY[lang];
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regLocation, setRegLocation] = useState<GeoLocation | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const err = onLogin(loginPhone, loginPassword);
    if (err) setFormError(err);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const err = onRegister({
      name: regName,
      phone: regPhone,
      password: regPassword,
      address: regAddress,
      location: regLocation,
    });
    if (err) setFormError(err);
  };

  return (
    <div className="mx-auto max-w-xl px-4 pt-6 pb-20 sm:px-6">
      <button
        type="button"
        onClick={onBackToMenu}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#234A3B] px-4 py-2 text-sm font-bold text-[#F5F0E6] hover:bg-[#2B5947] cursor-pointer"
      >
        <BackIcon className="h-4 w-4 text-[#C9A227]" />
        <span>{t.backToMenu}</span>
      </button>

      {currentUser ? (
        <div className="palm-card mt-6 rounded-3xl p-6 space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1A3C2F] text-[#C9A227]">
              <User className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#8C6E10]">{t.accountWelcome}</p>
              <h1 className="text-2xl font-extrabold text-[#1A3C2F]">{currentUser.name}</h1>
            </div>
          </div>

          <div className="rounded-2xl bg-[#EAE2D0] p-4 space-y-2.5 text-sm text-[#1A3C2F]">
            <h2 className="text-xs font-extrabold text-[#4A6457]">{t.savedProfileHeading}</h2>
            <p>
              <span className="font-bold">{t.phoneLabel}:</span>{' '}
              <span className="font-en" dir="ltr">
                {currentUser.phone}
              </span>
            </p>
            <p>
              <span className="font-bold">{t.deliveryLocationLabel}:</span> {currentUser.address}
            </p>
            {currentUser.location ? (
              <a
                href={`https://maps.google.com/?q=${currentUser.location.lat},${currentUser.location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E6B38] underline"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>
                  {t.locationCaptured} ({currentUser.location.lat}, {currentUser.location.lng})
                </span>
              </a>
            ) : (
              <p className="text-xs font-medium text-[#546E61]">{t.noMapSaved}</p>
            )}
          </div>

          <DeliveryMapPicker
            lang={lang}
            location={currentUser.location}
            onLocationChange={(loc) => onUpdateLocation(loc)}
            heightClass="h-[220px]"
          />

          <button
            type="button"
            onClick={onLogout}
            className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl border-2 border-[#B42318]/30 bg-[#FEE4E2] px-4 py-2.5 text-sm font-extrabold text-[#912018] hover:bg-[#FECDCA] cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>{t.logoutBtn}</span>
          </button>
        </div>
      ) : (
        <div className="palm-card mt-6 rounded-3xl p-6">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#E6DEC8] p-1.5">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setFormError(null);
              }}
              className={`min-h-[44px] rounded-xl text-sm font-extrabold cursor-pointer transition-colors ${
                tab === 'login' ? 'bg-[#1A3C2F] text-[#F5F0E6]' : 'text-[#3B594B]'
              }`}
            >
              {t.loginTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setFormError(null);
              }}
              className={`min-h-[44px] rounded-xl text-sm font-extrabold cursor-pointer transition-colors ${
                tab === 'register' ? 'bg-[#1A3C2F] text-[#F5F0E6]' : 'text-[#3B594B]'
              }`}
            >
              {t.registerTab}
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="login-phone" className="block text-xs font-bold text-[#3B594B]">
                  {t.phoneLabel}
                </label>
                <input
                  id="login-phone"
                  type="tel"
                  dir="ltr"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="login-pass" className="block text-xs font-bold text-[#3B594B]">
                  {t.passwordLabel}
                </label>
                <input
                  id="login-pass"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                />
              </div>

              {formError && (
                <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className="palm-btn-gold w-full min-h-[48px] rounded-xl px-4 py-3 text-sm font-extrabold cursor-pointer"
              >
                {t.loginSubmit}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-bold text-[#3B594B]">
                  {t.nameLabel}
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-phone" className="block text-xs font-bold text-[#3B594B]">
                  {t.phoneLabel}
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  dir="ltr"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-pass" className="block text-xs font-bold text-[#3B594B]">
                  {t.passwordLabel}
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-address" className="block text-xs font-bold text-[#3B594B]">
                  {t.deliveryLocationLabel}
                </label>
                <input
                  id="reg-address"
                  type="text"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  placeholder={t.deliveryLocationPlaceholder}
                  className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                />
              </div>

              <DeliveryMapPicker
                lang={lang}
                location={regLocation}
                onLocationChange={(loc, suggestedAddress) => {
                  setRegLocation(loc);
                  if (suggestedAddress && !regAddress.trim()) {
                    setRegAddress(suggestedAddress);
                  }
                }}
                heightClass="h-[210px]"
              />

              {formError && (
                <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className="palm-btn-gold w-full min-h-[48px] rounded-xl px-4 py-3 text-sm font-extrabold cursor-pointer"
              >
                {t.registerSubmit}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
