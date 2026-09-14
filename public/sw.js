/**
 * Service Worker de planilla-app.
 *
 * El estado real vive en IndexedDB; el SW solo sirve para abrir la app sin red.
 * Por eso su primera regla es no romperla en un computador concreto: todo lo
 * que guarda se valida, y cada deploy estrena caché.
 *
 * La versión anterior tenía tres defectos que dejaban la app caída en UNA
 * máquina (la del colegio) mientras en otra funcionaba:
 *  1. Guardaba cualquier 200 bajo /_next/static/. Un filtro de contenido que
 *     responde su página de bloqueo con código 200 dejaba HTML guardado donde
 *     iba JavaScript, y ese computador lo servía roto para siempre.
 *  2. Si la navegación fallaba, devolvía el HTML de la home para CUALQUIER
 *     ruta: /curso/801 cargaba con el código de otra página.
 *  3. El caché se llamaba igual en todos los deploys y nunca se purgaba.
 */

// La versión llega en la URL de registro (/sw.js?v=<commit>): un deploy nuevo
// es un script nuevo, y al activarse borra los cachés de los anteriores.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'sin-version';
const CACHE = `planilla-${VERSION}`;
const SHELL_ASSETS = ['/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg'];

const OFFLINE_HTML = `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>planilla-app · sin conexión</title>
<body style="font:15px/1.5 system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#1f2937">
<h1 style="font-size:20px">Sin conexión</h1>
<p>Esta página no está disponible sin red en este navegador.</p>
<p><a href="/" style="color:#111827">Volver al inicio</a> · <a href="" style="color:#111827">Reintentar</a></p>
</body></html>`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** ¿El tipo de la respuesta corresponde a lo que se pidió? */
function tipoCorrecto(pathname, res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (pathname.endsWith('.js')) return ct.includes('javascript');
  if (pathname.endsWith('.css')) return ct.includes('css');
  if (pathname.endsWith('.svg')) return ct.includes('svg');
  if (pathname.endsWith('.webmanifest') || pathname.endsWith('.json')) {
    return ct.includes('json') || ct.includes('manifest');
  }
  if (/\.(woff2?|ttf|otf)$/.test(pathname)) return ct.includes('font') || ct.includes('octet-stream');
  if (/\.(png|jpe?g|gif|webp|ico)$/.test(pathname)) return ct.startsWith('image/');
  // Lo que no se reconoce no se guarda: mejor pedirlo de nuevo que guardar algo raro.
  return false;
}

/** Solo se guarda lo que llegó directo, del mismo origen y con el tipo esperado. */
function guardable(pathname, res) {
  return res.ok && !res.redirected && res.type === 'basic' && tipoCorrecto(pathname, res);
}

async function navegar(req) {
  try {
    const res = await fetch(req);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && !res.redirected && ct.includes('text/html')) {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    }
    return res;
  } catch {
    // Sin red: SOLO la misma ruta. Servir la home en /curso/801 carga el código
    // de otra página y revienta la hidratación.
    const guardada = await caches.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    return new Response(OFFLINE_HTML, {
      status: 503, headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}

async function estatico(req, pathname) {
  const guardada = await caches.match(req);
  if (guardada) {
    // Una entrada envenenada por un SW anterior también se descarta al leerla.
    if (tipoCorrecto(pathname, guardada)) return guardada;
    caches.open(CACHE).then(c => c.delete(req)).catch(() => {});
  }
  const res = await fetch(req);
  if (guardable(pathname, res)) {
    const copia = res.clone();
    caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Supabase, Google: directo
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;
  if (url.pathname.startsWith('/__nextjs')) return;
  if (url.pathname.startsWith('/api/')) return;           // la API nunca se cachea

  if (req.mode === 'navigate') {
    event.respondWith(navegar(req));
    return;
  }

  const esEstatico = url.pathname.startsWith('/_next/static/')
    || SHELL_ASSETS.includes(url.pathname);
  if (!esEstatico) return;                                // lo demás va a la red sin tocar

  event.respondWith(estatico(req, url.pathname));
});

// ---- Push notifications ----

// Recibe un push del servidor. Payload esperado (JSON):
// { title: string, body: string, url?: string, tag?: string }
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'planilla-app', body: event.data?.text() || '' };
  }
  const title = data.title || 'planilla-app';
  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.tag || 'planilla-app',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en la notificación: enfoca una ventana existente o abre una nueva.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && 'focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
