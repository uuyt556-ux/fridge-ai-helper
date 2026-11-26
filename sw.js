/* 냉장고 파먹기 — AI 레시피·장보기 도우미
   Service Worker: 앱 셸 오프라인 캐시
   GitHub Pages 하위 경로(/fridge-ai-helper/)에서도 동작하도록 모든 경로는 상대 경로 사용 */

var CACHE_NAME = 'fridgeai-shell-v1';

/* 앱 셸: 설치 시 미리 캐시 */
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

/* 캐시 범위(스코프) 기준 절대 URL 만들기 */
function scopeUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* 한 파일이 실패해도 설치는 계속되도록 개별 요청으로 넣는다 */
      return Promise.all(
        SHELL_FILES.map(function (file) {
          return cache.add(new Request(scopeUrl(file), { cache: 'reload' })).catch(function () {});
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME && key.indexOf('fridgeai-') === 0) return caches.delete(key);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  /* GET 이외(예: Gemini API POST)는 건드리지 않는다 */
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* 다른 출처(Gemini API 등)는 캐시하지 않고 그대로 네트워크로 */
  if (url.origin !== self.location.origin) return;

  /* 페이지 이동: 네트워크 우선, 오프라인일 때 캐시된 셸로 */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(scopeUrl('./index.html'), copy); });
        return res;
      }).catch(function () {
        return caches.match(scopeUrl('./index.html')).then(function (hit) {
          return hit || caches.match(scopeUrl('./'));
        }).then(function (hit) {
          return hit || new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>오프라인</title><body style="font-family:system-ui;padding:32px;text-align:center;color:#12231a">' +
            '<h2>인터넷 연결을 확인해 주세요</h2><p style="color:#6c8175">처음 한 번은 온라인에서 앱을 열어야 오프라인 사용이 가능합니다.</p></body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  /* 정적 파일: 캐시 우선, 없으면 네트워크 후 캐시 저장 */
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        /* 뒤에서 조용히 최신본으로 갱신 */
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE_NAME).then(function (cache) { cache.put(req, res); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
