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
    // Preserve the server-sent tag (e.g. "front-change-<userId>") so the click handler
    // can route to the right page. Fall back to reminder tag for reminder notifications.
    tag: reminderInstanceId ? `reminder-${reminderInstanceId}` : (payload.tag || 'reminder'),
    data: { reminderInstanceId, inlineActions },
    actions: inlineActions.slice(0, 2).map(a => ({ action: a.action_type, title: a.label })),
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, notifOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear the app icon badge whenever the user taps any notification.
  if (self.registration.clearBadge) {
    event.waitUntil(self.registration.clearBadge());
  }

  const { reminderInstanceId, inlineActions = [] } = event.notification.data || {};
  const tag = event.notification.tag || '';

  // Friend front-change notifications → Friends page; everything else → Reminders
  let url = tag.startsWith('front-change-') ? '/friends' : '/reminders';

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
