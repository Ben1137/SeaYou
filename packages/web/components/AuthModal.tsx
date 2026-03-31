import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="white" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="white" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center px-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('auth.signIn', 'Sign In')}
    >
      <div className="glass-panel w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8"
        style={{ backgroundColor: 'color-mix(in srgb, var(--app-bg-card) 85%, transparent)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('auth.signIn', 'Sign In')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px" style={{ backgroundColor: 'var(--app-border)' }} />

        {/* Social login buttons */}
        <div className="px-6 pt-5 pb-2 flex flex-col gap-3">
          <button
            className="w-full h-12 rounded-full flex items-center justify-center gap-3 font-semibold text-sm
              bg-white text-gray-800 hover:bg-gray-100 transition-colors shadow-sm"
          >
            <GoogleIcon />
            {t('auth.continueWithGoogle', 'Continue with Google')}
          </button>

          <button
            className="w-full h-12 rounded-full flex items-center justify-center gap-3 font-semibold text-sm
              text-white hover:opacity-90 transition-opacity shadow-sm"
            style={{ backgroundColor: '#1877F2' }}
          >
            <FacebookIcon />
            {t('auth.continueWithFacebook', 'Continue with Facebook')}
          </button>

          <button
            className="w-full h-12 rounded-full flex items-center justify-center gap-3 font-semibold text-sm
              bg-black text-white hover:bg-gray-900 transition-colors shadow-sm"
          >
            <AppleIcon />
            {t('auth.continueWithApple', 'Continue with Apple')}
          </button>
        </div>

        {/* "or" divider */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--app-border)' }} />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {t('auth.or', 'or')}
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--app-border)' }} />
        </div>

        {/* Email input */}
        <div className="px-6 flex flex-col gap-3">
          <input
            type="email"
            placeholder={t('auth.emailPlaceholder', 'Enter your email')}
            className="w-full h-12 rounded-full px-5 text-sm border focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'var(--app-border)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            className="w-full h-12 rounded-full font-semibold text-sm border-2 transition-colors hover:bg-white/10"
            style={{
              borderColor: 'var(--text-accent)',
              color: 'var(--text-accent)',
            }}
          >
            {t('auth.continueWithEmail', 'Continue with Email')}
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pt-5 pb-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('auth.noAccount', "Don't have an account?")}{' '}
            <button
              className="font-semibold hover:underline transition-colors"
              style={{ color: 'var(--text-accent)' }}
            >
              {t('auth.signUp', 'Sign up')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
