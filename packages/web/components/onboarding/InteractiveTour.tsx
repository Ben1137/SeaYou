import React, { useEffect, useMemo, useState } from 'react';
import { Joyride, STATUS, type CallBackProps, type Step, type Styles } from 'react-joyride';
import { useTranslation } from 'react-i18next';

interface InteractiveTourProps {
  /** Whether to run the tour (controlled by parent based on onboarding + persona + hasCompletedTour) */
  run: boolean;
  /** Called when the user finishes or skips the tour — parent should persist completion */
  onFinish: () => void;
}

/**
 * Viewport-aware target picker.
 *
 * The app renders a desktop sidebar nav AND a mobile bottom nav simultaneously
 * (one is CSS-hidden). Joyride uses getBoundingClientRect which returns zeros
 * for display:none elements, so we must target the *visible* copy by suffixing
 * the element IDs with -desktop/-mobile and picking based on the `lg:` Tailwind
 * breakpoint (1024px).
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

/**
 * InteractiveTour — React Joyride coach-marks.
 *
 * Targets only PERSISTENT UI elements that exist on every tab
 * (Dashboard scores are always mounted within the dashboard view which is
 * the initial route; nav + profile buttons live in the permanent chrome).
 *
 * Step order teaches the user to navigate the app themselves:
 *   1. Dashboard score grid  → "what we do for you"
 *   2. Map nav button         → "how to see charts"
 *   3. Location pill          → "how to search"
 *   4. Profile avatar         → "where settings live"
 */
export const InteractiveTour: React.FC<InteractiveTourProps> = ({ run, onFinish }) => {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const isDesktop = useIsDesktop();

  // Wait one tick after `run` flips true so target DOM nodes are definitely mounted
  useEffect(() => {
    if (!run) {
      setReady(false);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(id);
  }, [run]);

  const navMapTarget = isDesktop ? '#tour-nav-map-desktop' : '#tour-nav-map-mobile';
  const profileTarget = isDesktop ? '#tour-profile-menu-desktop' : '#tour-profile-menu-mobile';

  const steps: Step[] = useMemo(
    () => [
      {
        target: '#tour-dashboard-scores',
        title: t('tour.step1.title', 'Personalized Intelligence'),
        content: t(
          'tour.step1.body',
          'We calculate a live 0-100 score for your specific persona so you always know the perfect time to head out.'
        ),
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: navMapTarget,
        title: t('tour.step2.title', 'Explore the Map'),
        content: t(
          'tour.step2.body',
          'Click here to view interactive charts and unlock premium layers like Sea Temperature and Wave Heatmaps.'
        ),
        placement: isDesktop ? 'right' : 'top',
        disableBeacon: true,
      },
      {
        target: '#tour-search-bar',
        title: t('tour.step3.title', 'Global Search'),
        content: t(
          'tour.step3.body',
          'Find and favorite beaches in any language to get live updates right on your profile.'
        ),
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: profileTarget,
        title: t('tour.step4.title', 'Your Hub'),
        content: t(
          'tour.step4.body',
          'Manage your Persona, change your settings, and upgrade to Premium here.'
        ),
        placement: isDesktop ? 'right' : 'bottom',
        disableBeacon: true,
      },
    ],
    [t, navMapTarget, profileTarget, isDesktop]
  );

  // Light-mode tooltip styles — the app itself is dark, but we force a white
  // card with dark text so content is always legible regardless of theme.
  const joyrideStyles: Partial<Styles> = {
    options: {
      primaryColor: '#0ea5e9', // SeaYou cyan accent
      backgroundColor: '#ffffff',
      textColor: '#1f2937', // gray-800
      overlayColor: 'rgba(5, 15, 30, 0.65)',
      arrowColor: '#ffffff',
      zIndex: 10000,
      width: 340,
    },
    tooltip: {
      borderRadius: 16,
      padding: 22,
      boxShadow: '0 24px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(15,23,42,0.06)',
    },
    tooltipContainer: {
      textAlign: 'left',
    },
    tooltipTitle: {
      fontSize: 17,
      fontWeight: 800,
      color: '#111827', // gray-900
      marginBottom: 8,
      letterSpacing: '-0.01em',
    },
    tooltipContent: {
      fontSize: 14,
      lineHeight: 1.55,
      color: '#374151', // gray-700
      padding: 0,
    },
    buttonNext: {
      background: 'linear-gradient(90deg, #2563eb, #06b6d4)',
      color: '#ffffff',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 700,
      padding: '10px 18px',
      boxShadow: '0 8px 20px rgba(14,165,233,0.25)',
      outline: 'none',
    },
    buttonBack: {
      color: '#6b7280', // gray-500
      fontSize: 13,
      fontWeight: 600,
      marginRight: 8,
    },
    buttonSkip: {
      color: '#9ca3af', // gray-400
      fontSize: 12,
      fontWeight: 600,
    },
    buttonClose: {
      color: '#9ca3af',
      width: 10,
      height: 10,
      top: 14,
      right: 14,
    },
    spotlight: {
      borderRadius: 16,
    },
  };

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(status)) {
      onFinish();
    }
  };

  if (!ready) return null;

  return (
    <Joyride
      steps={steps}
      run={ready}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose
      disableScrolling={false}
      scrollToFirstStep
      callback={handleCallback}
      locale={{
        back: t('tour.back', 'Back'),
        close: t('tour.close', 'Close'),
        last: t('tour.last', 'Get Started'),
        next: t('tour.next', 'Next'),
        skip: t('tour.skip', 'Skip'),
      }}
      styles={joyrideStyles}
      floaterProps={{ disableAnimation: false }}
    />
  );
};
