/**
 * Toast — Phase 7.
 *
 * Imperative toast API matching the rest of the SeaYou glass UI. A
 * singleton store drives a portal-rendered stack; any module (including
 * `@seame/core` service wrappers reached via a thin adapter) can call
 * `toast.success()` / `.error()` / `.info()` without being a React
 * component.
 *
 * Usage:
 *   <ToastHost />  // mount once at app root, inside ThemeContext.
 *   toast.success('Route saved');
 *   toast.error('GPS lost');
 *   toast.info('Approaching waypoint', { duration: 6000 });
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
  duration: number;
}

type Listener = (items: ToastItem[]) => void;

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l([...items]));
}

export const toast = {
  push(
    kind: ToastKind,
    message: string,
    opts: { title?: string; duration?: number } = {},
  ): number {
    const id = nextId++;
    const item: ToastItem = {
      id,
      kind,
      title: opts.title,
      message,
      duration: opts.duration ?? (kind === 'error' ? 6000 : 4000),
    };
    items = [...items, item];
    emit();
    if (item.duration > 0) {
      window.setTimeout(() => toast.dismiss(id), item.duration);
    }
    return id;
  },
  success(msg: string, opts?: { title?: string; duration?: number }) {
    return toast.push('success', msg, opts);
  },
  error(msg: string, opts?: { title?: string; duration?: number }) {
    return toast.push('error', msg, opts);
  },
  info(msg: string, opts?: { title?: string; duration?: number }) {
    return toast.push('info', msg, opts);
  },
  warning(msg: string, opts?: { title?: string; duration?: number }) {
    return toast.push('warning', msg, opts);
  },
  dismiss(id: number) {
    items = items.filter((t) => t.id !== id);
    emit();
  },
};

const KIND_STYLES: Record<
  ToastKind,
  { icon: React.ReactNode; ring: string; iconColor: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    ring: 'border-emerald-400/40 bg-emerald-500/15 dark:bg-emerald-500/20',
    iconColor: 'text-emerald-500 dark:text-emerald-300',
  },
  error: {
    icon: <XCircle className="w-5 h-5" />,
    ring: 'border-red-400/40 bg-red-500/15 dark:bg-red-500/20',
    iconColor: 'text-red-500 dark:text-red-300',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    ring: 'border-blue-400/40 bg-blue-500/15 dark:bg-blue-500/20',
    iconColor: 'text-blue-500 dark:text-blue-300',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    ring: 'border-amber-400/40 bg-amber-500/15 dark:bg-amber-500/20',
    iconColor: 'text-amber-500 dark:text-amber-300',
  },
};

/**
 * Mount once near the app root (inside ThemeContext so dark:
 * variants apply). Renders nothing when the stack is empty.
 */
export const ToastHost: React.FC = () => {
  const [stack, setStack] = useState<ToastItem[]>([]);

  useEffect(() => {
    const fn: Listener = (next) => setStack(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9000] flex flex-col gap-2 w-[min(92vw,22rem)] pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence initial={false}>
        {stack.map((t) => {
          const style = KIND_STYLES[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto flex items-start gap-2 rounded-xl border ${style.ring} backdrop-blur-lg px-3 py-2 shadow-lg text-slate-800 dark:text-slate-100`}
              role="status"
            >
              <div className={`mt-0.5 shrink-0 ${style.iconColor}`}>
                {style.icon}
              </div>
              <div className="min-w-0 flex-1">
                {t.title && (
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {t.title}
                  </p>
                )}
                <p className="text-sm leading-snug break-words">{t.message}</p>
              </div>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
