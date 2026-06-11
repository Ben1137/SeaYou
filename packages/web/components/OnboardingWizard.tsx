/**
 * Main Onboarding Wizard Component
 * A 4-step wizard for personalizing the SeaYou experience
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useOnboarding } from '../src/hooks/useOnboarding';
import { WelcomeStep } from './OnboardingWizard/WelcomeStep';
import { ActivityStep } from './OnboardingWizard/ActivityStep';
import { LocationStep } from './OnboardingWizard/LocationStep';
import { AlertsStep } from './OnboardingWizard/AlertsStep';

export const OnboardingWizard: React.FC = () => {
  const {
    preferences,
    updatePreferences,
    currentStep,
    nextStep,
    previousStep,
    completeOnboarding,
    closeWizard,
    isOpen,
  } = useOnboarding();

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep === 4) {
      completeOnboarding();
    } else {
      nextStep();
    }
  };

  const handleSkip = () => {
    closeWizard();
  };

  const stepProps = {
    onNext: handleNext,
    onSkip: handleSkip,
    onPrevious: currentStep > 1 ? previousStep : undefined,
    preferences,
    updatePreferences,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden animate-in slide-in-from-bottom-8">
        {/* Close Button */}
        <button
          onClick={closeWizard}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          aria-label="Close onboarding"
        >
          <X size={20} />
        </button>

        {/* Progress Indicator */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-900">
          <div
            className="h-full bg-button transition-all duration-300 ease-out"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>

        {/* Step Counter */}
        <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-slate-900/50 border border-slate-800">
          <span className="text-xs font-bold text-slate-400">
            Step {currentStep}/4
          </span>
        </div>

        {/* Content Container with Scroll */}
        <div className="overflow-y-auto max-h-[90vh] pt-16 pb-8">
          {/* Step Content */}
          <div className="min-h-[400px] flex items-center justify-center">
            {currentStep === 1 && <WelcomeStep {...stepProps} />}
            {currentStep === 2 && <ActivityStep {...stepProps} />}
            {currentStep === 3 && <LocationStep {...stepProps} />}
            {currentStep === 4 && <AlertsStep {...stepProps} />}
          </div>
        </div>

        {/* Step Dots Indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`
                h-2 rounded-full transition-all duration-300
                ${step === currentStep ? 'w-8 bg-blue-500' : 'w-2 bg-slate-700'}
              `}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
