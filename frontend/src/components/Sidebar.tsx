import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { useDrag } from 'react-dnd';
import { automationCategoriesWithLogos } from '../data/automationCategories';
import * as Icons from 'lucide-react';
import { ActionAvailability, WorkflowAction } from '../types/workflow';
import { getCategoryAvailability } from '../lib/actionAvailability';
import { motion, AnimatePresence } from 'framer-motion';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface DraggableActionProps {
  action: Omit<WorkflowAction, 'id' | 'x' | 'y'>;
  logo: string;
  availability: ActionAvailability;
  onDoubleClick: (action: Omit<WorkflowAction, 'id' | 'x' | 'y'>) => void;
}

type IconComponentType = React.ComponentType<{
  className?: string;
  strokeWidth?: number | string;
}>;

type LogoBadgeProps = {
  logo?: string;
  iconName?: string;
  sizeClassName?: string;
  iconClassName?: string;
  wrapperClassName?: string;
  imageClassName?: string;
};

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
//
// Surfaces (slate-tinted, low-glare):
//   canvas   #0A0F1B   raised #0C1422 / #0E1828   badge #121C30 → #0C1322
// Single accent: cyan. Borders are white at 5–10% so edges read soft, not harsh.

// Surface colour is written as a literal in every class below, on purpose.
// Tailwind's JIT scans source text statically, so an arbitrary value built from
// a template literal is emitted verbatim into the stylesheet and the real colour
// never reaches the DOM. Keeping the hex inline is what makes the sidebar
// actually paint #0A0F1B.

/** Shared keyboard-focus treatment for every interactive element. */
const FOCUS_RING =
  'outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40';

const colorMap: Record<
  string,
  { bg: string; icon: string; gradient: string; border: string; glow: string }
> = {
  blue: {
    bg: 'bg-blue-500/10',
    icon: 'text-blue-400',
    gradient: 'from-blue-500/20 to-transparent',
    border: 'border-blue-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.06)]',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    icon: 'text-indigo-400',
    gradient: 'from-indigo-500/20 to-transparent',
    border: 'border-indigo-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(99,102,241,0.06)]',
  },
  purple: {
    bg: 'bg-purple-500/10',
    icon: 'text-purple-400',
    gradient: 'from-purple-500/20 to-transparent',
    border: 'border-purple-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.06)]',
  },
  violet: {
    bg: 'bg-violet-500/10',
    icon: 'text-violet-400',
    gradient: 'from-violet-500/20 to-transparent',
    border: 'border-violet-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    icon: 'text-emerald-400',
    gradient: 'from-emerald-500/20 to-transparent',
    border: 'border-emerald-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.06)]',
  },
  teal: {
    bg: 'bg-teal-500/10',
    icon: 'text-teal-400',
    gradient: 'from-teal-500/20 to-transparent',
    border: 'border-teal-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(20,184,166,0.06)]',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    icon: 'text-cyan-400',
    gradient: 'from-cyan-500/20 to-transparent',
    border: 'border-cyan-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.06)]',
  },
  sky: {
    bg: 'bg-sky-500/10',
    icon: 'text-sky-400',
    gradient: 'from-sky-500/20 to-transparent',
    border: 'border-sky-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(14,165,233,0.06)]',
  },
  amber: {
    bg: 'bg-amber-500/10',
    icon: 'text-amber-400',
    gradient: 'from-amber-500/20 to-transparent',
    border: 'border-amber-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.06)]',
  },
  orange: {
    bg: 'bg-orange-500/10',
    icon: 'text-orange-400',
    gradient: 'from-orange-500/20 to-transparent',
    border: 'border-orange-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.06)]',
  },
  rose: {
    bg: 'bg-rose-500/10',
    icon: 'text-rose-400',
    gradient: 'from-rose-500/20 to-transparent',
    border: 'border-rose-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(244,63,94,0.06)]',
  },
  pink: {
    bg: 'bg-pink-500/10',
    icon: 'text-pink-400',
    gradient: 'from-pink-500/20 to-transparent',
    border: 'border-pink-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(236,72,153,0.06)]',
  },
  green: {
    bg: 'bg-green-500/10',
    icon: 'text-green-400',
    gradient: 'from-green-500/20 to-transparent',
    border: 'border-green-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.06)]',
  },
  red: {
    bg: 'bg-red-500/10',
    icon: 'text-red-400',
    gradient: 'from-red-500/20 to-transparent',
    border: 'border-red-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.06)]',
  },
  slate: {
    bg: 'bg-slate-500/10',
    icon: 'text-slate-400',
    gradient: 'from-slate-500/20 to-transparent',
    border: 'border-slate-500/20',
    glow: 'hover:shadow-[0_0_20px_rgba(148,163,184,0.04)]',
  },
};

