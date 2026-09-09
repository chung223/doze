/* 骰寶練習桌 — service worker
   改版時把 VERSION 加一，舊快取會在啟用時清掉。 */
var VERSION = 'v3';
var SHELL = 'sicbo-shell-' + VERSION;
var RUNTIME = 'sicbo-runtime-' + VERSION;

/* 相對路徑會以 sw.js 所在目錄為基準解析，
   所以放在 GitHub Pages 的子路徑（/doze/）底下也能正常運作。 */
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) { return c.addAll(ASSETS); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 導覽與程式碼：連線優先，離線才用快取。
  // （快取優先會讓使用者一直卡在舊版，改版後永遠看不到新的。）
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }

  // 字型：先給快取，背景更新
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(RUNTIME).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 圖示不會變動，快取優先就好
  if (url.pathname.indexOf('/icons/') !== -1) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res && res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
          return res;
        });
      })
    );
    return;
  }

  e.respondWith(networkFirst(req, null));
});

function networkFirst(req, key) {
  return fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put(key || req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(key || req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html') || caches.match('./');
      return new Response('', { status: 504, statusText: 'offline' });
    });
  });
}
