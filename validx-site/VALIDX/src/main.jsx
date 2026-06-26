import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.update().catch(() => {});
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const nextWorker = reg.installing;
        if (!nextWorker) return;
        nextWorker.addEventListener('statechange', () => {
          if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
            nextWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});
  });
}

try {
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  const view = params.get('view');
  if (action === 'create') sessionStorage.setItem('vx_deeplink_action', 'create');
  if (view) sessionStorage.setItem('vx_deeplink_view', view);
} catch {}

document.body.addEventListener('touchmove', event => {
  if (
    event.target.closest('.main') ||
    event.target.closest('.sheet') ||
    event.target.closest('.onboarding')
  ) {
    return;
  }
  event.preventDefault();
}, { passive: false });
