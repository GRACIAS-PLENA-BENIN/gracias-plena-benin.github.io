// Service worker : met en cache UNIQUEMENT les fichiers de l'interface,
// pour un démarrage rapide. Les données comptables ne sont jamais mises en
// cache : chaque consultation et chaque saisie passent par le serveur.
const VERSION = 'gracias-interface-v9';
const FICHIERS = ['./', './index.html', './config.js', './css/app.css', './icone.svg', './manifest.webmanifest',
  './js/app.js', './js/client.js', './js/format.js', './js/saisie-logique.js', './js/ui.js',
  './js/vues/balance.js', './js/vues/ecriture.js', './js/vues/ecritures.js', './js/vues/grand-livre.js', './js/vues/saisie.js',
  './js/vues/lettrage.js', './js/vues/clotures.js', './js/vues/utilisateurs.js', './js/vues/sauvegarde.js', './js/vues/parametrage.js', './js/pieces.js', './js/vues/marches.js', './js/vues/tresorerie.js', './js/vues/immobilisations.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin
      || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) {
    return; // données et authentification : toujours le réseau
  }
  // Réseau d'abord (version à jour), cache en secours si hors ligne.
  e.respondWith(fetch(e.request)
    .then((r) => { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); return r; })
    .catch(() => caches.match(e.request)));
});
