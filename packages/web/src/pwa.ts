import { registerSW } from 'virtual:pwa-register';
import { UI_CONSTANTS } from '@seame/core';
import { toast } from '../components/ui/Toast';

let _updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

const updateSW = registerSW({
  onNeedRefresh() {
    const id = toast.info('Update available — reload to get the latest SeaYou.', {
      title: 'App Update',
      duration: 0, // persistent until user dismisses
    });
    // Escape hatch for DevTools: window.__seayouUpdate() triggers the reload.
    (window as Window & { __seayouUpdate?: () => void }).__seayouUpdate = () => {
      toast.dismiss(id);
      _updateSW?.(true);
    };
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
