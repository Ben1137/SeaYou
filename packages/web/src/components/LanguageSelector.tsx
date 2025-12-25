/**
 * Language Selector Component
 *
 * A dropdown component for selecting the application language.
 * Supports 7 languages with flag emojis and RTL support for Hebrew.
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

  // Get current language details
  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleLanguageChange = (langCode: Language) => {
    i18n.changeLanguage(langCode);
    // Set document direction for RTL languages
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
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-elevated hover:bg-button-secondary transition-colors border border-subtle"
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe size={16} className="text-accent" />
        <span className="text-sm font-medium hidden sm:inline">
          {currentLanguage.flag} {currentLanguage.code.toUpperCase()}
        </span>
        <span className="text-sm font-medium sm:hidden">
          {currentLanguage.flag}
        </span>
        <ChevronDown
          size={14}
          className={`text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute top-full right-0 sm:right-0 left-0 sm:left-auto mt-2 w-64 sm:w-64 max-w-[calc(100vw-2rem)] bg-card rounded-lg border border-subtle shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2"
          role="listbox"
          aria-label="Language options"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-app bg-elevated">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-accent" />
              <span className="text-sm font-bold text-white">Select Language</span>
            </div>
          </div>

          {/* Language Options */}
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {LANGUAGES.map((lang) => {
              const isSelected = lang.code === i18n.language;

              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full px-4 py-3 flex items-center justify-between transition-colors text-left ${
                    isSelected
                      ? 'bg-selected border-l-4 border-accent'
                      : 'hover:bg-elevated border-l-4 border-transparent'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl" aria-hidden="true">
                      {lang.flag}
                    </span>
                    <div className="flex flex-col">
                      <span className={`font-medium ${isSelected ? 'text-white' : 'text-secondary'}`}>
                        {lang.nativeName}
                      </span>
                      <span className="text-xs text-muted">
                        {lang.name}
                        {lang.isRTL && ' • RTL'}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={18} className="text-accent flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Info */}
          <div className="px-4 py-2 border-t border-app bg-elevated">
            <p className="text-xs text-muted">
              Language preference is saved automatically
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
