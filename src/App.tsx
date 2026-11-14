import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { BellOff, BellRing, Check } from 'lucide-react';
import { AccountPage } from './components/AccountPage';
import { CheckoutPage } from './components/CheckoutPage';
import { FloatingCartBar } from './components/FloatingCartBar';
import { MapsApiWrapper } from './components/GoogleMapsLocation';
import { Header } from './components/Header';
import { InfoPage } from './components/InfoPage';
import { MenuItemModal } from './components/MenuItemModal';
import { MenuPage } from './components/MenuPage';
import { OrderTrackerPage } from './components/OrderTrackerPage';
import { COPY } from './data/i18n';
import { activeProjectId, auth, signInAsGuest, signInWithGoogle } from './lib/firebase';
import {
  seedPalmMetricMenuForAdmin,
  subscribeBillboards,
  subscribeMenu,
  subscribeOrder,
  subscribeStoreSettings,
} from './lib/firestoreSync';
import {
  startOrderReadyAlarm,
  stopOrderReadyAlarm,
  unlockOrderAlarmAudio,
} from './lib/readyAlarm';
import type {
  Billboard,
  CartItem,
  GeoLocation,
  Language,
  MenuItem,
  Order,
  PageView,
  StoreSettings,
  TempChoice,
  TrackedOrderMeta,
  UserAccount,
} from './types';

