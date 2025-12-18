/**
 * PWA Registration
 * 
 * Registers the service worker and handles updates.
 */

import { registerSW } from 'virtual:pwa-register';

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload to update?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
    // Could show a toast notification here
  },
  onRegistered(registration) {
    console.log('Service Worker registered:', registration);
  },
  onRegisterError(error) {
    console.error('Service Worker registration error:', error);
  },
});

// Check for updates every hour
setInterval(() => {
  updateSW(false);
}, 60 * 60 * 1000);

export { updateSW };
