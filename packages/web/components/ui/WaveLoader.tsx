import React from 'react';

interface WaveLoaderProps {
  size?: number;
  label?: string;
  /** "full" = centered full-area loader, "inline" = small inline spinner */
  variant?: 'full' | 'inline';
}

/**
 * WaveLoader — animated SVG wave loader.
 *
 * Two cyan-blue sinusoidal waves phase-shifted across a rounded badge.
 * Used for global/page loading states (not button inline spinners).
 */
export const WaveLoader: React.FC<WaveLoaderProps> = ({
  size = 56,
  label,
  variant = 'full',
}) => {
  const loader = (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wave-grad-1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="wave-grad-2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.5" />
          </linearGradient>
          <clipPath id="wave-clip">
            <circle cx="32" cy="32" r="28" />
          </clipPath>
        </defs>

        {/* Circle frame */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="rgba(14,165,233,0.08)"
          stroke="rgba(14,165,233,0.25)"
          strokeWidth="1.5"
        />

        {/* Two animated waves */}
        <g clipPath="url(#wave-clip)">
          <path fill="url(#wave-grad-2)">
            <animate
              attributeName="d"
              dur="2.2s"
              repeatCount="indefinite"
              values="
                M -16 36 Q 0 30 16 36 T 48 36 T 80 36 L 80 64 L -16 64 Z;
                M -16 36 Q 0 42 16 36 T 48 36 T 80 36 L 80 64 L -16 64 Z;
                M -16 36 Q 0 30 16 36 T 48 36 T 80 36 L 80 64 L -16 64 Z
              "
            />
          </path>
          <path fill="url(#wave-grad-1)">
            <animate
              attributeName="d"
              dur="1.6s"
              repeatCount="indefinite"
              values="
                M -16 42 Q 0 36 16 42 T 48 42 T 80 42 L 80 64 L -16 64 Z;
                M -16 42 Q 0 48 16 42 T 48 42 T 80 42 L 80 64 L -16 64 Z;
                M -16 42 Q 0 36 16 42 T 48 42 T 80 42 L 80 64 L -16 64 Z
              "
            />
          </path>
        </g>
      </svg>
    </div>
  );

  if (variant === 'inline') return loader;

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {loader}
      {label && <p className="text-xs font-medium text-white/60 tracking-wider uppercase">{label}</p>}
    </div>
  );
};
