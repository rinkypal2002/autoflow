import { useEffect, useRef, useState } from 'react';
import { StatusPill } from '../ui';
import { SERVICES } from '../../config/services';

type State = 'checking' | 'connected' | 'unreachable';

/**
 * Live backend connectivity indicator. Pings the Phase 1 Node health endpoint
 * (default `/api/health`, proxied to the backend) on an interval. Read-only —
 * no engine or contract changes.
 */
export function EngineStatusPill({ intervalMs = 20000 }: { intervalMs?: number }) {
  const [state, setState] = useState<State>('checking');
  const timer = useRef<number>();

  useEffect(() => {
    let active = true;
    const check = async () => {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${SERVICES.nodeApiBase}/health`, { signal: controller.signal });
        if (active) setState(res.ok ? 'connected' : 'unreachable');
      } catch {
        if (active) setState('unreachable');
      } finally {
        window.clearTimeout(t);
      }
    };
    check();
    timer.current = window.setInterval(check, intervalMs);
    return () => {
      active = false;
      window.clearInterval(timer.current);
    };
  }, [intervalMs]);

  if (state === 'connected') return <StatusPill tone="success" label="Engine: Connected" />;
  if (state === 'unreachable') return <StatusPill tone="danger" label="Engine: Unreachable" pulse />;
  return <StatusPill tone="neutral" label="Checking…" />;
}
