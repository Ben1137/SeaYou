/**
 * Dialog — Phase 7.
 *
 * Imperative, Promise-based replacements for native `confirm()` and
 * `prompt()`. Matches the glass styling of `Toast.tsx` and the rest of the
 * SeaYou UI (backdrop-blur, rounded-2xl, dark: variants).
 *
 * Usage:
 *   <DialogHost />  // mount once at app root, inside ThemeContext.
 *   const ok = await confirmDialog('Delete this route?', { tone: 'danger' });
 *   const name = await promptDialog('Route name', { defaultValue: 'New route' });
 *
 * Both functions resolve when the user acts on the dialog. `confirmDialog`
 * returns `true` on confirm, `false` on cancel. `promptDialog` returns the
 * string entered on confirm, or `null` on cancel.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export type DialogTone = 'default' | 'danger' | 'warning';

interface BaseRequest {
  id: number;
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: DialogTone;
}

interface ConfirmRequest extends BaseRequest {
  kind: 'confirm';
  resolve: (ok: boolean) => void;
}

interface PromptRequest extends BaseRequest {
  kind: 'prompt';
  defaultValue: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}

type DialogRequest = ConfirmRequest | PromptRequest;

type Listener = (req: DialogRequest | null) => void;

let nextId = 1;
let current: DialogRequest | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(current));
}

function present(req: DialogRequest) {
  // If a dialog is already open, resolve it as cancelled to keep invariants.
  if (current) {
    if (current.kind === 'confirm') current.resolve(false);
    else current.resolve(null);
  }
  current = req;
  emit();
}

function dismiss() {
  current = null;
  emit();
}

export function confirmDialog(
  message: string,
  opts: {
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: DialogTone;
  } = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    present({
      kind: 'confirm',
      id: nextId++,
      title: opts.title,
      message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      tone: opts.tone ?? 'default',
      resolve,
    });
  });
}

export function promptDialog(
  message: string,
  opts: {
    title?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: DialogTone;
  } = {},
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    present({
      kind: 'prompt',
      id: nextId++,
      title: opts.title,
      message,
      defaultValue: opts.defaultValue ?? '',
      placeholder: opts.placeholder,
      confirmLabel: opts.confirmLabel ?? 'OK',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      tone: opts.tone ?? 'default',
      resolve,
    });
  });
}

/**
 * Alert replacement — awaitable single-button modal. Still useful when
 * you want a glass modal instead of a toast (e.g. for long disclaimers).
 * For short notifications prefer `toast.info()` / `.error()`.
 */
export function alertDialog(
  message: string,
  opts: {
    title?: string;
    confirmLabel?: string;
    tone?: DialogTone;
  } = {},
): Promise<void> {
  return new Promise<void>((resolve) => {
    present({
      kind: 'confirm',
      id: nextId++,
      title: opts.title,
      message,
      confirmLabel: opts.confirmLabel ?? 'OK',
      cancelLabel: '',
      tone: opts.tone ?? 'default',
      resolve: () => resolve(),
    });
  });
}

const TONE_STYLES: Record<
  DialogTone,
  { ring: string; confirmBtn: string; iconColor: string; icon: React.ReactNode }
> = {
  default: {
    ring: 'border-slate-200 dark:border-slate-700',
    confirmBtn:
      'bg-sky-500 hover:bg-sky-400 text-white dark:bg-sky-500 dark:hover:bg-sky-400',
    iconColor: 'text-sky-500 dark:text-sky-300',
    icon: <HelpCircle className="w-5 h-5" />,
  },
  warning: {
    ring: 'border-amber-300/60 dark:border-amber-500/40',
    confirmBtn: 'bg-amber-500 hover:bg-amber-400 text-white',
    iconColor: 'text-amber-500 dark:text-amber-300',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  danger: {
    ring: 'border-red-300/60 dark:border-red-500/40',
    confirmBtn: 'bg-red-500 hover:bg-red-400 text-white',
    iconColor: 'text-red-500 dark:text-red-300',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
};

/**
 * Mount once near the app root (inside ThemeContext). Renders nothing
 * when no dialog is active.
 */
export const DialogHost: React.FC = () => {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const fn: Listener = (next) => {
      setReq(next);
      if (next && next.kind === 'prompt') setValue(next.defaultValue);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
      if (e.key === 'Enter' && req.kind === 'confirm') handleConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);

  }, [req]);

  if (!req) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    );
  }

  function handleConfirm() {
    if (!req) return;
    if (req.kind === 'confirm') req.resolve(true);
    else req.resolve(value);
    dismiss();
  }

  function handleCancel() {
    if (!req) return;
    if (req.kind === 'confirm') req.resolve(false);
    else req.resolve(null);
    dismiss();
  }

  const style = TONE_STYLES[req.tone];
  const showCancel = req.cancelLabel.length > 0;

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          key="dialog-backdrop"
          className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleCancel}
          role="presentation"
        >
          <motion.div
            key={`dialog-${req.id}`}
            className={`relative w-full max-w-sm rounded-2xl border ${style.ring} bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg shadow-2xl p-5 text-slate-800 dark:text-slate-100`}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`dialog-title-${req.id}`}
          >
            <div className="flex items-start gap-3">
              <div className={`shrink-0 mt-0.5 ${style.iconColor}`}>
                {style.icon}
              </div>
              <div className="min-w-0 flex-1">
                {req.title && (
                  <h3
                    id={`dialog-title-${req.id}`}
                    className="text-sm font-semibold"
                  >
                    {req.title}
                  </h3>
                )}
                <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">
                  {req.message}
                </p>
                {req.kind === 'prompt' && (
                  <input
                    autoFocus
                    type="text"
                    value={value}
                    placeholder={req.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirm();
                    }}
                    className="mt-3 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {showCancel && (
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {req.cancelLabel}
                </button>
              )}
              <button
                onClick={handleConfirm}
                autoFocus={req.kind === 'confirm'}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow ${style.confirmBtn}`}
              >
                {req.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
