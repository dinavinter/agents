import { withYPartyProvider, YDocsManager} from "./ydoc";

declare const self: ServiceWorkerGlobalScope;
export {};

console.log('Service Worker Started', self.location.origin);

const docsManager = withYPartyProvider(new YDocsManager(), `ws://${self.location.host}`,"emit");
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    console.log('Service Worker Activated');
});



self.addEventListener('fetch', docsManager.fetchRouter.bind(docsManager));
 