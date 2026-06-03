import { AnimatePresence, motion } from 'framer-motion';
import { Anchor, X, Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { canInstall, install, dismiss } = usePWAInstall();

  return (
    <AnimatePresence>
      {canInstall && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[8900] w-[min(92vw,22rem)]"
          role="banner"
          aria-label="Install SeaYou app"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-lg px-4 py-3 shadow-xl">
            <div className="shrink-0 rounded-xl bg-sky-500/20 p-2 text-sky-400">
              <Anchor className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Install App
              </p>
              <p className="text-sm leading-snug text-slate-100">
                Add SeaYou to your home screen for offline use.
              </p>
            </div>

            <button
              onClick={install}
              className="shrink-0 flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 active:bg-sky-600 transition-colors"
              aria-label="Install SeaYou"
            >
              <Download className="h-3.5 w-3.5" />
              Install
            </button>

            <button
              onClick={dismiss}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-300 transition-colors"
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
