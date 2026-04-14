import React, { useEffect, useState } from 'react';
import { Joyride, STATUS, type CallBackProps, type Step, type Styles } from 'react-joyride';
import { useTranslation } from 'react-i18next';

interface InteractiveTourProps {
  /** Whether to run the tour (controlled by parent based on onboarding + persona + hasCompletedTour) */
  run: boolean;
  /** Called when the user finishes or skips the tour — parent should persist completion */
  onFinish: () => void;
}

/**
 * InteractiveTour — React Joyride coach-marks tour.
 *
 * Spotlights 4 real UI elements in sequence (search, dashboard scores,
 * map layers, profile menu) so the first-time user immediately understands
 * the core of SeaYou.
 *
 * Target IDs must exist on live DOM elements:
 *   - #tour-dashboard-scores
 *   - #tour-map-layers
 *   - #tour-search-bar
 *   - #tour-profile-menu
 */
export const InteractiveTour: React.FC<InteractiveTourProps> = ({ run, onFinish }) => {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);

  // Wait one tick after `run` flips true so target DOM nodes are definitely mounted
  useEffect(() => {
    if (!run) {
      setReady(false);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(id);
  }, [run]);

  const steps: Step[] = [
    {
      target: '#tour-dashboard-scores',
      title: t('tour.step1.title', 'Personalized Intelligence'),
      content: t(
        'tour.step1.body',
        'We calculate a 0-100 score for your specific persona so you always know when to head out.'
      ),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-map-layers',
      title: t('tour.step2.title', 'Dive into the Data'),
      content: t(
        'tour.step2.body',
        'Switch between wind, waves, and premium layers like Sea Temperature.'
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      target: '#tour-search-bar',
      title: t('tour.step3.title', 'Global Search'),
      content: t(
        'tour.step3.body',
        'Find and favorite beaches in any language to get live updates on your profile.'
      ),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-profile-menu',
      title: t('tour.step4.title', 'Your Hub'),
      content: t(
        'tour.step4.body',
        'Change your persona, upgrade to Premium, and view your live favorites here.'
      ),
      placement: 'right',
      disableBeacon: true,
    },
  ];

  const joyrideStyles: Partial<Styles> = {
    options: {
      primaryColor: '#0ea5e9', // cyan-500 — matches SeaYou brand accent
      backgroundColor: '#0f3a5e', // deep ocean blue (matches glass panels)
      textColor: '#ffffff',
      overlayColor: 'rgba(5, 15, 30, 0.75)',
      arrowColor: '#0f3a5e',
      zIndex: 10000,
      width: 340,
    },
    tooltip: {
      borderRadius: 16,
      padding: 20,
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
    },
    tooltipTitle: {
      fontSize: 17,
      fontWeight: 800,
      color: '#ffffff',
      marginBottom: 6,
      letterSpacing: '-0.01em',
    },
    tooltipContent: {
      fontSize: 14,
      lineHeight: 1.55,
      color: 'rgba(255,255,255,0.8)',
      padding: 0,
    },
    buttonNext: {
      background: 'linear-gradient(90deg, #2563eb, #06b6d4)',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 700,
      padding: '10px 18px',
      boxShadow: '0 8px 20px rgba(14,165,233,0.25)',
    },
    buttonBack: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 13,
      fontWeight: 600,
      marginRight: 8,
    },
    buttonSkip: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: 12,
      fontWeight: 600,
    },
    buttonClose: {
      color: 'rgba(255,255,255,0.4)',
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
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
};
