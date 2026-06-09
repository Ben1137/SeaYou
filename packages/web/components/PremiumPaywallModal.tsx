import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Lock, X, Layers, Thermometer, Waves, Wind } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PremiumPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

export const PremiumPaywallModal: React.FC<PremiumPaywallModalProps> = ({ isOpen, onClose, onUpgrade }) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Card */}
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(165deg, #1a2744 0%, #0f1d33 100%)' }}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Top gradient accent */}
            <div className="h-1 bg-(--bg-button)" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X size={16} className="text-white/40" />
            </button>

            <div className="px-6 pt-8 pb-6 flex flex-col items-center">
              {/* Lock icon */}
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-5 border border-white/10">
                <Lock size={28} className="text-amber-400" />
              </div>

              <h2 className="text-xl font-black text-white mb-2 text-center">
                {t('premium.unlockTitle', 'Unlock Advanced Layers')}
              </h2>
              <p className="text-sm text-white/40 mb-6 text-center leading-relaxed">
                {t('premium.unlockSubtitle', 'Get access to professional-grade ocean data visualizations')}
              </p>

              {/* Feature chips */}
              <div className="w-full grid grid-cols-2 gap-2 mb-6">
                {[
                  { icon: <Thermometer size={14} />, text: 'Sea Temperature' },
                  { icon: <Wind size={14} />, text: 'Wind Particles' },
                  { icon: <Waves size={14} />, text: 'Wave Heatmap' },
                  { icon: <Layers size={14} />, text: 'Current Particles' },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/5">
                    <span className="text-amber-400">{f.icon}</span>
                    <span className="text-xs text-white/60">{f.text}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onUpgrade}
                className="w-full h-13 rounded-2xl font-bold text-sm bg-(--bg-button) text-white shadow-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-transform mb-3"
                style={{ height: '52px' }}
              >
                <Sparkles size={16} /> {t('premium.goPremium', 'Go Premium')}
              </button>

              <button
                onClick={onClose}
                className="text-sm text-white/30 hover:text-white/50 transition-colors py-2"
              >
                {t('premium.maybeLater', 'Maybe Later')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
