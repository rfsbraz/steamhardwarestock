'use strict';

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if (targetUrl && targetUrl !== '/' && 'navigate' in client) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }

    if ('openWindow' in self.clients) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
