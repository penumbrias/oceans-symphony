self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Reminder', body: event.data.text(), reminderInstanceId: null, inlineActions: [] };
  }

  const { title, body, reminderInstanceId, inlineActions = [] } = payload;

  const notifOptions = {
    body: body || '',
    icon: '/oceans-symphony-logo.png',
    badge: '/oceans-symphony-logo.png',
    tag: reminderInstanceId ? `reminder-${reminderInstanceId}` : 'reminder',
    data: { reminderInstanceId, inlineActions },
    actions: inlineActions.slice(0, 2).map(a => ({ action: a.action_type, title: a.label })),
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, notifOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { reminderInstanceId, inlineActions = [] } = event.notification.data || {};
  let url = '/reminders';

  if (event.action && reminderInstanceId) {
    url = `/reminders?act=${reminderInstanceId}&action=${event.action}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