// ─── PLUGIN LOGO RESOLUTION ───────────────────────────────────────────────────


const PLUGIN_LOGO_HINTS: Array<{ keywords: string[]; logo: string }> = [
  { keywords: ['microsoft-teams-010', 'microsoft teams', 'teams'], logo: 'teams.png' },
  { keywords: ['excel-automation-011', 'excel automation', 'excel'], logo: 'excel.png' },
  { keywords: ['google-drive-012', 'google drive', 'gdrive', 'drive'], logo: 'gdrive.png' },
  { keywords: ['onedrive-013', 'onedrive', 'one drive'], logo: 'onedrive.png' },
  { keywords: ['json-automation-014', 'json'], logo: 'json.png' },
  { keywords: ['xml-automation-015', 'xml'], logo: 'xml.png' },
  { keywords: ['google-sheets-042', 'sheet'], logo: 'google_sheets.png' },

  { keywords: ['outlook', 'email', 'mail', 'reply', 'forward', 'attachment'], logo: 'outlook.png' },
  { keywords: ['zoho desk', 'zohodesk'], logo: 'ZOHODESK.png' },
  { keywords: ['zoho'], logo: 'zoho.png' },
  { keywords: ['sharepoint', 'create folder'], logo: 'sharepoint.png' },
  { keywords: ['s3', 'bucket', 'aws s3', 'amazon s3', 'testconnection'], logo: 'S3.png' },
  { keywords: ['salesforce', 'sfdc', 'crm'], logo: 'salesforce.png' },
  { keywords: ['sap', 'erp'], logo: 'sap.png' },
  { keywords: ['pdf', 'adobe', 'document'], logo: 'pdf.png' },

  { keywords: ['chatgpt', 'openai'], logo: 'chatgpt.png' },
  { keywords: ['claude', 'anthropic'], logo: 'claude-ai.png' },
  { keywords: ['gemini', 'google ai'], logo: 'gemini-ai.png' },
  { keywords: ['grok', 'x ai', 'xai'], logo: 'grok.png' },
  { keywords: ['ai-bridge', 'ai bridge', 'ai package'], logo: 'ai.png' },

  { keywords: ['api', 'rest', 'http', 'request', 'webhook', 'call', 'login'], logo: 'api.png' },
  { keywords: ['docker', 'container'], logo: 'Docker.png' },
  { keywords: ['ec2', 'instance', 'aws ec2'], logo: 'EC2.png' },
  { keywords: ['jenkins', 'ci/cd', 'pipeline', 'build'], logo: 'jenkins.png' },
  { keywords: ['mongo', 'mongodb', 'database', 'get-documents'], logo: 'mongo-db.png' },
  { keywords: ['database-plugins-039', 'sql database', 'database plugin', 'sql'], logo: 'database_plugins.png' },
  { keywords: ['fast2sms', 'sms', 'message', 'send otp', 'send-otp'], logo: 'Fast2SMS.png' },
  { keywords: ['linux', 'ssh', 'sftp', 'shell', 'terminal', 'connect', 'commandexecution'], logo: 'linux.png' },
  { keywords: ['jumpcloud', 'list user', 'user'], logo: 'jumpclud.png' },
  { keywords: ['totp', 'mfa', 'auth', 'otp', '2fa', 'generate-totp'], logo: 'totp generator.png' },
  { keywords: ['ocr', 'scan', 'scanning', 'text', 'string', 'transform', 'regex'], logo: 'text.png' },
  { keywords: ['web-gui-016', 'web gui', 'webgui'], logo: 'webgui.png' },
  { keywords: ['file operation', 'file-operations', 'delete file', 'file'], logo: 'file-operations.png' },
  { keywords: ['asana', 'workspace', 'get-workspaces'], logo: 'asana.png' },
];

const FALLBACK_LOGO = 'api.png';

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value.toLowerCase().trim() : '';

