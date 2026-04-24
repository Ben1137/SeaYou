/**
 * VoyageLogbookCard — Phase 6.
 *
 * Dashboard card that lists the user's completed voyages with summary
 * stats (distance / max / avg speed, duration) and an "Export GPX"
 * affordance per trip. Backed by `voyageLogService.listVoyageLogs()`
 * which transparently reads from Supabase when authenticated and
 * falls back to localStorage otherwise — so the card works for
 * signed-out users too.
 */
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Download, Trash2, RefreshCw, Anchor } from 'lucide-react';
import {
  listVoyageLogs,
  deleteVoyageLog,
  voyageToGpx,
  downloadGpx,
  offlineNavigation,
  type VoyageLog,
} from '@seame/core';
import { confirmDialog } from './ui/Dialog';
import { toast } from './ui/Toast';

function formatDuration(start: Date, end: Date): string {
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

export const VoyageLogbookCard: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [logs, setLogs] = useState<VoyageLog[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listVoyageLogs();
      setLogs(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Auto-refresh when a voyage finishes — the auto-save hook writes
    // to the log store, and our card should pick it up immediately.
    const onStop = () => {
      // Small delay so saveVoyageLog has resolved by the time we list.
      window.setTimeout(() => void refresh(), 400);
    };
    offlineNavigation.on('navigationStopped', onStop);
    return () => offlineNavigation.off('navigationStopped', onStop);
  }, [refresh]);

  const onExport = (log: VoyageLog) => {
    const xml = voyageToGpx(log);
    downloadGpx(log.name ?? `voyage-${log.id}`, xml);
  };

  const onDelete = async (log: VoyageLog) => {
    const ok = await confirmDialog(`Delete voyage "${log.name ?? log.id}"?`, {
      title: 'Delete voyage log',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteVoyageLog(log.id);
      await refresh();
      toast.success('Voyage deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete voyage');
    }
  };

  return (
    <div
      className={`bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-sm ${className ?? ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-slate-700 dark:text-slate-200">
          <BookOpen className="w-4 h-4" />
          Logbook
        </h3>
        <button
          onClick={() => void refresh()}
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300"
          title="Refresh"
          disabled={loading}
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {logs === null ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
          <Anchor className="w-5 h-5 opacity-50" />
          <p>No voyages yet. Start a navigation session to begin tracking.</p>
        </div>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {logs.map((log) => (
            <li
              key={log.id}
              className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {log.name ?? 'Voyage'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {log.endTime.toLocaleDateString()} ·{' '}
                    {formatDuration(log.startTime, log.endTime)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onExport(log)}
                    className="p-1.5 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 dark:text-blue-300"
                    title="Export as GPX"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void onDelete(log)}
                    className="p-1.5 rounded bg-red-600/10 hover:bg-red-600/20 text-red-700 dark:text-red-300"
                    title="Delete voyage"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Stat label="Dist" value={`${log.distanceTraveled.toFixed(2)} NM`} />
                <Stat label="Avg" value={`${log.avgSpeed.toFixed(1)} kt`} />
                <Stat label="Max" value={`${log.maxSpeed.toFixed(1)} kt`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded bg-slate-100 dark:bg-slate-800 py-1 px-1">
    <p className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {label}
    </p>
    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
      {value}
    </p>
  </div>
);
