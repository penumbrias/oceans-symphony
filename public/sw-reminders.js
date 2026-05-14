self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Reminder', body: event.data.text(), reminderInstanceId: null, inlineActions: [] };
  }

  // Tell every open client the push event fired. The Settings "Listen
  // for incoming push" diagnostic uses this to confirm the SW is being
  // woken up — independent of whether the OS actually displays the
  // notification. console.log too so Chrome DevTools shows it.
  console.log('[sw-reminders] push event received', payload?.title || '(no title)');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        try { c.postMessage({ type: 'push-received', title: payload?.title, diagId: payload?.diagId || null }); } catch {}
      }
    })
  );

  const { title, body, reminderInstanceId, inlineActions = [] } = payload;

  const notifOptions = {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Use a unique tag for diagnostic tests so they don't get collapsed
    // into a single notification by the OS. Reminder pushes still use a
    // stable tag so repeats of the same reminder replace.
    tag: payload?.diagId
      ? `diag-${payload.diagId}`
      : (reminderInstanceId ? `reminder-${reminderInstanceId}` : 'reminder'),
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