const normalizeLogoName = (logo?: string): string => {
  const normalized = normalizeString(logo);
  if (normalized === 'asanaold.png') return 'asana.png';

  const aliases: Record<string, string> = {
    'database plugins': 'database_plugins.png',
    'database-plugins': 'database_plugins.png',
    'database_plugins': 'database_plugins.png',
    'data transform': 'data_transform.png',
    'data-transform': 'data_transform.png',
    'data_transform': 'data_transform.png',
    'vulnerability scanner': 'vulnerability_scanner.png',
    'vulnerability_scanner': 'vulnerability_scanner.png',
  };

  return aliases[normalized] ?? logo ?? FALLBACK_LOGO;
};

const resolveLogoFromText = (text: string): string => {
  const corpus = normalizeString(text);
  for (const hint of PLUGIN_LOGO_HINTS) {
    if (hint.keywords.some((kw) => corpus.includes(kw))) {
      return normalizeLogoName(hint.logo);
    }
  }
  return FALLBACK_LOGO;
};

const resolveCategoryLogo = (category: any): string => {
  const corpus = [
    category?.id,
    category?.name,
    category?.description,
    category?.metadata?.group,
    ...(category?.metadata?.tags || []),
  ]
    .map(normalizeString)
    .filter(Boolean)
    .join(' ');
  return resolveLogoFromText(corpus);
};

const getColorStyles = (colorStr?: string) => {
  const baseColor = colorStr?.includes('-') ? colorStr.split('-')[1] : colorStr;
  return colorMap[baseColor || ''] || colorMap.slate;
};

const getLucideIcon = (iconName?: string): IconComponentType => {
  if (!iconName) return Icons.Box as IconComponentType;
  return (Icons[iconName as keyof typeof Icons] || Icons.Box) as IconComponentType;
};

// ─── LOGO BADGE ───────────────────────────────────────────────────────────────

const LogoBadge: React.FC<LogoBadgeProps> = React.memo(
  ({
    logo,
    iconName,
    sizeClassName = 'w-8 h-8',
    iconClassName = 'w-3.5 h-3.5',
    wrapperClassName = 'rounded-[10px]',
    imageClassName =
      'p-[1px] scale-[1.02] brightness-110 saturate-[1.10] ' +
      'drop-shadow-[0_0_5px_rgba(226,232,240,0.20)] ' +
      '[image-rendering:-webkit-optimize-contrast]',
  }) => {
    const [hasError, setHasError] = useState(false);
    const Icon = getLucideIcon(iconName);

    useEffect(() => {
      setHasError(false);
    }, [logo, iconName]);

    const showImage = Boolean(logo) && !hasError;

    return (
      <div
        className={`
          ${sizeClassName}
          overflow-hidden shrink-0
          flex items-center justify-center
          bg-gradient-to-b from-[#18253C] to-[#09111F]
          ring-1 ring-inset ring-white/[0.12]
          shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_10px_rgba(2,6,23,0.50)]
          transition-all duration-200
          ${wrapperClassName}
        `}
      >
        {showImage ? (
          <img
            src={encodeURI(`/plugins/${logo}`)}
            alt=""
            className={`w-full h-full object-contain ${imageClassName}`}
            onError={() => setHasError(true)}
            draggable={false}
            loading="lazy"
          />
        ) : (
          <Icon className={`${iconClassName} text-slate-400`} strokeWidth={1.75} />
        )}
      </div>
    );
  }
);

// ─── DRAGGABLE ACTION ─────────────────────────────────────────────────────────

