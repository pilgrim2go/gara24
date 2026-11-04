import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Font tự host (gói @fontsource, giấy phép SIL OFL 1.1: public/licenses/fonts-OFL.txt).
// Mỗi độ đậm gồm 3 tập ký tự (vietnamese, latin-ext, latin) chia bằng unicode-range:
// trình duyệt chỉ tải tập có ký tự cần vẽ. Chỉ nhập đúng độ đậm styles.css dùng.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}
