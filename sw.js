// Service worker mínimo: red primero (para que cada despliegue nuevo se vea
// de inmediato) y caché solo como respaldo si no hay conexión. Solo toca
// archivos de este mismo sitio; Firebase y Google nunca pasan por aquí.
const CACHE = "bitacora-v3";
const BASE = ["index.html", "app.html", "detalle.html", "admin.html", "css/styles.css", "js/pie.js", "icons/icon-192.png", "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(BASE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
