import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface ColorScaleItem {
  value: number;
  color: string;
  label?: string;
}

export interface ColorScaleLegendProps {
  scale: ColorScaleItem[];
  unit: string;
  title: string;
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  className?: string;
  caveat?: string;
}

const POSITION_CLASSES = {
  topleft: 'top-4 left-4',
  topright: 'top-4 right-4',
  bottomleft: 'bottom-4 left-4',
  bottomright: 'bottom-4 right-4',
} as const;

export const ColorScaleLegend: React.FC<ColorScaleLegendProps> = ({
  scale,
  unit,
  title,
  position = 'bottomright',
  className = '',
  caveat,
}) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  // Sort scale items by value in descending order (highest at top)
  const sortedScale = useMemo(() => {
    return [...scale].sort((a, b) => b.value - a.value);
  }, [scale]);

  // Generate CSS gradient from sorted scale
  const gradientStops = useMemo(() => {
    if (sortedScale.length === 0) return '';

    const totalRange = sortedScale[0].value - sortedScale[sortedScale.length - 1].value;
    if (totalRange === 0) return sortedScale[0].color;

    return sortedScale
      .map((item, index) => {
        const position = ((sortedScale[0].value - item.value) / totalRange) * 100;
        return `${item.color} ${position.toFixed(1)}%`;
      })
      .join(', ');
  }, [sortedScale]);

  if (scale.length === 0) {
    return null;
  }

  return (
    <div
      className={`absolute z-[350] ${POSITION_CLASSES[position]} ${className} pointer-events-none`}
      style={{ direction: isRTL ? 'rtl' : 'ltr' }}
    >
      <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-600/60 rounded-lg shadow-2xl overflow-hidden w-[90px] animate-in fade-in slide-in-from-bottom-4 pointer-events-auto">
        {/* Header */}
        <div className="px-2 py-1.5 border-b border-slate-600/50 bg-slate-800/70">
          <h3 className="text-[11px] font-bold text-white uppercase tracking-wide truncate text-center">
            {title}
          </h3>
          {caveat && (
            <div className="text-[10px] text-white/60 mt-1 leading-tight text-center font-normal">
              {caveat}
            </div>
          )}
        </div>

        {/* Gradient Bar & Labels */}
        <div className="p-2">
          <div className="flex gap-1.5">
            {/* Gradient Bar */}
            <div className="relative w-5 h-28 rounded overflow-hidden shadow-inner border border-slate-600/50">
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to bottom, ${gradientStops})`,
                }}
              />
            </div>

            {/* Value Labels - simplified vertical list */}
            <div className="flex-1 h-28 flex flex-col justify-between py-0">
              {sortedScale.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center"
                >
                  {/* Tick Mark */}
                  <div className="w-1.5 h-px bg-slate-500/80 mr-1" />

                  {/* Value Text */}
                  <span className="text-[11px] font-bold text-white leading-none whitespace-nowrap drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    {item.label || item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Unit Label */}
          <div className="mt-2 text-center">
            <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider px-2 py-0.5 bg-slate-800/80 rounded border border-slate-600/50">
              {unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorScaleLegend;
