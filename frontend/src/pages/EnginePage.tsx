import { Search } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Cpu,
  Database,
  Eraser,
  Gauge,
  Info,
  Layers,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Terminal,
  XCircle,
  ChevronsDown,
  Wifi,
  WifiOff,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { SERVICES } from '../config/services';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

type TomcatStatus = 'running' | 'stopped' | 'starting' | 'error';
type LogFilter = 'all' | 'info' | 'warn' | 'error';
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
type EngineAction = 'start' | 'stop' | 'restart';
type ToastTone = 'success' | 'error' | 'info';

interface EngineMetrics {
  status: string;
  cpu: number;
  memory: number;
  heap: number;
  threads: number;
  latency: number;
  uptime: string;
  pid: number;
  tomcatVersion: string;
  jvm: string;
  logs: string[];
}

interface ToastState {
  tone: ToastTone;
  message: string;
}

interface ConfirmState {
  action: 'stop' | 'restart';
  title: string;
  description: string;
}

/* -------------------------------------------------------------------------- */
/*                               CONFIGURATION                                */
/* -------------------------------------------------------------------------- */

const API_BASE = `${SERVICES.engineMonitorBase}/api/engine`;
const POLL_INTERVAL_MS = 3000;
const MEMORY_BUDGET_MB = 512;
const HISTORY_LENGTH = 30;

/* -------------------------------------------------------------------------- */
/*                              PURE UTILITIES                                */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const formatUptime = (value: string) => value || 'N/A';

const formatClockTime = (ts: number | null) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const normalizeStatus = (status?: string): TomcatStatus => {
  const value = (status || '').toLowerCase();
  if (value === 'running') return 'running';
  if (value === 'stopped') return 'stopped';
  if (value === 'starting' || value === 'start_pending') return 'starting';
  return 'error';
};

const getStatusMeta = (status: TomcatStatus) => {
  switch (status) {
    case 'running':
      return {
        label: 'Running',
        description: 'Tomcat service is active',
        chip: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
        dot: 'bg-emerald-400',
      };
    case 'starting':
      return {
        label: 'Starting',
        description: 'Tomcat service is transitioning',
        chip: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
        dot: 'bg-amber-400',
      };
    case 'stopped':
      return {
        label: 'Stopped',
        description: 'Tomcat is intentionally not running',
        chip: 'bg-slate-500/10 border-slate-500/25 text-slate-300',
        dot: 'bg-slate-400',
      };
    default:
      return {
        label: 'Error',
        description: 'Tomcat reported an error state',
        chip: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
        dot: 'bg-rose-400',
      };
  }
};

const classifyLogLevel = (line: string): LogLevel => {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('exception') || lower.includes('failed')) return 'ERROR';
  if (lower.includes('warn')) return 'WARN';
  if (lower.includes('debug')) return 'DEBUG';
  return 'INFO';
};

const LOG_LEVEL_META: Record<
  LogLevel,
  { color: string; border: string; bg: string; icon: React.ElementType }
> = {
  ERROR: {
    color: 'text-rose-300',
    border: 'border-rose-500/20',
    bg: 'bg-rose-500/[0.035]',
    icon: XCircle,
  },
  WARN: {
    color: 'text-amber-300',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/[0.025]',
    icon: AlertTriangle,
  },
  DEBUG: {
    color: 'text-slate-500',
    border: 'border-white/[0.04]',
    bg: 'bg-transparent',
    icon: Bug,
  },
  INFO: {
    color: 'text-cyan-300',
    border: 'border-white/[0.04]',
    bg: 'bg-transparent',
    icon: Info,
  },
};

const getMetricHealth = (pct: number) => {
  if (pct >= 85) {
    return {
      label: 'Critical',
      text: 'text-rose-300',
      chip: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
      bar: 'bg-rose-400',
    };
  }

  if (pct >= 70) {
    return {
      label: 'Warning',
      text: 'text-amber-300',
      chip: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
      bar: 'bg-amber-400',
    };
  }

  return {
    label: 'Normal',
    text: 'text-cyan-300',
    chip: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
    bar: 'bg-gradient-to-r from-cyan-400 to-indigo-400',
  };
};

