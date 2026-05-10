// Custom service worker
//
// Web Push KULLANILMIYOR — bu uygulama saf yerel ağ tasarımı.
// Bildirimler doğrudan Notification API ile (push subscription yok, VAPID yok).
//
// Bu SW dosyasında sadece notificationclick handler var:
// kullanıcı bildirime tıklayınca uygulamaya odaklan, ilgili URL'e yönlendir.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
