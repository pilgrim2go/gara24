// Service worker tối giản: chỉ lưu vỏ ứng dụng để mở được khi mạng chập chờn.
// KHÔNG lưu phản hồi /api: dữ liệu nghiệp vụ luôn lấy mới từ máy chủ (giai đoạn 1 cần online).
const CACHE = 'gara24-shell-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dev/')) return;
  // Trang: mạng trước, hỏng mạng thì dùng bản đã lưu. Tài nguyên tĩnh có hash: lưu sau lần tải đầu.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (url.pathname.startsWith('/assets/') || e.request.mode === 'navigate')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request.mode === 'navigate' ? '/' : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request.mode === 'navigate' ? '/' : e.request).then((r) => r || Response.error())),
  );
});
