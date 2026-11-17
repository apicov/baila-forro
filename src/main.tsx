import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import './theme/fonts';
import App from './App';

if (!Capacitor.isNativePlatform()) {
  // ask the browser not to evict the imported songs
  void navigator.storage?.persist?.().catch(() => false);
} else {
  // Android back button: back through the app's pages (hash routes), leave the app from the library
  void NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.hash !== '#/' && window.location.hash !== '') window.history.back();
    else void NativeApp.exitApp();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
