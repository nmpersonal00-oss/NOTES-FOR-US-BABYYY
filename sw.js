/* Petal Notes: background push notifications without a calendar or an open tab. */
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { message = {body:event.data?.text() || ''}; }
  const title = String(message.title || 'Petal Notes').slice(0, 100);
  const body = String(message.body || 'You have a reminder.').slice(0, 500);
  event.waitUntil(self.registration.showNotification(title, {
    body, icon:'./assets/icon-192.png?v=ornate-pink-bell-20261103',badge:'./assets/icon-192.png?v=ornate-pink-bell-20261103',
    tag:String(message.tag || 'petal-note'),renotify:false,
    data:{url:new URL('./index.html',self.registration.scope).href}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url=new URL('./index.html',self.registration.scope).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const win of windows){ if(win.url.startsWith(self.registration.scope)){await win.focus();return;} }
    await self.clients.openWindow(url);
  })());
});
