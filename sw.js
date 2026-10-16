
/* =====================================================
   SERVICE WORKER — BITÁCORA DE LECTURA
   Estrategia: Network First + Cache Fallback
===================================================== */

const CACHE = "bitacora-v5";

const BASE = [
  "./index.html",
  "./app.html",
  "./detalle.html",
  "./admin.html",
  "./lector.html",
  "./css/styles.css",
  "./js/pie.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./manifest.json"
];

// INSTALACIÓN
self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);

      await Promise.allSettled(
        BASE.map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn(
              "No se pudo almacenar:",
              url,
              error
            );
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// ACTIVACIÓN
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const claves = await caches.keys();

      await Promise.all(
        claves
          .filter(
            (key) =>
              key.startsWith("bitacora-") &&
              key !== CACHE
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// INTERCEPTAR PETICIONES
self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Solo peticiones GET del mismo origen
  if (
    req.method !== "GET" ||
    new URL(req.url).origin !== self.location.origin
  ) {
    return;
  }

  e.respondWith(
    (async () => {
      try {
        // Intentar obtener contenido actualizado
        const respuesta = await fetch(req);

        // Guardar únicamente respuestas válidas
        if (respuesta.ok) {
          const copia = respuesta.clone();

          e.waitUntil(
            caches.open(CACHE)
              .then((cache) => cache.put(req, copia))
              .catch((error) => {
                console.warn(
                  "Error guardando en caché:",
                  error
                );
              })
          );
        }

        return respuesta;

      } catch (error) {
        // Sin conexión: buscar versión guardada
        const guardado = await caches.match(req);

        if (guardado) {
          return guardado;
        }

        // No hay red ni caché
        throw error;
      }
    })()
  );
});
