const CACHE_NAME = 'meu-site-offline-v1';
// Lista de arquivos necessários para o site funcionar offline
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css', // adicione o caminho do seu CSS se for externo
  '/script.js', // adicione o caminho dos seus scripts
  '/lib/pdf-lib.min.js' // bibliotecas externas
];

// Instala o Service Worker e baixa os arquivos para o cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Remove caches antigos ao atualizar a versão
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepta as requisições: se estiver offline, busca do Cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Retorna do cache se existir
      }
      return fetch(event.request); // Se não estiver no cache, busca na rede
    })
  );
});