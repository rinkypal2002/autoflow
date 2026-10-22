import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Icons from 'lucide-react';
import { Connection } from '../types/workflow';

interface Props {
  connection: Connection;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  onDelete: (id: string) => void;
  onEdit: (connection: Connection) => void;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  status?: 'idle' | 'running' | 'completed' | 'failed' | 'skipped';
  /**
   * Branch tone of the edge's source port. `exception` paints an idle edge in
   * the amber theme so a reject path reads as one along its whole length, not
   * just at the handle. Live run status always wins — a running or failed edge
   * keeps its status colour, because during a run "what is happening now" is
   * more urgent than "which branch is this".
   */
  branchTone?: 'primary' | 'exception' | 'neutral' | null;
}

type ThemeKey = 'idle' | 'running' | 'completed' | 'failed' | 'skipped';

const STATUS_THEME: Record<
  ThemeKey,
  {
    base: string;
    gradientStart: string;
    gradientEnd: string;
    glow: string;
    arrow: string;
    labelBorder: string;
    labelBg: string;
    labelText: string;
    badgeDot: string;
  }
> = {
  idle: {
    base: '#38bdf8',
    gradientStart: '#38bdf8',
    gradientEnd: '#818cf8',
    glow: 'rgba(56,189,248,0.10)',
    arrow: '#67e8f9',
    labelBorder: 'rgba(56,189,248,0.18)',
    labelBg: 'rgba(10,15,24,0.92)',
    labelText: '#cbd5e1',
    badgeDot: '#38bdf8',
  },
  running: {
    base: '#22d3ee',
    gradientStart: '#22d3ee',
    gradientEnd: '#60a5fa',
    glow: 'rgba(34,211,238,0.18)',
    arrow: '#22d3ee',
    labelBorder: 'rgba(34,211,238,0.22)',
    labelBg: 'rgba(8,16,24,0.94)',
    labelText: '#e2e8f0',
    badgeDot: '#22d3ee',
  },
  completed: {
    base: '#34d399',
    gradientStart: '#34d399',
    gradientEnd: '#22d3ee',
    glow: 'rgba(52,211,153,0.14)',
    arrow: '#34d399',
    labelBorder: 'rgba(52,211,153,0.20)',
    labelBg: 'rgba(8,16,18,0.94)',
    labelText: '#d1fae5',
    badgeDot: '#34d399',
  },
  failed: {
    base: '#fb7185',
    gradientStart: '#fb7185',
    gradientEnd: '#fb923c',
    glow: 'rgba(251,113,133,0.16)',
    arrow: '#fb7185',
    labelBorder: 'rgba(251,113,133,0.20)',
    labelBg: 'rgba(24,8,12,0.94)',
    labelText: '#fee2e2',
    badgeDot: '#fb7185',
  },
  skipped: {
    base: '#fbbf24',
    gradientStart: '#fbbf24',
    gradientEnd: '#f59e0b',
    glow: 'rgba(251,191,36,0.14)',
    arrow: '#fbbf24',
    labelBorder: 'rgba(251,191,36,0.20)',
    labelBg: 'rgba(24,16,6,0.94)',
    labelText: '#fef3c7',
    badgeDot: '#fbbf24',
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');

const ConnectionLine: React.FC<Props> = ({
  connection,
  sourceX,
  sourceY,
  targetX,
  targetY,
  onDelete,
  onEdit,
  onSelect,
  isSelected = false,
  status = 'idle',
  branchTone = null,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // An exception branch borrows the existing amber `skipped` palette rather
  // than introducing a sixth partial theme, so every colour in the set stays
  // internally consistent.
  const themeKey: ThemeKey =
    status === 'idle' && branchTone === 'exception' ? 'skipped' : status;
  const theme = STATUS_THEME[themeKey] || STATUS_THEME.idle;

  const uid = useMemo(() => safeId(connection.id), [connection.id]);
  const gradientId = `conn-gradient-${uid}`;
  const glowId = `conn-glow-${uid}`;
  const arrowId = `conn-arrow-${uid}`;

  const badgeText = useMemo(() => {
    const rawLabel = typeof connection.label === 'string' ? connection.label.trim() : '';
    if (rawLabel) return rawLabel;
    if (connection.condition) return 'Condition';
    return '';
  }, [connection.label, connection.condition]);

  const pathData = useMemo(() => {
    const dx = Math.abs(targetX - sourceX);
    const dy = Math.abs(targetY - sourceY);
    const movingBackwards = targetX < sourceX;

    const curveX = movingBackwards
      ? clamp(dx * 0.46 + 34, 42, 180)
      : clamp(dx * 0.34 + 28, 30, 150);

    const curveY = clamp(dy * 0.12, 0, 36);

    return `M ${sourceX} ${sourceY} C ${sourceX + curveX} ${sourceY + curveY}, ${targetX - curveX} ${targetY - curveY}, ${targetX} ${targetY}`;
  }, [sourceX, sourceY, targetX, targetY]);

  const midPoint = useMemo(
    () => ({
      x: sourceX + (targetX - sourceX) / 2,
      y: sourceY + (targetY - sourceY) / 2,
    }),
    [sourceX, sourceY, targetX, targetY]
  );

  const closeMenu = useCallback(() => {
    setShowMenu(false);
  }, []);

  const openMenu = useCallback((clientX: number, clientY: number) => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;

    const menuWidth = 208;
    const menuHeight = badgeText ? 206 : 170;

    setMenuPos({
      x: clamp(clientX, 12, Math.max(12, viewportWidth - menuWidth - 12)),
      y: clamp(clientY, 12, Math.max(12, viewportHeight - menuHeight - 12)),
    });
    setShowMenu(true);
  }, [badgeText]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(connection.id);
      openMenu(e.clientX, e.clientY);
    },
    [connection.id, onSelect, openMenu]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(connection.id);
    },
    [connection.id, onSelect]
  );

  useEffect(() => {
    if (!showMenu) return;

    const handlePointerDown = (evt: PointerEvent) => {
      const target = evt.target as HTMLElement | null;
      if (target?.closest('[data-connection-menu="true"]')) return;
      closeMenu();
    };

    const handleScroll = () => closeMenu();
    const handleResize = () => closeMenu();
    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMenu, closeMenu]);

  const isRunning = status === 'running';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isSkipped = status === 'skipped';

  const strokeWidth = isSelected || isHovered || isRunning ? 2.35 : 1.9;
  const visibleOpacity = isSelected || isHovered || isRunning ? 0.98 : 0.82;
  const glowOpacity = isRunning
    ? 0.18
    : isSelected
      ? 0.13
      : isHovered
        ? 0.10
        : 0.06;

  const visibleStroke =
    isRunning || isCompleted || isFailed || isSkipped
      ? theme.base
      : `url(#${gradientId})`;

  const renderMenu =
    showMenu && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-connection-menu="true"
            className="fixed z-[100] w-[208px] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0A101A]/96 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
            style={{
              left: menuPos.x,
              top: menuPos.y,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/[0.04] bg-white/[0.02] px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Connection
                </span>
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: theme.base, boxShadow: `0 0 10px ${theme.glow}` }}
                />
              </div>
              {badgeText ? (
                <div className="mt-1 truncate text-[11px] font-medium text-slate-300">
                  {badgeText}
                </div>
              ) : null}
            </div>

            <div className="p-1.5">
              <button
                type="button"
                onClick={() => {
                  onEdit(connection);
                  closeMenu();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] font-medium text-slate-300 transition-colors hover:bg-cyan-500/10 hover:text-cyan-100"
              >
                <Icons.Settings2 className="h-3.5 w-3.5 text-slate-400" />
                Edit Routing
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelect?.(connection.id);
                  closeMenu();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100"
              >
                <Icons.MousePointer2 className="h-3.5 w-3.5 text-slate-400" />
                Select Edge
              </button>

              <div className="my-1 h-px bg-white/[0.05]" />

              <button
                type="button"
                onClick={() => {
                  onDelete(connection.id);
                  closeMenu();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] font-medium text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Icons.Trash2 className="h-3.5 w-3.5 text-rose-400/80" />
                Delete Connection
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <g
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1={sourceX}
            y1={sourceY}
            x2={targetX}
            y2={targetY}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={theme.gradientStart} />
            <stop offset="100%" stopColor={theme.gradientEnd} />
          </linearGradient>

          <marker
            id={arrowId}
            markerWidth="10"
            markerHeight="10"
            refX="8.2"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d="M 0 2.7 L 8.8 5 L 0 7.3 L 2 5 z"
              fill={theme.arrow}
            />
          </marker>

          <filter id={glowId} x="-20%" y="-20%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={isRunning ? 3.2 : isSelected ? 2.6 : 1.8} />
          </filter>
        </defs>

        <path
          d={pathData}
          stroke="rgba(0,0,0,0)"
          strokeWidth="24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="stroke"
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        />

        <path
          d={pathData}
          stroke={theme.base}
          strokeOpacity={glowOpacity}
          strokeWidth={strokeWidth + (isRunning ? 4.5 : 3.5)}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          className="pointer-events-none transition-all duration-300 ease-out"
        />

        <path
          d={pathData}
          stroke={visibleStroke}
          strokeWidth={strokeWidth}
          strokeOpacity={visibleOpacity}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={`url(#${arrowId})`}
          className="pointer-events-none transition-all duration-300 ease-out"
        />

        {isRunning && (
          <path
            d={pathData}
            stroke="#ffffff"
            strokeOpacity="0.22"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5, 10"
            className="pointer-events-none animate-[dash_1s_linear_infinite]"
          />
        )}

        {isSelected && !isRunning && (
          <path
            d={pathData}
            stroke="#ffffff"
            strokeOpacity="0.18"
            strokeWidth="0.9"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none transition-opacity duration-300"
          />
        )}

        {(badgeText || connection.condition) && (
          <g
            transform={`translate(${midPoint.x}, ${midPoint.y})`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            className="cursor-pointer"
          >
            <rect
              x="-44"
              y="-12"
              width="88"
              height="24"
              rx="12"
              fill={theme.labelBg}
              stroke={
                isRunning
                  ? theme.gradientStart
                  : isSelected
                    ? 'rgba(129,140,248,0.55)'
                    : isHovered
                      ? 'rgba(148,163,184,0.22)'
                      : theme.labelBorder
              }
              strokeWidth="1"
              style={{
                filter:
                  isSelected || isRunning
                    ? `drop-shadow(0 0 8px ${theme.glow})`
                    : 'drop-shadow(0 4px 6px rgba(0,0,0,0.28))',
              }}
            />

            <text
              x="0"
              y="1"
              textAnchor="middle"
              dominantBaseline="middle"
              className="select-none text-[9.5px] font-medium tracking-wide pointer-events-none"
              fill={isSelected || isHovered || isRunning ? '#f8fafc' : theme.labelText}
            >
              {badgeText || (connection.condition ? 'Condition' : '')}
            </text>

            {connection.condition ? (
              <circle
                cx="33"
                cy="0"
                r="2.6"
                fill={theme.badgeDot}
                className={`transition-all duration-300 ${isRunning ? 'animate-pulse' : ''}`}
                style={{ filter: `drop-shadow(0 0 4px ${theme.badgeDot}AA)` }}
              />
            ) : null}
          </g>
        )}
      </g>

      {renderMenu}
    </>
  );
};

export default ConnectionLine;