const CART_KEY = 'palm_metric_cart_v2';
const ACCOUNTS_KEY = 'palm_metric_accounts_v1';
const SESSION_KEY = 'palm_metric_session_v1';
const LANG_KEY = 'palm_metric_lang_v1';
const ORDERS_KEY = 'palm_metric_orders_v1';
const ADMIN_EMAILS = new Set([
  'tashflow26@gmail.com',
  'palmmatric1@gmail.com',
  'tashfilartwork@gmail.com',
]);

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  const [pendingReturnOrderId] = useState<string | null>(() => {
    try {
      const id = sessionStorage.getItem('palm_metric_return_track');
      if (id) {
        sessionStorage.removeItem('palm_metric_return_track');
        return id;
      }
    } catch {
      // ignore storage failures
    }
    return null;
  });

  const [view, setView] = useState<PageView>(() => (pendingReturnOrderId ? 'track' : 'menu'));

  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [billboardsLoading, setBillboardsLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({ storeOpen: true });

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [currentFirebaseUser, setCurrentFirebaseUser] = useState<User | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  const [accounts, setAccounts] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem(ACCOUNTS_KEY);
      return saved ? (JSON.parse(saved) as UserAccount[]) : [];
    } catch {
      return [];
    }
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });

  const [trackedOrders, setTrackedOrders] = useState<TrackedOrderMeta[]>(() => {
    try {
      const saved = localStorage.getItem(ORDERS_KEY);
      return saved ? (JSON.parse(saved) as TrackedOrderMeta[]) : [];
    } catch {
      return [];
    }
  });

  const [activeOrderId, setActiveOrderId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(ORDERS_KEY);
      const parsed = saved ? (JSON.parse(saved) as TrackedOrderMeta[]) : [];
      return parsed[0]?.id ?? null;
    } catch {
      return null;
    }
  });
  const [activeLiveOrder, setActiveLiveOrder] = useState<Order | null>(null);
  const [stoppedAlarmOrderIds, setStoppedAlarmOrderIds] = useState<string[]>([]);
  const [justPlacedOrderId, setJustPlacedOrderId] = useState<string | null>(
    () => pendingReturnOrderId,
  );

  const currentUser = useMemo(
    () => accounts.find((acc) => acc.id === currentUserId) ?? null,
    [accounts, currentUserId],
  );

  const guestAuthAttemptedRef = useRef(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentFirebaseUser(user);
      if (!user && !guestAuthAttemptedRef.current) {
        guestAuthAttemptedRef.current = true;
        void signInAsGuest();
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    const handleUnlock = () => {
      void unlockOrderAlarmAudio();
    };
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      stopOrderReadyAlarm();
    };
  }, []);

  useEffect(() => {
    if (!activeOrderId || !currentFirebaseUser || activeOrderId.startsWith('wa-')) {
      setActiveLiveOrder(null);
      return;
    }
    const unsub = subscribeOrder(
      activeOrderId,
      (liveOrder) => {
        setActiveLiveOrder(liveOrder);
      },
      () => {
        // tracker handles lookup error display
      },
    );
    return () => unsub();
  }, [activeOrderId, currentFirebaseUser]);

  const isAlarmRinging = Boolean(
    activeLiveOrder &&
      activeLiveOrder.status === 'Ready' &&
      !stoppedAlarmOrderIds.includes(activeLiveOrder.id),
  );

  useEffect(() => {
    if (isAlarmRinging) {
      startOrderReadyAlarm();
    } else {
      stopOrderReadyAlarm();
    }
  }, [isAlarmRinging]);

  const handleStopAlarm = () => {
    stopOrderReadyAlarm();
    if (activeLiveOrder?.id) {
      setStoppedAlarmOrderIds((prev) =>
        prev.includes(activeLiveOrder.id) ? prev : [...prev, activeLiveOrder.id],
      );
    }
  };

  useEffect(() => {
    const unsubBillboards = subscribeBillboards(
      (data) => {
        setBillboards(data);
        setBillboardsLoading(false);
      },
      () => {
        setBillboardsLoading(false);
      },
    );

    const unsubMenu = subscribeMenu(
      (data) => {
        setMenuItems(data);
        setMenuLoading(false);
        setMenuError(null);
      },
      (err) => {
        const isPermDenied = err.message.includes('Missing or insufficient permissions');
        if (isPermDenied) {
          setMenuError(
            lang === 'ar'
              ? `صلاحيات Firestore في مشروع ${activeProjectId} تمنع قراءة القائمة والعروض حالياً. يرجى السماح بالقراءة لمجموعتي menu و billboards من لوحة Firebase.`
              : `Firestore permissions in project ${activeProjectId} currently block reading menu and billboards. Publish read access for menu and billboards in Firebase Console Rules.`,
          );
        } else {
          setMenuError(err.message);
        }
        setMenuLoading(false);
      },
    );

    const unsubSettings = subscribeStoreSettings((nextSettings) => {
      setStoreSettings(nextSettings);
    });

    return () => {
      unsubBillboards();
      unsubMenu();
      unsubSettings();
    };
  }, [currentFirebaseUser?.uid, lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore storage failures
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage failures
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {
      // ignore storage failures
    }
  }, [accounts]);

  useEffect(() => {
    try {
      if (currentUserId) localStorage.setItem(SESSION_KEY, currentUserId);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore storage failures
    }
  }, [currentUserId]);

  useEffect(() => {
    try {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(trackedOrders));
    } catch {
      // ignore storage failures
    }
  }, [trackedOrders]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const navigate = (nextView: PageView) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addToCart = (
    item: MenuItem,
    quantity: number,
    note: string,
    temp?: TempChoice,
  ) => {
    if (!item.inStock) return;
    const cleanNote = note.trim();
    const baseKey = temp ? `${item.id}::${temp}` : item.id;
    const cartKey = `${baseKey}::${cleanNote.toLowerCase()}`;

    setCart((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey);
      if (existing) {
        return prev.map((c) =>
          c.cartKey === cartKey
            ? { ...c, quantity: Math.min(99, c.quantity + quantity) }
            : c,
        );
      }
      return [
        ...prev,
        {
          cartKey,
          itemId: item.id,
          name: item.name,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          price: item.price,
          imageUrl: item.imageUrl,
          quantity,
          note: cleanNote,
          temp,
        },
      ];
    });

    const label = lang === 'ar' ? item.nameAr || item.name : item.nameEn || item.name;
    setToastMessage(`${quantity}x ${label}`);
  };

  const handleUpdateQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.cartKey === cartKey ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  };

  const handleUpdateNote = (cartKey: string, note: string) => {
    setCart((prev) => prev.map((c) => (c.cartKey === cartKey ? { ...c, note } : c)));
  };

  const handleOrderPlaced = (
    orderId: string,
    orderNumber: string,
    whatsappUrl: string,
    receiptOrder: Order,
  ) => {
    setTrackedOrders((prev) => {
      const filtered = prev.filter((o) => o.id !== orderId);
      return [{ id: orderId, orderNumber, whatsappUrl, receiptSnapshot: receiptOrder }, ...filtered].slice(0, 10);
    });
    try {
      sessionStorage.setItem('palm_metric_return_track', orderId);
    } catch {
      // ignore storage failures
    }
    setActiveOrderId(orderId);
    setJustPlacedOrderId(orderId);
    navigate('track');
  };

  const handleGoogleSignIn = async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const user = await signInWithGoogle();
      return user;
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      console.warn('Google sign-in skipped:', code || err);

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return null;
      }
      if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
        setAuthError(
          lang === 'ar'
            ? `تسجيل الدخول عبر Google غير مفعّل في مشروع ${activeProjectId}. فعّل Authentication → Google في لوحة تحكم Firebase.`
            : `Google Sign-In is not enabled in ${activeProjectId} yet. Enable Authentication → Google in Firebase Console.`,
        );
        return null;
      }
      if (code === 'auth/unauthorized-domain') {
        setAuthError(
          lang === 'ar'
            ? `النطاق (${window.location.hostname}) غير مضاف في Authorized domains داخل Firebase Authentication لمشروع ${activeProjectId}.`
            : `Domain (${window.location.hostname}) is not listed under Firebase Authentication → Settings → Authorized domains in ${activeProjectId}.`,
        );
        return null;
      }
      setAuthError(
        lang === 'ar'
          ? 'تعذر إتمام تسجيل الدخول عبر Google.'
          : 'Could not complete Google Sign-In.',
      );
      return null;
    }
  };

  const handleSeedCatalog = async () => {
    setSeeding(true);
    setMenuError(null);
    try {
      await seedPalmMetricMenuForAdmin();
      setToastMessage('Palm Metric menu published to Firestore');
    } catch (err) {
      console.error('Failed to seed Palm Metric menu:', err);
      setMenuError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : lang === 'ar'
            ? 'تعذر نشر القائمة في Firestore. يرجى المحاولة مرة أخرى.'
            : 'Could not publish menu to Firestore. Please try again.',
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleLogin = (phone: string, password: string): string | null => {
    const t = COPY[lang];
    const cleanPhone = phone.trim();
    const cleanPass = password.trim();
    if (!cleanPhone || !cleanPass) return t.errPhonePasswordRequired;

    const match = accounts.find(
      (a) =>
        a.phone.replace(/\s+/g, '') === cleanPhone.replace(/\s+/g, '') &&
        a.password === cleanPass,
    );
    if (!match) return t.errInvalidCredentials;

    setCurrentUserId(match.id);
    navigate('menu');
    return null;
  };

  const handleRegister = (input: {
    name: string;
    phone: string;
    password: string;
    address: string;
    location?: GeoLocation;
  }): string | null => {
    const t = COPY[lang];
    const name = input.name.trim();
    const phone = input.phone.trim();
    const password = input.password.trim();
    const address = input.address.trim();

    if (!name || !phone || !password || !address) {
      return t.errAllFieldsRequired;
    }

    const exists = accounts.some(
      (a) => a.phone.replace(/\s+/g, '') === phone.replace(/\s+/g, ''),
    );
    if (exists) return t.errPhoneExists;

    const newAccount: UserAccount = {
      id: `pm_${Date.now()}`,
      name,
      phone,
      password,
      address,
      location: input.location,
    };

    setAccounts((prev) => [...prev, newAccount]);
    setCurrentUserId(newAccount.id);
    navigate('menu');
    return null;
  };

  const handleUpdateUserLocation = (loc: GeoLocation) => {
    if (!currentUserId) return;
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === currentUserId ? { ...acc, location: loc } : acc)),
    );
  };

  const handleLogout = () => {
    setCurrentUserId(null);
  };

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const canSeedCatalog = Boolean(
    currentFirebaseUser?.emailVerified &&
      currentFirebaseUser.email &&
      ADMIN_EMAILS.has(currentFirebaseUser.email.toLowerCase()),
  );

  const t = COPY[lang];

  return (
    <MapsApiWrapper lang={lang}>
      <div className="min-h-screen w-full overflow-x-clip flex flex-col bg-[#1A3C2F] text-[#F5F0E6]">
        {mapsQuotaExceeded && (
          <div
            role="alert"
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
          >
            Map quota exceeded.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline hover:text-amber-950"
            >
              Click here to see instructions on the maps developer site
            </a>{' '}
            to increase your quota.
          </div>
        )}

        <Header
          lang={lang}
          onToggleLang={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
          activeView={view}
          onNavigate={navigate}
          currentUser={currentUser}
          hasActiveOrder={Boolean(activeOrderId)}
        />

        {isAlarmRinging && view !== 'track' && activeLiveOrder && (
          <div
            role="alert"
            className="bg-[#C9A227] text-[#142A20] px-4 py-2.5 shadow-md"
          >
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('track')}
                className="flex items-center gap-2 text-xs sm:text-sm font-extrabold cursor-pointer"
              >
                <BellRing className="h-4 w-4 animate-bounce" />
                <span>
                  {activeLiveOrder.orderType === 'pickup'
                    ? lang === 'ar'
                      ? `طلبك (${activeLiveOrder.orderNumber}) جاهز للاستلام الآن!`
                      : `Order ${activeLiveOrder.orderNumber} is ready for pickup!`
                    : lang === 'ar'
                      ? `طلبك (${activeLiveOrder.orderNumber}) جاهز للتوصيل!`
                      : `Order ${activeLiveOrder.orderNumber} is ready for delivery!`}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('track')}
                  className="rounded-lg bg-[#1A3C2F] px-3 py-1.5 text-xs font-extrabold text-[#F5F0E6] cursor-pointer"
                >
                  {lang === 'ar' ? 'تتبع الطلب' : 'Track Order'}
                </button>
                <button
                  type="button"
                  onClick={handleStopAlarm}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#142A20] px-3 py-1.5 text-xs font-extrabold text-[#C9A227] cursor-pointer"
                >
                  <BellOff className="h-3.5 w-3.5" />
                  <span>{lang === 'ar' ? 'إيقاف التنبيه' : 'Stop Alarm'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      <main className="flex-1">
        {view === 'menu' && (
          <MenuPage
            lang={lang}
            billboards={billboards}
            billboardsLoading={billboardsLoading}
            items={menuItems}
            menuLoading={menuLoading}
            menuError={menuError}
            authError={authError}
            onDismissAuthError={() => setAuthError(null)}
            cart={cart}
            storeSettings={storeSettings}
            onQuickAdd={(item, temp) => addToCart(item, 1, '', temp)}
            onUpdateQty={handleUpdateQty}
            onSelectItem={setSelectedItem}
            onOpenInfo={() => navigate('info')}
            canSeedCatalog={canSeedCatalog}
            seeding={seeding}
            onSeedCatalog={handleSeedCatalog}
            onSignInAdmin={handleGoogleSignIn}
            isSignedIn={Boolean(currentFirebaseUser)}
          />
        )}

        {view === 'checkout' && (
          <CheckoutPage
            lang={lang}
            cart={cart}
            currentUser={currentUser}
            firebaseUser={currentFirebaseUser}
            authError={authError}
            storeSettings={storeSettings}
            onUpdateQty={handleUpdateQty}
            onUpdateNote={handleUpdateNote}
            onClearCart={() => setCart([])}
            onBackToMenu={() => navigate('menu')}
            onOpenAccount={() => navigate('account')}
            onUpdateSavedLocation={handleUpdateUserLocation}
            onOrderPlaced={handleOrderPlaced}
          />
        )}

        {view === 'track' && (
          <OrderTrackerPage
            lang={lang}
            firebaseUser={currentFirebaseUser}
            authError={authError}
            onSignInGoogle={handleGoogleSignIn}
            recentOrders={trackedOrders}
            activeOrderId={activeOrderId}
            activeLiveOrder={activeLiveOrder}
            isAlarmRinging={isAlarmRinging}
            alarmStoppedForOrder={Boolean(
              activeLiveOrder && stoppedAlarmOrderIds.includes(activeLiveOrder.id),
            )}
            onStopAlarm={handleStopAlarm}
            justPlacedOrderId={justPlacedOrderId}
            onSelectOrderId={(id) => {
              setActiveOrderId(id);
              setTrackedOrders((prev) => {
                if (prev.some((o) => o.id === id)) return prev;
                return [{ id, orderNumber: id.slice(0, 8).toUpperCase() }, ...prev].slice(0, 10);
              });
            }}
            onBackToMenu={() => navigate('menu')}
          />
        )}

        {view === 'account' && (
          <AccountPage
            lang={lang}
            currentUser={currentUser}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onUpdateLocation={handleUpdateUserLocation}
            onLogout={handleLogout}
            onBackToMenu={() => navigate('menu')}
          />
        )}

        {view === 'info' && (
          <InfoPage
            lang={lang}
            currentUser={currentUser}
            storeSettings={storeSettings}
            onBackToMenu={() => navigate('menu')}
          />
        )}
      </main>

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-2xl bg-[#132D23] border border-[#C9A227]/45 px-4 py-2.5 text-xs sm:text-sm font-bold text-[#F5F0E6] shadow-xl"
        >
          <Check className="h-4 w-4 text-[#C9A227]" />
          <span className="whitespace-nowrap">{toastMessage}</span>
        </div>
      )}

      <MenuItemModal
        lang={lang}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAddToCart={addToCart}
      />

      {view === 'menu' && (
        <FloatingCartBar
          lang={lang}
          itemCount={cartCount}
          total={cartTotal}
          onOpenCheckout={() => navigate('checkout')}
        />
      )}

      <footer className="border-t border-[#C9A227]/20 bg-[#132D23] py-5 px-4 text-center text-xs text-[#F5F0E6]/70">
        {t.footerNote}
      </footer>
      </div>
    </MapsApiWrapper>
  );
}
