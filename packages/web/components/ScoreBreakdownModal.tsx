/**
 * ScoreBreakdownModal — "Explainable UI" for activity scoring.
 *
 * Opened when the user taps an activity cube in the Dashboard's Activity
 * Report. Shows:
 *   • Activity name + total score
 *   • Human-readable breakdown rows (green / gray / red) explaining WHY
 *     the score landed where it did.
 *   • A premium-styled "Tune Sensitivity (PRO)" upsell button that, when
 *     tapped, shows a toast teasing the upcoming SeaYou Pro feature.
 *
 * The modal is purely presentational — it takes a pre-computed
 * `ActivityScore` from the parent and renders its `breakdown` array.
 */

import React, { useEffect, useState } from 'react';
import { X, Lock, TrendingUp, Minus, TrendingDown } from 'lucide-react';
import type { ActivityScore, ScoreFactor } from '@seame/core';
import { useTranslation } from 'react-i18next';

interface ScoreBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Human-readable activity label, e.g. "Wave Surfer". */
  activityLabel: string;
  /** Pre-computed score + breakdown. */
  score: ActivityScore | null;
}

/** Map each impact bucket to Tailwind text + background classes.
 *  Uses dark: variants so the explainable breakdown is legible in both
 *  day-mode (light backdrop) and night-mode (dark backdrop). */
const IMPACT_STYLES: Record<ScoreFactor['impact'], { text: string; bg: string; Icon: typeof TrendingUp }> = {
  positive: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/40 dark:border-emerald-400/30', Icon: TrendingUp },
  neutral:  { text: 'text-slate-600 dark:text-white/60',       bg: 'bg-slate-500/5 dark:bg-white/5 border-slate-300 dark:border-white/10', Icon: Minus },
  negative: { text: 'text-rose-700 dark:text-rose-400',        bg: 'bg-rose-500/10 border-rose-500/40 dark:border-rose-400/30',          Icon: TrendingDown },
};

export const ScoreBreakdownModal: React.FC<ScoreBreakdownModalProps> = ({
  isOpen,
  onClose,
  activityLabel,
  score,
}) => {
  const { t } = useTranslation();
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss the upsell toast after 3 s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!isOpen || !score) return null;

  const handleTuneClick = () => {
    setToast(
      t(
        'scoring.tuneSensitivityToast',
        'Custom algorithm tuning is coming soon in SeaYou Pro!',
      ),
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-breakdown-title"
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl text-slate-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-baseline gap-3">
            <h2 id="score-breakdown-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {activityLabel}
            </h2>
            <span className={`text-3xl font-extrabold leading-none ${score.color}`}>
              {score.overall}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/10 transition text-slate-700 dark:text-white"
            aria-label={t('actions.close', 'Close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Label pill */}
        <div className="px-4 pt-4">
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${score.color} bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10`}>
            {t(`scoring.${score.label.toLowerCase()}`, score.label)}
          </span>
        </div>

        {/* Breakdown list */}
        <div className="p-4 space-y-2">
          <h3 className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-white/50 uppercase mb-2">
            {t('scoring.whyThisScore', 'Why this score')}
          </h3>
          {score.breakdown.map((factor, idx) => {
            const { text, bg, Icon } = IMPACT_STYLES[factor.impact];
            return (
              <div
                key={idx}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${bg}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon size={14} className={text} />
                  <span className="text-sm text-slate-800 dark:text-white/90 truncate">{factor.label}</span>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${text} ml-3 whitespace-nowrap`}>
                  {factor.value}
                </span>
              </div>
            );
          })}

          {/* Warnings, if any */}
          {score.warnings.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 dark:border-amber-400/30">
              <h4 className="text-[10px] font-bold tracking-widest text-amber-700 dark:text-amber-300 uppercase mb-1">
                {t('scoring.warnings', 'Warnings')}
              </h4>
              <ul className="text-xs text-amber-900 dark:text-amber-100/90 space-y-1 list-disc list-inside">
                {score.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Pro upsell — premium-styled gradient button */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10">
          <button
            onClick={handleTuneClick}
            className="w-full relative overflow-hidden group rounded-xl py-3 px-4 font-bold text-sm tracking-wide text-white bg-(--bg-button) shadow-lg transition"
          >
            <span className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
            <span className="relative flex items-center justify-center gap-2">
              <Lock size={14} />
              {t('scoring.tuneSensitivity', 'Tune Sensitivity')}
              <span className="text-[10px] font-black tracking-widest bg-black/30 px-1.5 py-0.5 rounded">
                PRO
              </span>
            </span>
          </button>
          <p className="text-[10px] text-slate-500 dark:text-white/40 text-center mt-2">
            {t(
              'scoring.tuneSensitivityHint',
              'Customize the scoring algorithm to match your skill level.',
            )}
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2.5 bg-white dark:bg-slate-800 border border-amber-500/40 dark:border-amber-400/40 rounded-xl shadow-lg text-sm text-slate-900 dark:text-white max-w-[90%] text-center animate-fade-in"
          role="status"
        >
          🔒 {toast}
        </div>
      )}
    </div>
  );
};

export default ScoreBreakdownModal;