const getLatencyMeta = (latency: number) => {
  if (latency >= 3000) {
    return {
      label: 'Critical',
      color: 'text-rose-300',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
    };
  }

  if (latency >= 1000) {
    return {
      label: 'Elevated',
      color: 'text-amber-300',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    };
  }

  return {
    label: 'Normal',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  };
};

const getLogFilterCounts = (logs: string[]) => {
  const counts = { all: logs.length, info: 0, warn: 0, error: 0 };

  for (const line of logs) {
    const level = classifyLogLevel(line);
    if (level === 'ERROR') counts.error += 1;
    else if (level === 'WARN') counts.warn += 1;
    else counts.info += 1;
  }

  return counts;
};

const matchesLogFilter = (line: string, filter: LogFilter): boolean => {
  if (filter === 'all') return true;
  const level = classifyLogLevel(line);
  if (filter === 'error') return level === 'ERROR';
  if (filter === 'warn') return level === 'WARN';
  return level === 'INFO' || level === 'DEBUG';
};

const extractTimestamp = (line: string) => {
  const match = line.match(/^\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d{3}/);
  return match?.[0] ?? '';
};

/* -------------------------------------------------------------------------- */
/*                            PRESENTATIONAL PARTS                            */
/* -------------------------------------------------------------------------- */

const MiniSparkline: React.FC<{ values: number[]; colorClass: string }> = ({
  values,
  colorClass,
}) => {
  if (values.length < 2) {
    return <div className="h-9 rounded-lg bg-white/[0.025]" />;
  }

  const max = Math.max(...values, 1);
  const width = 220;
  const height = 36;
  const step = width / (values.length - 1);

  const points = values
    .map((value, index) => `${index * step},${height - (value / max) * (height - 4) - 2}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-9 w-full ${colorClass}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: number;
  unit: string;
  icon: React.ElementType;
  detail: string;
  history: number[];
  progress: number;
}> = ({ title, value, unit, icon: Icon, detail, history, progress }) => {
  const health = getMetricHealth(progress);

  return (
    <div className="group min-h-[190px] rounded-2xl border border-white/[0.065] bg-[linear-gradient(180deg,rgba(12,18,31,0.94),rgba(7,11,20,0.96))] p-5 shadow-[0_16px_42px_rgba(0,0,0,0.18)] transition-colors hover:border-white/[0.10]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {title}
            </p>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${health.chip}`}
            >
              {health.label}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className={`font-mono text-[32px] font-bold leading-none sm:text-[36px] ${health.text}`}>
              {value.toFixed(1)}
            </span>
            <span className="text-[14px] font-semibold text-slate-500">{unit}</span>
          </div>

          <p className="mt-2 text-[10px] text-slate-500">{detail}</p>
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-[#050812]">
          <Icon className={`h-5 w-5 ${health.text}`} strokeWidth={2.1} />
        </div>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-white/[0.045]"
        aria-label={`${title} health threshold`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${health.bar}`}
          style={{ width: `${clamp(progress, 0, 100)}%` }}
        />
      </div>

      <div className="mt-3">
        <MiniSparkline values={history} colorClass={health.text} />
      </div>
    </div>
  );
};

const RuntimeStat: React.FC<{
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  note?: string;
  emphasis?: boolean;
}> = ({ label, value, icon: Icon, color, bg, border, note, emphasis }) => (
  <div
    className={`rounded-xl border p-4 ${
      emphasis
        ? 'border-cyan-400/15 bg-[linear-gradient(135deg,rgba(8,145,178,0.075),rgba(15,23,42,0.76))]'
        : 'border-white/[0.05] bg-[#090D16]/78'
    }`}
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${bg} ${border}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} strokeWidth={2.3} />
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </span>
      </div>
      {note ? <span className={`text-[9px] font-semibold ${color}`}>{note}</span> : null}
    </div>

    <div className={`font-mono font-bold tracking-tight text-slate-100 ${emphasis ? 'text-[23px]' : 'text-[19px]'}`}>
      {value}
    </div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-white/[0.04] py-3 last:border-b-0">
    <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
      {label}
    </span>
    <span className="break-all text-right font-mono text-[11px] font-semibold text-slate-200">
      {value}
    </span>
  </div>
);

const Toast: React.FC<{ toast: ToastState; onClose: () => void }> = ({ toast, onClose }) => {
  const success = toast.tone === 'success';
  const failure = toast.tone === 'error';
  const Icon = success ? CheckCircle2 : failure ? XCircle : Info;

  return (
    <div
      className={`fixed right-5 top-5 z-[90] flex max-w-[420px] items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${
        success
          ? 'border-emerald-500/25 bg-[#07130F]/95'
          : failure
            ? 'border-rose-500/25 bg-[#17090E]/95'
            : 'border-cyan-500/25 bg-[#07121A]/95'
      }`}
      role="status"
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          success ? 'text-emerald-300' : failure ? 'text-rose-300' : 'text-cyan-300'
        }`}
      />
      <p className="flex-1 text-[11px] leading-relaxed text-slate-200">{toast.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-200"
        aria-label="Dismiss notification"
      >
        Dismiss
      </button>
    </div>
  );
};

const ConfirmDialog: React.FC<{
  state: ConfirmState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ state, busy, onCancel, onConfirm }) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="engine-confirm-title"
  >
    <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#090E18] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
        </div>
        <div>
          <h3 id="engine-confirm-title" className="text-[14px] font-bold text-slate-100">
            {state.title}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{state.description}</p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-[11px] font-bold text-slate-300 transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg border border-amber-400/20 bg-amber-400 px-4 py-2 text-[11px] font-bold text-slate-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Processing…' : state.action === 'restart' ? 'Restart Engine' : 'Stop Engine'}
        </button>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                ENGINE PAGE                                 */
