import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Anchor, Waves, Sun, Activity, ChevronRight, Sparkles, Shield, Zap, Download, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlertConfig } from '../src/contexts/AlertContext';
import { startCheckout } from '../src/services/billing';
import type { OnboardingPersona } from '@seame/core';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const PERSONAS: { id: OnboardingPersona; icon: React.ReactNode; label: string; desc: string }[] = [
  { id: 'mariner', icon: <Anchor size={28} />, label: 'Mariner', desc: 'Navigation, routes & sea conditions' },
  { id: 'surfer', icon: <Waves size={28} />, label: 'Surfer', desc: 'Waves, swell & wind forecasts' },
  { id: 'beachgoer', icon: <Sun size={28} />, label: 'Beachgoer', desc: 'Beach weather, UV & tide times' },
  { id: 'diver', icon: <Activity size={28} />, label: 'Diver', desc: 'Visibility, currents & sea temp' },
];

const PREMIUM_FEATURES = [
  { icon: <Sparkles size={18} />, text: 'Advanced Map Layers (Sea Temp, Currents, Heatmaps)' },
  { icon: <Shield size={18} />, text: 'Ad-free experience' },
  { icon: <Zap size={18} />, text: 'Priority data refresh & alerts' },
  { icon: <Download size={18} />, text: 'Offline map downloads' },
];

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onComplete }) => {
  const { t } = useTranslation();
  const alertConfig = useAlertConfig();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [selectedPersona, setSelectedPersona] = useState<OnboardingPersona | null>(null);

  if (!isOpen) return null;

  const goNext = () => { setDirection(1); setStep((s) => s + 1); };

  const handlePersonaSelect = (p: OnboardingPersona) => {
    setSelectedPersona(p);
  };

  const confirmPersona = () => {
    if (selectedPersona) {
      alertConfig.setPersona(selectedPersona);
      goNext();
    }
  };

  const handlePremium = async () => {
    // Complete onboarding locally first so that if the Stripe redirect
    // fails or the user bails out, the app doesn't drop them back into
    // the welcome flow. Tier flips to 'premium' asynchronously once the
    // `stripe-webhook` Edge Function processes `checkout.session.completed`.
    onComplete();
    const res = await startCheckout();
    if (!res.ok && res.error) {
      // Surface failure (NOT_SIGNED_IN, server error, etc.). On success
      // the browser has already navigated to Stripe and this never runs.
      alert(res.error.message);
    }
  };

  const handleFree = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d2847 40%, #0f3a5e 60%, #0a1628 100%)' }}>
      <div className="w-full max-w-md px-6 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {/* Step 0: Welcome */}
          {step === 0 && (
            <motion.div
              key="welcome"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/30"
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
              >
                <Anchor size={48} className="text-white" />
              </motion.div>

              <motion.h1
                className="text-3xl font-black text-white mb-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {t('onboarding.welcome', 'Welcome to SeaYou')}
              </motion.h1>

              <motion.p
                className="text-white/50 text-sm mb-10 max-w-xs leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                {t('onboarding.subtitle', 'Your personal marine intelligence companion. Real-time ocean data at your fingertips.')}
              </motion.p>

              <motion.button
                onClick={goNext}
                className="h-14 px-10 rounded-2xl font-bold text-sm bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25 flex items-center gap-2 active:scale-[0.97] transition-transform"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileTap={{ scale: 0.97 }}
              >
                {t('onboarding.getStarted', 'Get Started')} <ChevronRight size={18} />
              </motion.button>

              {/* Progress dots */}
              <div className="flex gap-2 mt-10">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-blue-400' : 'bg-white/15'}`} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 1: Persona Selection */}
          {step === 1 && (
            <motion.div
              key="persona"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center"
            >
              <h2 className="text-2xl font-black text-white mb-2 text-center">
                {t('onboarding.whoAreYou', 'Who are you?')}
              </h2>
              <p className="text-white/40 text-sm mb-8 text-center">
                {t('onboarding.personaSubtitle', 'We\'ll tailor your experience to match')}
              </p>

              <div className="grid grid-cols-2 gap-3 w-full mb-8">
                {PERSONAS.map((p) => (
                  <motion.button
                    key={p.id}
                    onClick={() => handlePersonaSelect(p.id)}
                    className={`flex flex-col items-center p-5 rounded-2xl border-2 transition-all text-center ${
                      selectedPersona === p.id
                        ? 'border-blue-400 bg-blue-500/15 shadow-lg shadow-blue-500/10'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                    whileTap={{ scale: 0.96 }}
                  >
                    <div className={`mb-3 ${selectedPersona === p.id ? 'text-blue-400' : 'text-white/50'}`}>
                      {p.icon}
                    </div>
                    <span className={`font-bold text-sm ${selectedPersona === p.id ? 'text-white' : 'text-white/70'}`}>
                      {p.label}
                    </span>
                    <span className="text-[11px] text-white/30 mt-1 leading-tight">{p.desc}</span>
                    {selectedPersona === p.id && (
                      <motion.div
                        className="mt-2"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <Check size={16} className="text-blue-400" />
                      </motion.div>
                    )}
                  </motion.button>
                ))}
              </div>

              <button
                onClick={confirmPersona}
                disabled={!selectedPersona}
                className="w-full h-14 rounded-2xl font-bold text-sm bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              >
                {t('onboarding.continue', 'Continue')} <ChevronRight size={18} />
              </button>

              <div className="flex gap-2 mt-8">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-blue-400' : 'bg-white/15'}`} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Premium Upsell */}
          {step === 2 && (
            <motion.div
              key="premium"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/25">
                <Sparkles size={28} className="text-white" />
              </div>

              <h2 className="text-2xl font-black text-white mb-2 text-center">
                {t('onboarding.premiumTitle', 'SeaYou Premium')}
              </h2>
              <p className="text-white/40 text-sm mb-8 text-center">
                {t('onboarding.premiumSubtitle', 'Unlock the full power of marine intelligence')}
              </p>

              <div className="w-full space-y-3 mb-8">
                {PREMIUM_FEATURES.map((f, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/5"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                  >
                    <div className="text-amber-400 shrink-0">{f.icon}</div>
                    <span className="text-sm text-white/80">{f.text}</span>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={handlePremium}
                className="w-full h-14 rounded-2xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform mb-3"
              >
                <Sparkles size={16} /> {t('onboarding.goPremium', 'Start Free Trial')}
              </button>

              <button
                onClick={handleFree}
                className="text-sm text-white/30 hover:text-white/50 transition-colors py-2"
              >
                {t('onboarding.continueFree', 'Continue with Free')}
              </button>

              <div className="flex gap-2 mt-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-blue-400' : 'bg-white/15'}`} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
