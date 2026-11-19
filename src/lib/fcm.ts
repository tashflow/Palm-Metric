import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function initFCM(
  onNotificationReceived?: (payload: unknown) => void,
): Promise<string | null> {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('Firebase Messaging is not supported in this browser environment.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted.');
      return null;
    }

    const messaging = getMessaging();

    let registration: ServiceWorkerRegistration | undefined = undefined;
    if ('serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    }

    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
    });

    if (token && auth.currentUser) {
      try {
        const tokenRef = doc(db, 'fcmTokens', `${auth.currentUser.uid}_${token.slice(0, 16)}`);
        await setDoc(
          tokenRef,
          {
            uid: auth.currentUser.uid,
            token,
            updatedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
          },
          { merge: true },
        );
      } catch (err) {
        console.warn('Failed to save FCM token in Firestore:', err);
      }
    }

    onMessage(messaging, (payload) => {
      console.log('Foreground FCM message received:', payload);
      if (onNotificationReceived) {
        onNotificationReceived(payload);
      }
      const title =
        (payload as { notification?: { title?: string } }).notification?.title ||
        'Palm Metric | بالم مترك';
      const body =
        (payload as { notification?: { body?: string } }).notification?.body ||
        'Your order status has been updated.';
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    });

    return token;
  } catch (err) {
    console.warn('FCM initialization error:', err);
    return null;
  }
}
