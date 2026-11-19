importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBmmyvlE3GKl8PVc1LHNBZOsl_MkqCWPlo',
  projectId: 'palm-metric-app',
  messagingSenderId: '522581928710',
  appId: '1:522581928710:web:993ecee99d938707fc8c87',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Palm Metric | بالم مترك';
  const options = {
    body: payload.notification?.body || 'Your order status has been updated.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    dir: 'auto',
  };
  self.registration.showNotification(title, options);
});
