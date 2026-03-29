/**
 * Language Selector Component — Glassmorphism pill design
 */

import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Language = 'en' | 'he' | 'de' | 'fr' | 'ru' | 'it' | 'es';

interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
  isRTL?: boolean;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', isRTL: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
];

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleLanguageChange = (langCode: Language) => {
    i18n.changeLanguage(langCode);
    const lang = LANGUAGES.find(l => l.code === langCode);
    if (lang?.isRTL) {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Compact pill trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-inner flex items-center px-3 py-1.5 space-x-1.5 rounded-full cursor-pointer border border-white/10 hover:bg-white/20 transition-colors"
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe size={13} className="text-white/80" />
        <span className="text-xs font-bold uppercase tracking-wide text-white/90">
          {currentLanguage.flag} {currentLanguage.code.toUpperCase()}
        </span>
        <ChevronDown
          size={10}
          className={`text-white/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full right-0 sm:right-0 left-0 sm:left-auto mt-2 w-64 sm:w-64 max-w-[calc(100vw-2rem)] glass-panel bg-[#0F3A5E]/90 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2"
          role="listbox"
          aria-label="Language options"
        >
          <div className="px-4 py-3 border-b border-white/10 glass-inner !rounded-none !rounded-t-[1.25rem]">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-blue-400" />
              <span className="text-sm font-bold text-white">Select Language</span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto hide-scrollbar">
            {LANGUAGES.map((lang) => {
              const isSelected = lang.code === i18n.language;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full px-4 py-3 flex items-center justify-between transition-colors text-left ${
                    isSelected
                      ? 'bg-blue-500/20 border-l-4 border-blue-400'
                      : 'hover:bg-white/10 border-l-4 border-transparent'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl" aria-hidden="true">{lang.flag}</span>
                    <div className="flex flex-col">
                      <span className={`font-medium ${isSelected ? 'text-white' : 'text-white/70'}`}>
                        {lang.nativeName}
                      </span>
                      <span className="text-xs text-white/40">
                        {lang.name}
                        {lang.isRTL && ' • RTL'}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check size={18} className="text-blue-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="px-4 py-2 border-t border-white/10 glass-inner !rounded-none !rounded-b-[1.25rem]">
            <p className="text-xs text-white/40">
              Language preference is saved automatically
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
