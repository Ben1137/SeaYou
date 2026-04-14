import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Anchor, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../src/contexts/AuthContext';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

type Mode = 'signin' | 'signup';

export const AuthPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    isConfigured,
    loading,
    error,
    signInWithGoogle,
    signInWithApple,
    signInWithFacebook,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    sendMagicLink,
    clearError,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('signup');
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const disabled = busy || loading || !isConfigured;

  const wrapBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await wrapBusy(async () => {
      const ok = mode === 'signin'
        ? await signInWithEmailPassword(email, password)
        : await signUpWithEmailPassword(email, password);
      if (ok && mode === 'signup') setMagicSent(true);
    });
  };

  const handleMagicLink = async () => {
    if (!email) return;
    await wrapBusy(async () => {
      const ok = await sendMagicLink(email);
      if (ok) setMagicSent(true);
    });
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    clearError();
    setMagicSent(false);
  };

  // Mode-aware labels
  const title = mode === 'signup'
    ? t('auth.createYourAccount', 'Create your Account')
    : t('auth.welcomeBack', 'Welcome Back');
  const subtitle = mode === 'signup'
    ? t('auth.signUpSubtitle', 'Join thousands of ocean lovers worldwide')
    : t('auth.signInSubtitle', 'Good to see you again');
  const googleLabel = mode === 'signup'
    ? t('auth.signUpWithGoogle', 'Sign up with Google')
    : t('auth.logInWithGoogle', 'Log in with Google');
  const emailLabel = mode === 'signup'
    ? t('auth.createAccount', 'Create Account')
    : t('auth.signIn', 'Sign In');
  const toggleText = mode === 'signup'
    ? t('auth.haveAccount', 'Already have an account?')
    : t('auth.noAccount', "Don't have an account?");
  const toggleAction = mode === 'signup'
    ? t('auth.logIn', 'Log In')
    : t('auth.signUp', 'Sign Up');

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d2847 30%, #0f3a5e 50%, #0d2847 70%, #0a1628 100%)' }}>

      {/* Animated gradient overlay */}
      <div className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 20% 80%, rgba(59,130,246,0.3) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(14,165,233,0.2) 0%, transparent 50%)',
          animation: 'pulse 8s ease-in-out infinite alternate',
        }} />

      {/* Content */}
      <motion.div
        className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
            <Anchor size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">SeaYou</h1>
          <p className="text-xs font-bold tracking-[0.3em] text-blue-300/60 mt-1 uppercase">Sea's Intelligence</p>
        </motion.div>

        {/* Mode-aware title */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="text-center mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
            <p className="text-sm text-white/40">{subtitle}</p>
          </motion.div>
        </AnimatePresence>

        {/* Mode tabs */}
        <div className="w-full flex rounded-2xl bg-white/[0.06] border border-white/10 p-1 mb-6">
          <button
            onClick={() => { if (mode !== 'signup') toggleMode(); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'signup'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {t('auth.signUp', 'Sign Up')}
          </button>
          <button
            onClick={() => { if (mode !== 'signin') toggleMode(); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'signin'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {t('auth.logIn', 'Log In')}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="w-full mb-4 rounded-xl px-4 py-3 text-xs bg-red-500/10 border border-red-400/30 text-red-300 text-center">
            {error}
          </div>
        )}

        {/* Magic link sent */}
        {magicSent && (
          <div className="w-full mb-4 rounded-xl px-4 py-3 text-xs bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-center">
            {t('auth.magicLinkSent', 'Check your inbox — we sent you a sign-in link.')}
          </div>
        )}

        {/* Social buttons */}
        <motion.div
          className="w-full flex flex-col gap-3 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <button
            onClick={() => wrapBusy(signInWithGoogle)}
            disabled={disabled}
            className="w-full h-13 rounded-2xl flex items-center justify-center gap-3 font-semibold text-sm bg-white text-gray-800 hover:bg-gray-100 transition-all shadow-lg shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{ height: '52px' }}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
            {googleLabel}
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => wrapBusy(signInWithApple)}
              disabled={disabled}
              className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm bg-white/[0.08] text-white/90 hover:bg-white/[0.12] transition-all border border-white/10 disabled:opacity-50 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </button>
            <button
              onClick={() => wrapBusy(signInWithFacebook)}
              disabled={disabled}
              className="flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm bg-[#1877F2]/20 text-white/90 hover:bg-[#1877F2]/30 transition-all border border-[#1877F2]/30 disabled:opacity-50 active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </button>
          </div>
        </motion.div>

        {/* Divider */}
        <div className="w-full flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs font-medium text-white/30 uppercase tracking-wider">{t('auth.or', 'or')}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Email form */}
        <motion.form
          onSubmit={handleEmailPassword}
          className="w-full flex flex-col gap-3 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <input
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder', 'Email address')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            className="w-full h-12 rounded-2xl px-5 text-sm bg-white/[0.06] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/25 transition-all disabled:opacity-50"
          />
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={t('auth.passwordPlaceholder', 'Password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={disabled}
            className="w-full h-12 rounded-2xl px-5 text-sm bg-white/[0.06] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/25 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || !email || !password}
            className="w-full h-12 rounded-2xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:from-blue-500 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {emailLabel}
          </button>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={disabled || !email}
            className="flex items-center justify-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-30"
          >
            <Mail size={12} />
            {t('auth.sendMagicLink', 'Email me a magic link instead')}
          </button>
        </motion.form>

        {/* Toggle mode link */}
        <motion.p
          className="text-sm text-white/40 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          {toggleText}{' '}
          <button
            onClick={toggleMode}
            className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {toggleAction}
          </button>
        </motion.p>
      </motion.div>

      {/* CSS animation */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.2; transform: scale(1); }
          100% { opacity: 0.4; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
};