/* -------------------------------------------------------------------------- */

const EnginePage: React.FC = () => {
  const [metrics, setMetrics] = useState<EngineMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [actionLoading, setActionLoading] = useState<EngineAction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [history, setHistory] = useState<{ cpu: number; memoryPct: number; heap: number }[]>([]);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());

  const abortRef = useRef<AbortController | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const currentStatus = normalizeStatus(metrics?.status);
  const statusMeta = getStatusMeta(currentStatus);

  const showToast = useCallback((nextToast: ToastState) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast(nextToast);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4200);
  }, []);

  const fetchMetrics = useCallback(async () => {
    abortRef.current?.abort();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const response = await fetch(`${API_BASE}/metrics`, {
        signal: ac.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Monitoring API responded with ${response.status}`);
      }

      const data = (await response.json()) as EngineMetrics;

      setMetrics(data);
      setConnectionError('');
      setLastUpdated(Date.now());

      setHistory((prev) => [
        ...prev.slice(-(HISTORY_LENGTH - 1)),
        {
          cpu: Number(data.cpu || 0),
          memoryPct: clamp((Number(data.memory || 0) / MEMORY_BUDGET_MB) * 100, 0, 100),
          heap: Number(data.heap || 0),
        },
      ]);
    } catch (err) {
      if (ac.signal.aborted) return;

      setConnectionError(
        err instanceof Error ? err.message : 'Unable to reach the Engine Monitoring API',
      );
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  const executeAction = useCallback(
    async (action: EngineAction) => {
      try {
        setActionLoading(action);

        const response = await fetch(`${API_BASE}/${action}`, {
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error(`Engine action failed with status ${response.status}`);
        }

        const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
        showToast({
          tone: 'success',
          message: `${actionLabel} command was accepted by the Engine Monitoring service.`,
        });

        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        await fetchMetrics();
      } catch (err) {
        const message = err instanceof Error ? err.message : `Engine action "${action}" failed`;

        showToast({
          tone: 'error',
          message: `${message}. The monitoring connection and Tomcat service state are reported separately.`,
        });

        console.error(`Engine action "${action}" failed:`, err);
      } finally {
        setActionLoading(null);
      }
    },
    [fetchMetrics, showToast],
  );

  const requestAction = useCallback(
    (action: EngineAction) => {
      if (action === 'stop') {
        setConfirmState({
          action: 'stop',
          title: 'Stop Tomcat engine?',
          description:
            'This is a disruptive operation. Active automation work that depends on this engine may be interrupted.',
        });
        return;
      }

      if (action === 'restart') {
        setConfirmState({
          action: 'restart',
          title: 'Restart Tomcat engine?',
          description:
            'The service will be stopped and started again. Use this only when a restart is operationally appropriate.',
        });
        return;
      }

      void executeAction(action);
    },
    [executeAction],
  );

  useEffect(() => {
    void fetchMetrics();

    const interval = window.setInterval(() => {
      void fetchMetrics();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchMetrics]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  const cpuHistory = useMemo(() => history.map((item) => item.cpu), [history]);
  const memHistory = useMemo(() => history.map((item) => item.memoryPct), [history]);
  const heapHistory = useMemo(() => history.map((item) => item.heap), [history]);

  const allLogs = useMemo(() => metrics?.logs ?? [], [metrics?.logs]);
  const logCounts = useMemo(() => getLogFilterCounts(allLogs), [allLogs]);

  const visibleLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return allLogs
      .filter(
        (line) =>
          (!query || line.toLowerCase().includes(query)) &&
          matchesLogFilter(line, logFilter),
      )
      .reverse();
  }, [allLogs, searchTerm, logFilter]);

  useEffect(() => {
    if (!autoScrollPaused) {
      logScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [visibleLogs, autoScrollPaused]);

  const topMetrics = metrics
    ? [
        {
          title: 'CPU Usage',
          value: Number(metrics.cpu || 0),
          unit: '%',
          icon: Cpu,
          detail: 'Tomcat process CPU load',
          history: cpuHistory,
          progress: Number(metrics.cpu || 0),
        },
        {
          title: 'Process Memory',
          value: Number(metrics.memory || 0),
          unit: 'MB',
          icon: Database,
          detail: `Working set relative to ${MEMORY_BUDGET_MB} MB UI budget`,
          history: memHistory,
          progress: Math.min((Number(metrics.memory || 0) / MEMORY_BUDGET_MB) * 100, 100),
        },
        {
          title: 'Heap Usage',
          value: Number(metrics.heap || 0),
          unit: '%',
          icon: Layers,
          detail: 'JVM heap occupancy',
          history: heapHistory,
          progress: Number(metrics.heap || 0),
        },
      ]
    : [];

  const latencyMeta = getLatencyMeta(Number(metrics?.latency || 0));

  const nextRefreshSeconds = lastUpdated
    ? Math.max(0, Math.ceil((POLL_INTERVAL_MS - (clockTick - lastUpdated)) / 1000))
    : null;

  const clearLogView = useCallback(() => {
    setSearchTerm('');
    setLogFilter('all');
    showToast({
      tone: 'info',
      message: 'Local log filters were cleared. No Catalina logs were deleted from the server.',
    });
  }, [showToast]);

  const jumpToLatest = useCallback(() => {
    setAutoScrollPaused(false);
    logScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const copyVisibleLogs = useCallback(async () => {
    if (visibleLogs.length === 0) {
      showToast({
        tone: 'info',
        message: 'There are no visible log lines to copy.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(visibleLogs.join('\n'));
      showToast({
        tone: 'success',
        message: `${visibleLogs.length} visible Catalina log event${visibleLogs.length === 1 ? '' : 's'} copied.`,
      });
    } catch {
      showToast({
        tone: 'error',
        message: 'Unable to access the clipboard from this browser context.',
      });
    }
  }, [showToast, visibleLogs]);

  return (
    <AppShell
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search Catalina logs…"
    >
      {toast ? <Toast toast={toast} onClose={() => setToast(null)} /> : null}

      {confirmState ? (
        <ConfirmDialog
          state={confirmState}
          busy={actionLoading !== null}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const action = confirmState.action;
            setConfirmState(null);
            void executeAction(action);
          }}
        />
      ) : null}

      <div className="mx-auto max-w-[1600px] space-y-5 lg:space-y-6">
        {loading && !metrics ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-11 w-11 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-300" />
              <div>
                <p className="text-[12px] font-semibold text-slate-300">
                  Connecting to Engine Monitor…
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Waiting for the dedicated monitoring service.
                </p>
              </div>
            </div>
          </div>
        ) : connectionError && !metrics ? (
          <div className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="w-full max-w-lg rounded-2xl border border-rose-500/15 bg-[#0B0F18]/90 p-6 text-center shadow-2xl">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10">
                <WifiOff className="h-6 w-6 text-rose-300" />
              </div>

              <h3 className="text-[15px] font-bold text-slate-100">
                Engine Monitor unavailable
              </h3>
              <p className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-slate-400">
                The dedicated monitoring API cannot currently be reached. This is different
                from a valid Tomcat <span className="font-semibold text-slate-300">Stopped</span>{' '}
                state.
              </p>
              <p className="mt-3 break-words font-mono text-[10px] text-slate-600">
                {connectionError}
              </p>

              <button
                type="button"
                onClick={() => void fetchMetrics()}
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry monitoring connection
              </button>
            </div>
          </div>
        ) : metrics ? (
          <>
            {/* ---------------------------------------------------------------- */}
            {/* Operational command bar                                           */}
            {/* ---------------------------------------------------------------- */}
            <section className="rounded-2xl border border-white/[0.065] bg-[linear-gradient(180deg,rgba(10,15,26,0.96),rgba(7,10,18,0.94))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:px-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-cyan-300" />
                      <h1 className="text-[17px] font-bold tracking-tight text-slate-100">
                        Engine / Tomcat
                      </h1>
                    </div>

                    <div className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 ${statusMeta.chip}`}>
                      <span className="relative flex h-2 w-2">
                        {currentStatus === 'running' ? (
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusMeta.dot} opacity-60 motion-reduce:animate-none`}
                          />
                        ) : null}
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${statusMeta.dot}`} />
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                        {statusMeta.label}
                      </span>
                    </div>

                    <span
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/15 bg-cyan-500/[0.055] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-300"
                      title="Metrics are polled from the monitoring API approximately every 3 seconds."
                    >
                      <Wifi className="h-3 w-3" />
                      Polling · 3s
                    </span>

                    {connectionError ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300"
                        title={connectionError}
                      >
                        <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                        Monitor reconnecting
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] text-slate-500">
                    <span>{statusMeta.description}</span>
                    <span className="font-mono">
                      Last refresh: <span className="text-slate-400">{formatClockTime(lastUpdated)}</span>
                    </span>
                    <span className="font-mono">
                      Next poll:{' '}
                      <span className="text-slate-400">
                        {nextRefreshSeconds === null ? '—' : `${nextRefreshSeconds}s`}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => requestAction('start')}
                    disabled={actionLoading !== null || currentStatus === 'running'}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400 px-3.5 py-2 text-[11px] font-bold text-slate-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                    title={currentStatus === 'running' ? 'Tomcat is already running' : 'Start Tomcat'}
                  >
                    <Play className="h-3.5 w-3.5" fill="currentColor" />
                    Start
                  </button>

                  <button
                    type="button"
                    onClick={() => requestAction('stop')}
                    disabled={actionLoading !== null || currentStatus !== 'running'}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-500/90 px-3.5 py-2 text-[11px] font-bold text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40"
                    title={currentStatus !== 'running' ? 'Tomcat is not running' : 'Stop Tomcat'}
                  >
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                    Stop
                  </button>

                  <div className="mx-1 hidden h-6 w-px bg-white/[0.07] sm:block" />

                  <button
                    type="button"
                    onClick={() => requestAction('restart')}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.08] px-3.5 py-2 text-[11px] font-bold text-amber-200 transition-colors hover:bg-amber-500/[0.14] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
                    title="Restart is a disruptive operation"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${actionLoading === 'restart' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
                    Restart
                  </button>

                  <button
                    type="button"
                    onClick={() => void fetchMetrics()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-[11px] font-bold text-slate-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* Primary health summary                                            */}
            {/* ---------------------------------------------------------------- */}
            <section aria-label="Primary engine health metrics">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {topMetrics.map((metric) => (
                  <MetricCard key={metric.title} {...metric} />
                ))}
              </div>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* Secondary runtime metrics                                         */}
            {/* ---------------------------------------------------------------- */}
            <section aria-label="Runtime statistics">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <RuntimeStat
                  label="Threads"
                  value={metrics.threads.toString()}
                  icon={Activity}
                  color="text-indigo-300"
                  bg="bg-indigo-500/10"
                  border="border-indigo-500/20"
                />
                <RuntimeStat
                  label="Latency"
                  value={`${metrics.latency} ms`}
                  icon={Gauge}
                  color={latencyMeta.color}
                  bg={latencyMeta.bg}
                  border={latencyMeta.border}
                  note={latencyMeta.label}
                />
                <RuntimeStat
                  label="PID"
                  value={metrics.pid.toString()}
                  icon={Server}
                  color="text-slate-300"
                  bg="bg-slate-500/10"
                  border="border-slate-500/20"
                />
                <RuntimeStat
                  label="Uptime"
                  value={formatUptime(metrics.uptime)}
                  icon={Clock}
                  color="text-cyan-300"
                  bg="bg-cyan-500/10"
                  border="border-cyan-500/20"
                  emphasis
                />
              </div>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* Server info + Catalina console                                    */}
            {/* ---------------------------------------------------------------- */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
              <section className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <Server className="h-4 w-4 text-cyan-300" />
                  <h2 className="text-[12px] font-bold tracking-wide text-slate-200">
                    Server Information
                  </h2>
                </div>

                <div className="rounded-2xl border border-white/[0.055] bg-[#090D16]/82 p-4 shadow-sm">
                  <InfoRow label="Tomcat" value={metrics.tomcatVersion || 'N/A'} />
                  <InfoRow label="JVM" value={metrics.jvm || 'N/A'} />
                  <InfoRow label="Service State" value={statusMeta.label} />
                  <InfoRow label="Process ID" value={metrics.pid} />

                  <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.018] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Circle className={`h-2 w-2 fill-current ${statusMeta.dot.replace('bg-', 'text-')}`} />
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Monitoring context
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      Service state is reported by the dedicated Engine Monitoring API. A stopped
                      Tomcat instance is a valid monitored state.
                    </p>
                  </div>
                </div>
              </section>

              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-300" />
                    <h2 className="text-[12px] font-bold tracking-wide text-slate-200">
                      Catalina Log Console
                    </h2>
                    <span className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 font-mono text-[9px] text-slate-500">
                      {allLogs.length} events
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    <span className="relative flex h-1.5 w-1.5">
                      {!connectionError ? (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                      ) : null}
                      <span
                        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                          connectionError ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      />
                    </span>
                    {connectionError ? 'Polling reconnecting' : 'Polling every 3s'}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/[0.055] bg-[#070B13]/95 shadow-[0_18px_46px_rgba(0,0,0,0.17)]">
                  <div className="space-y-3 border-b border-white/[0.045] p-3.5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ['all', 'All', logCounts.all],
                          ['info', 'Info', logCounts.info],
                          ['warn', 'Warn', logCounts.warn],
                          ['error', 'Error', logCounts.error],
                        ] as const
                      ).map(([key, label, count]) => {
                        const active = logFilter === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setLogFilter(key)}
                            className={`rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/25 ${
                              active
                                ? 'border-cyan-500/25 bg-cyan-500/[0.075] text-cyan-200'
                                : 'border-white/[0.05] bg-white/[0.018] text-slate-400 hover:bg-white/[0.035] hover:text-slate-200'
                            }`}
                          >
                            <div className="text-[9px] font-bold uppercase tracking-[0.14em]">
                              {label}
                            </div>
                            <div className="mt-1 font-mono text-[11px] font-bold">{count}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                      <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                        <input
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Filter Catalina logs…"
                          className="w-full rounded-lg border border-white/[0.055] bg-[#04070D] py-2 pl-9 pr-3 text-[11px] text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAutoScrollPaused((value) => !value)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[9px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/25 ${
                            autoScrollPaused
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                              : 'border-white/[0.055] bg-white/[0.02] text-slate-400 hover:text-slate-200'
                          }`}
                          title="Controls only the local log console scroll position."
                        >
                          <Pause className="h-3 w-3" />
                          {autoScrollPaused ? 'Resume Auto Scroll' : 'Pause Auto Scroll'}
                        </button>

                        <button
                          type="button"
                          onClick={jumpToLatest}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.055] bg-white/[0.02] px-2.5 py-2 text-[9px] font-bold text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/25"
                        >
                          <ChevronsDown className="h-3 w-3" />
                          Jump to Latest
                        </button>

                        <button
                          type="button"
                          onClick={() => void copyVisibleLogs()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.055] bg-white/[0.02] px-2.5 py-2 text-[9px] font-bold text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/25"
                        >
                          <Copy className="h-3 w-3" />
                          Copy Visible
                        </button>

                        <button
                          type="button"
                          onClick={clearLogView}
                          disabled={!searchTerm && logFilter === 'all'}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.055] bg-white/[0.02] px-2.5 py-2 text-[9px] font-bold text-slate-400 transition-colors hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/25"
                          title="Clears only local filter/search state."
                        >
                          <Eraser className="h-3 w-3" />
                          Clear Filter
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/[0.04] bg-[#090D16]/90 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      <Circle className={`h-1.5 w-1.5 fill-current ${connectionError ? 'text-amber-400' : 'text-emerald-400'}`} />
                      {autoScrollPaused ? 'Auto scroll paused' : 'Latest events first'}
                    </div>

                    <div className="font-mono text-[9px] text-slate-600">
                      {visibleLogs.length} visible
                    </div>
                  </div>

                  <div
                    ref={logScrollRef}
                    className="custom-scrollbar max-h-[540px] overflow-y-auto"
                  >
                    {visibleLogs.length === 0 ? (
                      <div className="p-12 text-center">
                        <Terminal className="mx-auto mb-3 h-8 w-8 text-slate-700" />
                        <p className="text-[11px] font-medium text-slate-500">
                          No Catalina log events match the current view
                        </p>
                        <p className="mt-1 text-[9px] text-slate-700">
                          Adjust the severity filter or search query.
                        </p>
                      </div>
                    ) : (
                      visibleLogs.map((line, index) => {
                        const level = classifyLogLevel(line);
                        const meta = LOG_LEVEL_META[level];
                        const Icon = meta.icon;
                        const timestamp = extractTimestamp(line);

                        return (
                          <div
                            key={`${index}-${line.slice(0, 32)}`}
                            className={`flex items-start gap-3 border-b px-3.5 py-3 transition-colors last:border-b-0 hover:bg-white/[0.022] ${meta.border} ${meta.bg}`}
                          >
                            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.color}`} />

                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-[0.14em] ${meta.color}`}
                                >
                                  {level}
                                </span>
                                {timestamp ? (
                                  <span className="font-mono text-[9px] text-slate-600">
                                    {timestamp}
                                  </span>
                                ) : null}
                              </div>

                              <p className="whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.55] text-slate-300 sm:text-[11px]">
                                {line}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.04] bg-white/[0.012] px-3.5 py-2.5 font-mono text-[9px] text-slate-600">
                    <span>
                      Catalina logs retrieved through monitoring API polling
                    </span>
                    <span>Last polled: {formatClockTime(lastUpdated)}</span>
                  </div>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
};

export default EnginePage;
