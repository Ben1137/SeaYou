import { registerSW } from 'virtual:pwa-register';
import { UI_CONSTANTS } from '@seame/core';
import { toast } from '../components/ui/Toast';

let _updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm('A new version of SeaYou is available. Reload to update?')) {
      _updateSW?.(true);
    }
  },
  onOfflineReady() {
    toast.success('SeaYou is ready to work offline.', { duration: 4000 });
  },
  onRegistered(registration) {
    if (import.meta.env.DEV) {
      console.log('Service Worker registered:', registration);
    }
  },
  onRegisterError(error) {
    console.error('Service Worker registration error:', error);
  },
});

_updateSW = updateSW;

setInterval(() => {
  updateSW(false);
}, UI_CONSTANTS.SW_UPDATE_CHECK_INTERVAL_MS);

export { updateSW };