const DraggableAction: React.FC<DraggableActionProps> = React.memo(
  ({ action, logo, availability, onDoubleClick }) => {
    const unavailable = availability.state === 'unavailable';
    const unavailableReason = availability.reason || 'Backend connector not installed';

    const [{ isDragging }, drag, preview] = useDrag(
      () => ({
        type: 'action',
        item: action,
        canDrag: !unavailable,
        collect: (monitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [action, unavailable]
    );

    const [flashed, setFlashed] = useState(false);

    useEffect(() => {
      preview(null);
    }, [preview]);

    const handleDoubleClick = useCallback(() => {
      if (unavailable) return;
      setFlashed(true);
      setTimeout(() => setFlashed(false), 500);
      onDoubleClick(action);
    }, [action, onDoubleClick, unavailable]);

    const colors = getColorStyles(action.color);
    const actionIconName = action.icon as string | undefined;
    const packageLogo = normalizeLogoName(logo);

    return (
      <div
        ref={drag}
        role="button"
        tabIndex={unavailable ? -1 : 0}
        aria-disabled={unavailable}
        aria-label={
          unavailable
            ? `${action.name}. Unavailable: ${unavailableReason}`
            : `${action.name}. Drag or double-click to add to canvas`
        }
        title={unavailable ? unavailableReason : undefined}
        onDoubleClick={handleDoubleClick}
        className={`
          group relative flex w-full items-center gap-2.5 rounded-[10px]
          py-[7px] pl-2.5 pr-2 select-none text-left
          transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${FOCUS_RING}
          ${unavailable
            ? 'cursor-not-allowed opacity-55 bg-amber-400/[0.025] ring-1 ring-inset ring-amber-300/[0.10]'
            : flashed
              ? 'bg-cyan-400/[0.10] ring-1 ring-inset ring-cyan-400/30'
              : isDragging
                ? 'opacity-30 cursor-grabbing ring-1 ring-inset ring-white/[0.08] bg-white/[0.03]'
                : `cursor-grab active:cursor-grabbing hover:bg-white/[0.04] active:bg-white/[0.05] ${colors.glow}`
          }
        `}
      >
        {/* Accent bar — grows from center on hover */}
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-300/0 via-cyan-400/90 to-cyan-300/0 transition-all duration-200 ease-out group-hover:h-[58%]"
        />
        {/* Per-color wash */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-[10px] bg-gradient-to-r ${colors.gradient} opacity-0 transition-opacity duration-200 group-hover:opacity-[0.18]`}
        />

        <div className="shrink-0">
          <LogoBadge
            logo={packageLogo}
            iconName={actionIconName}
            sizeClassName="w-8 h-8"
            iconClassName="w-3 h-3"
            imageClassName="p-[1.5px] scale-[1.02] brightness-110 saturate-[1.08] drop-shadow-[0_0_5px_rgba(125,211,252,0.20)] [image-rendering:-webkit-optimize-contrast]"
            wrapperClassName="rounded-[9px] ring-white/[0.10] group-hover:ring-cyan-300/20 group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_9px_rgba(2,6,23,0.52),0_0_9px_rgba(34,211,238,0.06)] transition-all duration-150"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium tracking-[-0.01em] text-slate-200 transition-colors duration-150 group-hover:text-white">
              {action.name}
            </span>
            {unavailable ? (
              <span className="shrink-0 rounded-[4px] border border-amber-300/20 bg-amber-300/[0.08] px-[5px] py-[1.5px] text-[8px] font-bold uppercase leading-none tracking-[0.08em] text-amber-200">
                Unavailable
              </span>
            ) : action.badge === 'new' ? (
              <span className="shrink-0 rounded-[4px] border border-cyan-400/25 bg-cyan-400/[0.08] px-[5px] py-[1.5px] text-[8px] font-bold uppercase leading-none tracking-[0.08em] text-cyan-300">
                New
              </span>
            ) : null}
          </div>
          <p className="mt-[3px] truncate text-[10.5px] leading-none text-slate-500 transition-colors duration-150 group-hover:text-slate-400">
            {action.description}
          </p>
        </div>

        {unavailable ? (
          <Icons.Lock
            className="h-3.5 w-3.5 shrink-0 text-amber-300/55"
            aria-hidden="true"
          />
        ) : (
          <Icons.GripVertical className="h-3.5 w-3.5 shrink-0 -translate-x-0.5 text-slate-600 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-60" />
        )}

        {/* Dwell hint — fades in after the pointer rests on the row */}
        <div
          role="tooltip"
          className="
            pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50
            -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg
            border border-white/[0.08] bg-[#101A2C]/95 px-2.5 py-1.5
            text-[10px] font-medium text-slate-300
            shadow-[0_12px_32px_rgba(2,6,23,0.6)] backdrop-blur-sm
            opacity-0 transition-all duration-150 delay-0
            group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-500
          "
        >
          <span className="flex items-center gap-1.5">
            {unavailable ? (
              <>
                <Icons.Lock className="h-2.5 w-2.5 text-amber-300/80" />
                <span>{unavailableReason}</span>
              </>
            ) : (
              <>
                <Icons.MousePointerClick className="h-2.5 w-2.5 text-cyan-400/80" />
                <span>
                  Drag or <strong className="font-semibold text-slate-100">double-click</strong> to add
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    );
  }
);

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      document.addEventListener('mousedown', handleClick);
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05080F]/70 backdrop-blur-[6px]">
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-settings-title"
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-[380px] overflow-hidden rounded-2xl bg-gradient-to-b from-[#0E1626] to-[#0A101C] ring-1 ring-inset ring-white/[0.08] shadow-[0_32px_80px_rgba(2,6,23,0.7),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-b from-[#121C30] to-[#0C1322] ring-1 ring-inset ring-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <Icons.Settings className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
            </div>
            <div>
              <h3 id="workspace-settings-title" className="text-[13px] font-semibold tracking-[-0.02em] text-slate-100">
                Workspace Settings
              </h3>
              <p className="mt-px text-[10.5px] text-slate-500">Customize your experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className={`rounded-lg p-1.5 text-slate-500 transition-colors duration-150 hover:bg-white/[0.05] hover:text-slate-200 ${FOCUS_RING}`}
          >
            <Icons.X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="block pl-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  aria-pressed={theme === t}
                  className={`flex items-center gap-2.5 rounded-xl p-3 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${FOCUS_RING}
                    ${theme === t
                      ? 'bg-cyan-400/[0.07] ring-1 ring-inset ring-cyan-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'bg-white/[0.02] ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.04] hover:ring-white/[0.10]'
                    }`}
                >
                  {t === 'light'
                    ? <Icons.Sun className={`h-3.5 w-3.5 ${theme === 'light' ? 'text-cyan-300' : 'text-slate-500'}`} strokeWidth={1.75} />
                    : <Icons.Moon className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-cyan-300' : 'text-slate-500'}`} strokeWidth={1.75} />
                  }
                  <span className={`text-[12px] font-medium ${theme === t ? 'text-cyan-100' : 'text-slate-400'}`}>
                    {t === 'light' ? 'Light' : 'Dark'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.05] px-5 py-3.5">
          <button
            onClick={onClose}
            className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium text-slate-400 transition-all duration-150 hover:bg-white/[0.04] hover:text-slate-200 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className={`rounded-lg bg-cyan-500 px-4 py-1.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-cyan-400 active:scale-[0.97] shadow-[0_4px_16px_rgba(6,182,212,0.20),inset_0_1px_0_rgba(255,255,255,0.15)] ${FOCUS_RING}`}
          >
            Save changes
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── SIDEBAR PROPS ────────────────────────────────────────────────────────────

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onNavigateToDirectory?: () => void;
  onAddToCanvas?: (action: Omit<WorkflowAction, 'id' | 'x' | 'y'>) => void;
  className?: string;
}

// ─── COLLAPSED SIDEBAR ────────────────────────────────────────────────────────

const CollapsedSidebar: React.FC<{
  onToggle: () => void;
  onSearch: () => void;
  onNavigateToDirectory?: () => void;
}> = ({ onToggle, onSearch, onNavigateToDirectory }) => (
  <div className={`flex h-full w-[52px] flex-col items-center gap-1 border-r border-white/[0.05] bg-[#0A0F1B] pb-3 pt-4`}>
    {/* Directory back button — collapsed state: just an arrow icon */}
    {onNavigateToDirectory && (
      <button
        onClick={onNavigateToDirectory}
        title="Back to Directory"
        aria-label="Back to Directory"
        className={`group mb-1 flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-500 transition-all duration-150 hover:bg-cyan-400/[0.07] hover:text-cyan-300 active:scale-95 ${FOCUS_RING}`}
      >
        <Icons.ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" strokeWidth={1.75} />
      </button>
    )}

    {/* Library mark */}
    <div className="mb-2 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-gradient-to-b from-cyan-400/[0.14] to-cyan-400/[0.04] ring-1 ring-inset ring-cyan-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <Icons.Layers className="h-3.5 w-3.5 text-cyan-300" strokeWidth={1.75} />
    </div>
    <div className="mb-1 h-px w-[26px] rounded-full bg-white/[0.06]" />

    <CollapsedIconBtn onClick={onToggle} title="Expand Library" icon={Icons.PanelLeftOpen} />
    <CollapsedIconBtn onClick={onSearch} title="Search (⌘F)" icon={Icons.Search} />
  </div>
);

const CollapsedIconBtn: React.FC<{ onClick: () => void; title: string; icon: IconComponentType }> = ({
  onClick, title, icon: Icon
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`group flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-500 transition-all duration-150 hover:bg-white/[0.05] hover:text-slate-200 active:scale-95 ${FOCUS_RING}`}
  >
    <Icon className="h-3.5 w-3.5 transition-transform duration-150 group-hover:scale-105" strokeWidth={1.75} />
  </button>
);

// ─── CATEGORY ROW ─────────────────────────────────────────────────────────────

interface CategoryRowProps {
  category: any;
  isExpanded: boolean;
  isSearching: boolean;
  onToggle: () => void;
  categoryLogo: string;
  onAddToCanvas: (action: Omit<WorkflowAction, 'id' | 'x' | 'y'>) => void;
}

const CategoryRow: React.FC<CategoryRowProps> = React.memo(({
  category, isExpanded, isSearching, onToggle, categoryLogo, onAddToCanvas
}) => {
  const categoryIconName = (category as any).icon as string | undefined;
  const hasActions = category.actions.length > 0;
  const disabled = !hasActions && isSearching;
  const availability = getCategoryAvailability(category);
  const unavailable = availability.state === 'unavailable';
  const unavailableReason = availability.reason || 'Backend connector not installed';

  return (
    <div className="relative">
      <div className={`sticky top-0 z-10 bg-[#0A0F1B]/95 px-2 pb-0.5 pt-1 backdrop-blur-md`}>
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-expanded={isExpanded}
          aria-label={
            unavailable
              ? `${category.name}. Unavailable: ${unavailableReason}`
              : category.name
          }
          title={unavailable ? unavailableReason : undefined}
          className={`
            group flex w-full items-center justify-between rounded-[9px] px-2 py-[7px]
            select-none text-left transition-colors duration-150
            ${FOCUS_RING}
            ${disabled
              ? 'opacity-25 cursor-not-allowed'
              : 'cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05]'
            }
          `}
        >
          <div className="flex min-w-0 items-center gap-2">
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
            >
              <Icons.ChevronRight className="h-3 w-3 text-slate-600 transition-colors duration-150 group-hover:text-slate-400" strokeWidth={2.25} />
            </motion.span>
            <LogoBadge
              logo={categoryLogo}
              iconName={categoryIconName}
              sizeClassName="w-6 h-6"
              iconClassName="w-3.5 h-3.5"
              imageClassName="p-[1.25px] scale-[1.02] brightness-110 saturate-[1.08] drop-shadow-[0_0_4px_rgba(226,232,240,0.15)] [image-rendering:-webkit-optimize-contrast]"
              wrapperClassName="rounded-[7px] ring-white/[0.09] group-hover:ring-cyan-300/16 transition-all duration-150"
            />
            <div className="min-w-0 flex-1">
              <span
                className={`block truncate text-[11.5px] font-semibold tracking-[-0.005em] transition-colors duration-150 group-hover:text-slate-200
                  ${isExpanded ? 'text-slate-300' : 'text-slate-500'}`}
              >
                {category.name}
              </span>
              {unavailable && (
                <span className="mt-0.5 block truncate text-[8.5px] font-medium leading-none text-amber-200/65">
                  {unavailableReason}
                </span>
              )}
            </div>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-1.5">
            {unavailable && (
              <span className="rounded-md bg-amber-300/[0.08] px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.08em] text-amber-200 ring-1 ring-inset ring-amber-300/15">
                Unavailable
              </span>
            )}
            <span
              className={`shrink-0 rounded-md px-1.5 py-[2px] text-[9.5px] font-semibold tabular-nums leading-none ring-1 ring-inset transition-colors duration-150
                ${isExpanded
                  ? 'bg-cyan-400/[0.08] text-cyan-300/90 ring-cyan-400/15'
                  : 'bg-white/[0.03] text-slate-600 ring-white/[0.05] group-hover:text-slate-400'
                }`}
            >
              {category.actions.length}
            </span>
          </div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && hasActions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {/* Guide thread connecting the group's actions */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[23px] w-px bg-gradient-to-b from-white/[0.10] via-white/[0.05] to-transparent"
              style={{ top: 40, bottom: 10 }}
            />
            <div
              className="flex flex-col gap-[2px] pb-2.5 pt-0.5"
              style={{ paddingLeft: '32px', paddingRight: '8px' }}
            >
              {category.actions.map((action: any, index: number) => (
                <DraggableAction
                  key={`${action.type}-${index}`}
                  action={action}
                  logo={normalizeLogoName(action.logo || categoryLogo)}
                  availability={availability}
                  onDoubleClick={onAddToCanvas}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── MAIN SIDEBAR ─────────────────────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  onNavigateToDirectory,
  onAddToCanvas,
  className = '',
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['data-entry-001', 'email-processing-002'])
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && searchTerm) {
        setSearchTerm('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm]);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const handleAddToCanvas = useCallback(
    (action: Omit<WorkflowAction, 'id' | 'x' | 'y'>) => {
      onAddToCanvas?.(action);
    },
    [onAddToCanvas]
  );

  const filteredCategories = useMemo(() => {
    const searchTerms = searchTerm.toLowerCase().split(' ').filter(Boolean);

    return automationCategoriesWithLogos
      .map((category: any) => {
        const categoryString = [
          category.name,
          category.description,
          category.metadata?.group,
          ...(category.metadata?.tags || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const categoryMatches = searchTerms.every((t) => categoryString.includes(t));

        const actions = category.actions.filter((action: any) => {
          if (searchTerms.length === 0) return true;
          const actionString = [
            action.name,
            action.description,
            action.type,
            ...(Array.isArray(action.tags) ? action.tags : []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchTerms.every((t) => actionString.includes(t));
        });

        if (searchTerm && !categoryMatches && actions.length === 0) return null;

        return {
          ...category,
          actions,
          logo: normalizeLogoName(category.logo || resolveCategoryLogo(category)),
        };
      })
      .filter(Boolean) as Array<(typeof automationCategoriesWithLogos)[number] & { logo: string }>;
  }, [searchTerm]);

  const totalActions = useMemo(
    () => filteredCategories.reduce((s, c) => s + c.actions.length, 0),
    [filteredCategories]
  );

  if (isCollapsed) {
    return (
      <CollapsedSidebar
        onToggle={onToggle}
        onSearch={() => { onToggle(); setTimeout(() => searchRef.current?.focus(), 300); }}
        onNavigateToDirectory={onNavigateToDirectory}
      />
    );
  }

  return (
    <>
      <div
        className={`relative flex h-full w-[286px] flex-col border-r border-white/[0.05] bg-[#0A0F1B] ${className}`}
      >
        {/* Ambient top sheen + right edge glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-400/[0.025] to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-px bg-gradient-to-b from-transparent via-white/[0.05] to-transparent" aria-hidden="true" />

        {/* ── Header ── */}
        <div className="relative shrink-0 border-b border-white/[0.05] px-3 pb-3 pt-3">

          {/* Top row: Directory button + collapse */}
          <div className="mb-3 flex items-center justify-between">
            {/* Directory back button */}
            {onNavigateToDirectory ? (
              <button
                onClick={onNavigateToDirectory}
                className={`
                  group flex h-7 items-center gap-1.5 rounded-lg px-2.5
                  bg-white/[0.02] ring-1 ring-inset ring-white/[0.06]
                  transition-all duration-200
                  hover:bg-cyan-400/[0.06] hover:ring-cyan-400/25
                  active:bg-cyan-400/[0.09]
                  ${FOCUS_RING}
                `}
              >
                <Icons.ArrowLeft
                  className="h-3 w-3 text-slate-500 transition-all duration-200 group-hover:-translate-x-0.5 group-hover:text-cyan-300"
                  strokeWidth={2}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition-colors duration-200 group-hover:text-cyan-300">
                  Directory
                </span>
              </button>
            ) : (
              /* Placeholder so collapse button stays right-aligned even without the directory prop */
              <div />
            )}

            {/* Collapse button */}
            <HeaderIconBtn
              onClick={onToggle}
              title="Collapse sidebar"
              icon={Icons.PanelLeftClose}
            />
          </div>

          {/* Bottom row: Library identity */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-b from-cyan-400/[0.14] to-cyan-400/[0.04] ring-1 ring-inset ring-cyan-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Icons.Layers className="h-3.5 w-3.5 text-cyan-300" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold leading-none tracking-[-0.02em] text-slate-100">
                Action Library
              </h2>
              <p className="mt-[4px] truncate text-[10px] leading-none text-slate-500">
                {searchTerm
                  ? `${totalActions} result${totalActions !== 1 ? 's' : ''} found`
                  : 'Drag or double-click to add'
                }
              </p>
            </div>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="shrink-0 border-b border-white/[0.05] px-3 py-2.5">
          <div
            role="search"
            className={`
              relative flex items-center rounded-[10px] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
              ${searchFocused
                ? 'bg-[#0E1828] ring-1 ring-cyan-400/35 shadow-[0_0_0_3px_rgba(34,211,238,0.06),inset_0_1px_0_rgba(255,255,255,0.04)]'
                : 'bg-[#0C1422] ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:ring-white/[0.10]'
              }
            `}
          >
            <Icons.Search
              className={`pointer-events-none absolute left-3 h-3.5 w-3.5 transition-colors duration-200 ${
                searchFocused ? 'text-cyan-300' : 'text-slate-600'
              }`}
              strokeWidth={2}
            />
            <input
              ref={searchRef}
              type="text"
              aria-label="Search actions"
              placeholder="Search actions…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full bg-transparent py-2 pl-[30px] pr-9 text-[11.5px] tracking-tight text-slate-200 placeholder-slate-600 outline-none"
            />
            <AnimatePresence mode="wait">
              {searchTerm ? (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                  className={`absolute right-2 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 ${FOCUS_RING}`}
                >
                  <Icons.X className="h-3 w-3" strokeWidth={2.5} />
                </motion.button>
              ) : (
                <motion.div
                  key="badge"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="pointer-events-none absolute right-2.5"
                >
                  <kbd aria-hidden="true" className={`rounded-md border border-white/[0.06] bg-[#0A0F1B] px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wider text-slate-600`}>
                    ⌘F
                  </kbd>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Categories List ── */}
        <div className="sidebar-scroll flex-1 overflow-y-auto overscroll-contain">
          <div className="py-1">
            {filteredCategories.map((category) => {
              const isExpanded = searchTerm ? true : expandedCategories.has(category.id);
              const categoryLogo = normalizeLogoName(category.logo || resolveCategoryLogo(category));

              return (
                <CategoryRow
                  key={category.id}
                  category={category}
                  isExpanded={isExpanded}
                  isSearching={Boolean(searchTerm)}
                  onToggle={() => toggleCategory(category.id)}
                  categoryLogo={categoryLogo}
                  onAddToCanvas={handleAddToCanvas}
                />
              );
            })}

            <AnimatePresence>
              {searchTerm && filteredCategories.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center justify-center px-6 py-14 text-center"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#121C30] to-[#0C1322] ring-1 ring-inset ring-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <Icons.SearchX className="h-[18px] w-[18px] text-slate-500" strokeWidth={1.5} />
                  </div>
                  <p className="mb-1 text-[12.5px] font-semibold tracking-[-0.01em] text-slate-300">
                    No results found
                  </p>
                  <p className="max-w-[170px] text-[10.5px] leading-relaxed text-slate-500">
                    No actions matched "{searchTerm}"
                  </p>
                  <button
                    onClick={() => setSearchTerm('')}
                    className={`mt-4 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-inset ring-white/[0.06] transition-all duration-150 hover:bg-white/[0.06] hover:text-slate-200 hover:ring-white/[0.10] active:scale-95 ${FOCUS_RING}`}
                  >
                    Clear search
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className={`pointer-events-none sticky bottom-0 h-6 bg-gradient-to-t from-[#0A0F1B] to-transparent`} aria-hidden="true" />
        </div>
      </div>

      <style>{`
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(148,163,184,0.10);
          border-radius: 99px;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(148,163,184,0.22);
        }
        .sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(148,163,184,0.12) transparent;
        }
        @media (prefers-reduced-motion: reduce) {
          .sidebar-scroll * { transition-duration: 0.01ms !important; }
        }
      `}</style>
    </>
  );
};

// ─── SMALL UTILITY ────────────────────────────────────────────────────────────

const HeaderIconBtn: React.FC<{ onClick: () => void; title: string; icon: IconComponentType }> = ({
  onClick, title, icon: Icon
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`group rounded-lg p-1.5 text-slate-500 transition-all duration-150 hover:bg-white/[0.05] hover:text-slate-200 active:scale-95 ${FOCUS_RING}`}
  >
    <Icon className="h-3.5 w-3.5 transition-transform duration-150 group-hover:scale-105" strokeWidth={1.75} />
  </button>
);

export default Sidebar;