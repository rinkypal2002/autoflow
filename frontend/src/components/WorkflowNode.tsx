import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Icons from 'lucide-react';
import { getOutputPorts } from '../lib/ports';
import type { OutputPort } from '../types/pluginContract';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

export const NODE_WIDTH = 56;
export const NODE_HEIGHT = 56;

/** Shared corner radius for the node body + status ring so they always align. */
const NODE_RADIUS = 18;


// ─────────────────────────────────────────────
// Injected styles (keyframes + pseudo-states)
//
// Inline styles can't express :hover / :focus-visible / @keyframes,
// so a single shared <style> tag is injected once per document.
// Purely presentational — no behavioral impact.
// ─────────────────────────────────────────────

const WFN_STYLE_ID = 'workflow-node-styles';

const WFN_CSS = `
@keyframes wfn-ring-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes wfn-ping {
  0% { transform: scale(1); opacity: 0.85; }
  75%, 100% { transform: scale(2.3); opacity: 0; }
}
@keyframes wfn-menu-in {
  from { opacity: 0; transform: scale(0.97) translateY(-3px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.wfn-menu {
  animation: wfn-menu-in 0.13s cubic-bezier(0.2, 0.8, 0.3, 1);
}
.wfn-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 7px 9px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  font-family: inherit;
  color: #e2e8f0;
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.wfn-menu-item:hover { background: rgba(148, 163, 184, 0.10); }
.wfn-menu-item:active { background: rgba(148, 163, 184, 0.16); }
.wfn-menu-item:focus-visible {
  background: rgba(148, 163, 184, 0.12);
  box-shadow: inset 0 0 0 1.5px rgba(148, 163, 184, 0.35);
}
.wfn-menu-item.wfn-danger { color: #fda4af; }
.wfn-menu-item.wfn-danger:hover { background: rgba(244, 63, 94, 0.12); color: #fecdd3; }
.wfn-menu-item.wfn-danger:focus-visible {
  background: rgba(244, 63, 94, 0.14);
  box-shadow: inset 0 0 0 1.5px rgba(244, 63, 94, 0.40);
}
.wfn-rename {
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.wfn-rename:focus {
  border-color: var(--wfn-accent, #38bdf8);
  box-shadow: 0 0 0 3px var(--wfn-accent-soft, rgba(56, 189, 248, 0.18)),
              0 10px 24px rgba(2, 6, 23, 0.55);
}
.wfn-rename::placeholder { color: #64748b; }
@media (prefers-reduced-motion: reduce) {
  .wfn-menu { animation: none; }
}
`;

const ensureNodeStyles = (): void => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(WFN_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = WFN_STYLE_ID;
  el.textContent = WFN_CSS;
  document.head.appendChild(el);
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type WorkflowStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'disabled';

type AccentKey =
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'orange'
  | 'slate';

interface WorkflowAction {
  id?: string;
  x?: number;
  y?: number;
  type?: string;
  category?: string;
  name?: string;
  description?: string;
  tags?: string[];
  /** Optional explicit logo filename override, e.g. "teams.png" */
  logo?: string;
  status?: WorkflowStatus;
  [key: string]: any;
}

interface WorkflowNodeProps {
  id?: string;
  action: WorkflowAction;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onStartConnection?: (nodeId: string, portId?: string | null) => void;
  onCompleteConnection?: (targetId: string) => void;
  onRename?: (id: string, newName: string) => void;
  onDuplicate?: (id: string) => void;
  isSelected?: boolean;
  isRunning?: boolean;
  isConnecting?: boolean;
  isInvalid?: boolean;
  zoomLevel?: number;
  gridSize?: number;

  /** Debugger: a breakpoint is set on this node. */
  hasBreakpoint?: boolean;
  /** Debugger: the breakpoint exists but is switched off. */
  breakpointDisabled?: boolean;
  /** Debugger: the run is currently parked before this node. */
  isPausedHere?: boolean;
  onToggleBreakpoint?: (nodeId: string) => void;
}

// ─────────────────────────────────────────────
// Plugin descriptor — all visual config per plugin
// ─────────────────────────────────────────────

interface PluginDescriptor {
  logo: string;
  color: AccentKey;
  size: number;
  filter: string;
  transform: string;
}

// ─────────────────────────────────────────────
// Accent palette
// ─────────────────────────────────────────────

const ACCENT: Record<AccentKey, { border: string; glow: string; dot: string }> = {
  sky:     { border: '#38bdf8', glow: 'rgba(56,189,248,0.18)',   dot: '#38bdf8' },
  emerald: { border: '#34d399', glow: 'rgba(52,211,153,0.18)',   dot: '#34d399' },
  amber:   { border: '#fbbf24', glow: 'rgba(251,191,36,0.18)',   dot: '#fbbf24' },
  violet:  { border: '#a78bfa', glow: 'rgba(167,139,250,0.18)', dot: '#a78bfa' },
  rose:    { border: '#fb7185', glow: 'rgba(251,113,133,0.18)', dot: '#fb7185' },
  orange:  { border: '#fb923c', glow: 'rgba(251,146,60,0.18)',  dot: '#fb923c' },
  slate:   { border: '#64748b', glow: 'rgba(148,163,184,0.14)', dot: '#94a3b8' },
};


// ─────────────────────────────────────────────
// Brand ring helpers
// ─────────────────────────────────────────────

const BRAND_RING: Record<string, string[]> = {
  'teams.png': ['#6264A7', '#5B9BD5', '#E94B8A', '#2EB67D'],
  'excel.png': ['#1D6F42', '#21A366', '#107C41', '#7FBA00'],
  'onedrive.png': ['#094AB2', '#2B88D8', '#00A4EF', '#8CCBFF'],
  'sharepoint.png': ['#0078D4', '#00A4EF', '#7FBA00', '#50E6FF'],
  'S3.png': ['#FF9900', '#F58536', '#F59E0B', '#E36D00'],
  'EC2.png': ['#FF9900', '#F5A623', '#F59E0B', '#FFD166'],
  'Docker.png': ['#2496ED', '#0DB7ED', '#37A0D6', '#5BC0EB'],
  'linux.png': ['#FCC624', '#F59E0B', '#111827', '#FFFFFF'],
  'jumpclud.png': ['#0EA5E9', '#14B8A6', '#8B5CF6', '#22C55E'],
  'asana.png': ['#F06A6A', '#F7A61F', '#3AB4F2', '#6959CD'],
  'Fast2SMS.png': ['#FF6B6B', '#F59E0B', '#22C55E', '#38BDF8'],
  'totp generator.png': ['#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B'],
  'sftp.png': ['#F59E0B', '#8B5CF6', '#EC4899', '#22C55E'],
  'mongo-db.png': ['#4DB33D', '#3FA037', '#13AA52', '#A3E635'],
  'jenkins.png': ['#D24939', '#FBBC05', '#F97316', '#1F2937'],
  'salesforce.png': ['#00A1E0', '#00C4FF', '#B2E3F7', '#3B82F6'],
  'sap.png': ['#0FAAFF', '#00C4FF', '#8CCCF8', '#1D4ED8'],
  'pdf.png': ['#F40F02', '#FF6A00', '#FFC400', '#FB7185'],
  'json.png': ['#8B5CF6', '#A78BFA', '#60A5FA', '#22D3EE'],
  'xml.png': ['#6366F1', '#22D3EE', '#A78BFA', '#38BDF8'],
  'ZOHODESK.png': ['#F97316', '#EF4444', '#F59E0B', '#22C55E'],
  'zoho.png': ['#F59E0B', '#F97316', '#EF4444', '#22C55E'],
  'webgui.png': ['#8B5CF6', '#38BDF8', '#60A5FA', '#22C55E'],
  'outlook.png': ['#0078D4', '#00A4EF', '#5B9BD5', '#38BDF8'],
  'gdrive.png': ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
  'file-operations.png': ['#94A3B8', '#64748B', '#CBD5E1', '#E2E8F0'],
  'text.png': ['#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0'],
  'ai.png': ['#8B5CF6', '#EC4899', '#06B6D4', '#60A5FA'],
  'adobe.png': ['#E53E3E', '#FF0000', '#C62828', '#FB7185'],
  'ai-agent.png': ['#8B5CF6', '#06B6D4', '#60A5FA', '#F59E0B'],
  'chatbot.png': ['#0EA5E9', '#8B5CF6', '#22C55E', '#F59E0B'],
  'chatgpt.png': ['#10A37F', '#34D399', '#0F766E', '#6EE7B7'],
  'claude-ai.png': ['#FF8C42', '#FB923C', '#F97316', '#FDBA74'],
  'gemini-ai.png': ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
  'grok.png': ['#111827', '#4B5563', '#E5E7EB', '#8B5CF6'],
  'java.png': ['#5382A1', '#F97316', '#F59E0B', '#EF4444'],
  'javascript.png': ['#F7DF1E', '#F59E0B', '#FACC15', '#111827'],
  'logo.png': ['#F97316', '#22C55E', '#3B82F6', '#A855F7'],
  'python.png': ['#3776AB', '#FFD43B', '#306998', '#4B8BBE'],
  'sql.png': ['#00758F', '#2DD4BF', '#38BDF8', '#94A3B8'],
  'windows-management.png': ['#0078D4', '#2B88D8', '#00A4EF', '#7FBA00'],
  'workflow_control.png': ['#64748B', '#38BDF8', '#A78BFA', '#34D399'],
  'start.png': ['#10B981', '#34D399', '#6EE7B7', '#22C55E'],
  'end.png': ['#F43F5E', '#FB7185', '#E11D48', '#FDA4AF'],
  'for_each.png': ['#6366F1', '#818CF8', '#A78BFA', '#38BDF8'],
  'while.png': ['#06B6D4', '#22D3EE', '#38BDF8', '#0EA5E9'],
  'repeat_until.png': ['#8B5CF6', '#A78BFA', '#C084FC', '#6366F1'],
  'break.png': ['#F59E0B', '#FBBF24', '#FB923C', '#F97316'],
  'continue.png': ['#0EA5E9', '#38BDF8', '#22D3EE', '#60A5FA'],
};

/**
 * Resolve the conic-gradient brand-ring colours for a logo.
 * Lookup is case-insensitive so mixed-case asset names
 * (S3.png, EC2.png, Docker.png, Fast2SMS.png, ZOHODESK.png, jumpclud.png …)
 * still match their BRAND_RING entry instead of falling back to the default.
 */
const getBrandRing = (logo: string): string[] => {
  const target = normalizeLogoName(logo).toLowerCase();
  const match = Object.keys(BRAND_RING).find((k) => k.toLowerCase() === target);
  if (match && BRAND_RING[match]?.length) return BRAND_RING[match];

  // Keep generated action packs visually grouped by package.
  if (target === 'database_plugins.png' || target.startsWith('db_')) {
    return ['#22d3ee', '#34d399', '#38bdf8', '#2dd4bf'];
  }

  if (
    target === 'data_transform.png' ||
    [
      'select_columns',
      'rename_columns',
      'add_column',
      'split_column',
      'merge_columns',
      'text_operation',
      'replace_values',
      'fill_empty_values',
      'convert_types',
      'calculated_column',
      'filter_rows',
      'sort_rows',
      'remove_duplicates',
      'add_sequence',
      'group_aggregate',
      'join_datasets',
      'lookup',
      'union_datasets',
      'pivot',
      'unpivot',
      'validate_rows',
      'profile_dataset',
      'transformation_pipeline',
    ].some((prefix) => target.startsWith(prefix))
  ) {
    return ['#a78bfa', '#22d3ee', '#60a5fa', '#c084fc'];
  }

  if (
    target === 'vulnerability_scanner.png' ||
    target.includes('vulnerability') ||
    target.includes('report_input')
  ) {
    return ['#22d3ee', '#3b82f6', '#34d399', '#a78bfa'];
  }

  return [ACCENT.sky.border, ACCENT.violet.border, ACCENT.emerald.border, ACCENT.amber.border];
};

// ─────────────────────────────────────────────
// Shared glow presets
// ─────────────────────────────────────────────

const GLOW = {
  pink:    'drop-shadow(0 0 12px rgba(255,120,170,0.60))',
  blue:    'drop-shadow(0 0 12px rgba(80,180,255,0.55))',
  cyan:    'drop-shadow(0 0 12px rgba(80,220,255,0.45))',
  orange:  'drop-shadow(0 0 10px rgba(255,120,80,0.45))',
  gold:    'drop-shadow(0 0 10px rgba(255,170,0,0.45))',
  sky:     'drop-shadow(0 0 10px rgba(56,189,248,0.45))',
  emerald: 'drop-shadow(0 0 10px rgba(52,211,153,0.45))',
  violet:  'drop-shadow(0 0 10px rgba(167,139,250,0.45))',
  rose:    'drop-shadow(0 0 10px rgba(251,113,133,0.45))',
  generic: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',

  // Action-specific 48×48 PNG assets already contain their own dark tile.
  // Lift brightness and saturation slightly so their symbols remain visible
  // against the dark workflow canvas.
  actionAsset:
    'brightness(1.12) saturate(1.10) drop-shadow(0 0 7px rgba(226,232,240,0.24))',
} as const;

// ─────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────

/** Lowercase + trim a value. */
const norm = (v: unknown): string =>
  typeof v === 'string' ? v.toLowerCase().trim() : '';


/**
 * Normalize logo filenames to the actual assets present in /public/plugins.
 * Keeps valid names as-is and remaps known typos / legacy variants.
 */
const normalizeLogoName = (logo?: string): string => {
  const value = norm(logo);
  if (!value) return 'api.png';

  const aliases: Record<string, string> = {
    // JumpCloud — the real asset filename is "jumpclud.png" (missing the second 'o').
    'jumpclud': 'jumpclud.png',
    'jumpclud.png': 'jumpclud.png',
    'jumpcloud': 'jumpclud.png',
    'jumpcloud.png': 'jumpclud.png',
    'windows-management': 'windows-management.png',
    'windows-management.png': 'windows-management.png',
    'windows-manag ement': 'windows-management.png',
    'windows-manag ement.png': 'windows-management.png',
    'totp generator': 'totp generator.png',
    'totp generator.png': 'totp generator.png',
    'file operations': 'file-operations.png',
    'file-operations': 'file-operations.png',
    'file-operations.png': 'file-operations.png',
    'gdrive': 'gdrive.png',
    'google drive': 'gdrive.png',
    'onedrive': 'onedrive.png',
    'one drive': 'onedrive.png',
    'sharepoint': 'sharepoint.png',
    // AWS S3 — the real asset filename is "S3.png" (uppercase, case-sensitive on Linux).
    's3': 'S3.png',
    'ec2': 'EC2.png',
    'docker': 'Docker.png',
    'teams': 'teams.png',
    'excel': 'excel.png',
    'outlook': 'outlook.png',
    'pdf': 'pdf.png',
    'json': 'json.png',
    'xml': 'xml.png',
    'zoho': 'zoho.png',
    'zohodesk': 'ZOHODESK.png',
    'webgui': 'webgui.png',
    'text': 'text.png',
    'ai': 'ai.png',
    'api': 'api.png',
    'adobe': 'adobe.png',
    'salesforce': 'salesforce.png',
    'sap': 'sap.png',
    'linux': 'linux.png',
    'sftp': 'sftp.png',
    'mongo-db': 'mongo-db.png',
    'mongodb': 'mongo-db.png',
    'jenkins': 'jenkins.png',
    'fast2sms': 'Fast2SMS.png',
    'python': 'python.png',
    'javascript': 'javascript.png',
    'java': 'java.png',
    'sql': 'sql.png',

    // Enterprise package assets.
    'database plugins': 'database_plugins.png',
    'database-plugins': 'database_plugins.png',
    'database_plugins': 'database_plugins.png',
    'database_plugins.png': 'database_plugins.png',
    'data transform': 'data_transform.png',
    'data-transform': 'data_transform.png',
    'data_transform': 'data_transform.png',
    'data_transform.png': 'data_transform.png',
    'vulnerability scanner': 'vulnerability_scanner.png',
    'vulnerability_scanner': 'vulnerability_scanner.png',
    'vulnerability_scanner.png': 'vulnerability_scanner.png',
  };

  return aliases[value] ?? value;
};

/**
 * Tokenise a string into individual segments by splitting on
 * spaces, hyphens, underscores, slashes, and dots.
 * e.g. "sftp/connect/test" → ["sftp","connect","test"]
 *      "generate-totp"     → ["generate","totp"]
 *      "Read Cell"         → ["read","cell"]
 */
const tokenise = (s: string): string[] =>
  s.split(/[\s_./-]+/).filter(Boolean);

/** Normalised corpus built from all action fields. */
interface Corpus {
  /** Raw joined string for substring checks (multi-word phrases). */
  raw: string;
  /** Individual tokens for exact-token checks (hyphenated slugs). */
  tokens: Set<string>;
}

const buildCorpus = (action: WorkflowAction): Corpus => {
  const parts = [
    norm(action?.name),
    norm(action?.type),
    norm(action?.category),
    ...(action?.tags ?? []).map(norm),
  ].filter(Boolean);

  const raw    = parts.join(' ');
  const tokens = new Set<string>(parts.flatMap(tokenise));

  return { raw, tokens };
};

const isWorkflowStartAction = (action: WorkflowAction): boolean => {
  const type = norm(action?.type);
  const name = norm(action?.name);
  const tags = new Set((action?.tags ?? []).map(norm).filter(Boolean));

  return (
    type === 'workflow-start' ||
    name === 'start' ||
    name === 'workflow start' ||
    tags.has('start') ||
    tags.has('begin') ||
    tags.has('entry')
  );
};

const isWorkflowEndAction = (action: WorkflowAction): boolean => {
  const type = norm(action?.type);
  const name = norm(action?.name);
  const tags = new Set((action?.tags ?? []).map(norm).filter(Boolean));

  return (
    type === 'workflow-end' ||
    name === 'end' ||
    name === 'workflow end' ||
    tags.has('end') ||
    tags.has('finish') ||
    tags.has('exit')
  );
};

// ─────────────────────────────────────────────
// Match helpers
// ─────────────────────────────────────────────

/** Exact equality against a normalised field value. */
const exactMatch = (field: string | undefined, candidates: string[]): boolean => {
  if (!field) return false;
  const n = norm(field);
  return candidates.some((c) => norm(c) === n);
};

/**
 * Keyword match against the full corpus.
 *
 * Two strategies (either is sufficient):
 *   1. The full normalised phrase is a substring of corpus.raw
 *      → catches "zoho desk", "google drive", "send otp", "read cell"
 *   2. Every token of the phrase exists as a token in corpus.tokens
 *      → catches hyphenated slugs: "generate-totp" → tokens ["generate","totp"]
 *         both present in corpus → match
 *
 * We intentionally do NOT use a regex word-boundary check because it
 * blocked matches on hyphenated action names in the previous version.
 */
const keywordMatch = (corpus: Corpus, keywords: string[]): boolean => {
  for (const kw of keywords) {
    const kwNorm = norm(kw);
    if (!kwNorm) continue;

    // Strategy 1: substring
    if (corpus.raw.includes(kwNorm)) return true;

    // Strategy 2: all tokens present
    const kwTokens = tokenise(kwNorm);
    if (kwTokens.length > 0 && kwTokens.every((t) => corpus.tokens.has(t))) return true;
  }
  return false;
};

// ─────────────────────────────────────────────
// Plugin rule definition
// ─────────────────────────────────────────────

interface PluginRule {
  /** Exact match on action.category — checked before keywords. */
  categoryExact?: string[];
  /** Exact match on action.type — checked before keywords. */
  typeExact?: string[];
  /**
   * Keyword/phrase list matched against name+type+category+tags corpus.
   * Supports multi-word phrases and hyphenated slugs.
   */
  keywords?: string[];
  descriptor: PluginDescriptor;
}

// ─────────────────────────────────────────────
// Plugin rule table
//
// ORDER MATTERS — first match wins.
// Specific / collision-prone rules must come BEFORE generic ones.
// ─────────────────────────────────────────────

const PLUGIN_RULES: PluginRule[] = [
  // ── Microsoft Teams ─────────────────────────
  {
    categoryExact: ['microsoft-teams-010', 'teams', 'microsoft teams'],
    typeExact: ['teams', 'microsoft-teams'],
    keywords: ['microsoft teams', 'teams'],
    descriptor: {
      logo: 'teams.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── Excel ───────────────────────────────────
  {
    categoryExact: ['excel-automation-011', 'excel', 'microsoft excel'],
    typeExact: ['excel'],
    keywords: ['excel', 'read cell', 'write cell', 'workbook', 'spreadsheet'],
    descriptor: {
      logo: 'excel.png',
      color: 'emerald',
      size: 28,
      filter: GLOW.emerald,
      transform: 'scale(1)',
    },
  },

  // ── Google Drive ─────────────────────────────
  {
    categoryExact: ['google-drive-012', 'gdrive', 'google drive'],
    typeExact: ['gdrive', 'google-drive'],
    keywords: ['gdrive', 'google drive'],
    descriptor: {
      logo: 'gdrive.png',
      color: 'emerald',
      size: 28,
      filter: GLOW.emerald,
      transform: 'scale(1)',
    },
  },

  // ── OneDrive ────────────────────────────────
  {
    categoryExact: ['onedrive-013', 'onedrive', 'one drive'],
    typeExact: ['onedrive'],
    keywords: ['onedrive', 'one drive'],
    descriptor: {
      logo: 'onedrive.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── JSON ────────────────────────────────────
  {
    categoryExact: ['json-automation-014', 'json'],
    typeExact: ['json'],
    keywords: ['json'],
    descriptor: {
      logo: 'json.png',
      color: 'violet',
      size: 28,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── XML ─────────────────────────────────────
  {
    categoryExact: ['xml-automation-015', 'xml'],
    typeExact: ['xml'],
    keywords: ['xml'],
    descriptor: {
      logo: 'xml.png',
      color: 'violet',
      size: 28,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── Web GUI ─────────────────────────────────
  {
    categoryExact: ['web-gui-016', 'webgui', 'web gui'],
    typeExact: ['webgui', 'web gui'],
    keywords: ['webgui', 'web gui'],
    descriptor: {
      logo: 'webgui.png',
      color: 'violet',
      size: 28,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── Database Plugins ────────────────────────
  {
    categoryExact: ['database-plugins-039', 'database plugins', 'sql database'],
    typeExact: ['database-plugins', 'sql'],
    keywords: ['database-plugins-039', 'sql database', 'database plugin', 'sql'],
    descriptor: {
      logo: 'database_plugins.png',
      color: 'emerald',
      size: 34,
      filter: GLOW.actionAsset,
      transform: 'scale(1.02)',
    },
  },

  // ── ChatGPT ─────────────────────────────────
  {
    categoryExact: ['chatgpt', 'chatgpt-ai'],
    typeExact: ['chatgpt'],
    keywords: ['chatgpt', 'openai'],
    descriptor: {
      logo: 'chatgpt.png',
      color: 'emerald',
      size: 30,
      filter: GLOW.emerald,
      transform: 'scale(1)',
    },
  },

  // ── Claude ──────────────────────────────────
  {
    categoryExact: ['claude-ai', 'claude', 'anthropic'],
    typeExact: ['claude'],
    keywords: ['claude', 'anthropic'],
    descriptor: {
      logo: 'claude-ai.png',
      color: 'amber',
      size: 30,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── Gemini ──────────────────────────────────
  {
    categoryExact: ['gemini-ai', 'gemini', 'gemini ai'],
    typeExact: ['gemini'],
    keywords: ['gemini', 'gemini ai'],
    descriptor: {
      logo: 'gemini-ai.png',
      color: 'violet',
      size: 30,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── Grok ────────────────────────────────────
  {
    categoryExact: ['grok-ai', 'grok'],
    typeExact: ['grok'],
    keywords: ['grok', 'xai'],
    descriptor: {
      logo: 'grok.png',
      color: 'slate',
      size: 30,
      filter: GLOW.generic,
      transform: 'scale(1)',
    },
  },

  // ── AI Bridge ───────────────────────────────
  {
    categoryExact: ['ai-bridge-038', 'ai-bridge-037', 'ai bridge'],
    typeExact: ['ai-bridge'],
    keywords: ['ai bridge'],
    descriptor: {
      logo: 'ai.png',
      color: 'violet',
      size: 30,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── AI Agent ────────────────────────────────
  {
    categoryExact: ['ai-agent', 'ai agent'],
    typeExact: ['ai-agent'],
    keywords: ['ai agent'],
    descriptor: {
      logo: 'ai-agent.png',
      color: 'violet',
      size: 28,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── Chatbot ────────────────────────────────
  {
    categoryExact: ['chatbot', 'chat bot'],
    typeExact: ['chatbot'],
    keywords: ['chatbot', 'chat bot'],
    descriptor: {
      logo: 'chatbot.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── JavaScript ─────────────────────────────
  {
    categoryExact: ['javascript'],
    typeExact: ['javascript'],
    keywords: ['javascript', 'js'],
    descriptor: {
      logo: 'javascript.png',
      color: 'amber',
      size: 28,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── Java ────────────────────────────────────
  {
    categoryExact: ['java'],
    typeExact: ['java'],
    keywords: ['java'],
    descriptor: {
      logo: 'java.png',
      color: 'orange',
      size: 28,
      filter: GLOW.orange,
      transform: 'scale(1)',
    },
  },

  // ── Python ──────────────────────────────────
  {
    categoryExact: ['python'],
    typeExact: ['python'],
    keywords: ['python'],
    descriptor: {
      logo: 'python.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── Windows Management ──────────────────────
  {
    categoryExact: ['windows-management', 'windows management', 'Window-Management'],
    typeExact: ['windows-management', 'Window-Management'],
    keywords: ['windows management', 'Window-Management'],
    descriptor: {
      logo: 'windows-management.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── SharePoint ───────────────────────────────
  {
    categoryExact: ['sharepoint', 'share point'],
    typeExact: ['sharepoint'],
    keywords: ['sharepoint', 'share point'],
    descriptor: {
      logo: 'sharepoint.png',
      color: 'emerald',
      size: 28,
      filter: GLOW.emerald,
      transform: 'scale(1)',
    },
  },

  // ── AWS S3 ───────────────────────────────────
  {
    categoryExact: ['s3', 'aws s3', 'amazon s3'],
    typeExact: ['s3'],
    keywords: ['s3', 'aws s3', 'amazon s3', 's3 bucket'],
    descriptor: {
      logo: 'S3.png',
      color: 'amber',
      size: 34,
      filter: GLOW.orange,
      transform: 'scale(1)',
    },
  },

  // ── AWS EC2 ──────────────────────────────────
  {
    categoryExact: ['ec2', 'aws ec2', 'amazon ec2'],
    typeExact: ['ec2'],
    keywords: ['ec2', 'aws ec2', 'amazon ec2', 'ec2 instance'],
    descriptor: {
      logo: 'EC2.png',
      color: 'amber',
      size: 34,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── Docker ───────────────────────────────────
  {
    categoryExact: ['docker'],
    typeExact: ['docker'],
    keywords: ['docker'],
    descriptor: {
      logo: 'Docker.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── Linux / Terminal ─────────────────────────
  {
    categoryExact: ['linux'],
    typeExact: ['linux'],
    keywords: ['linux'],
    descriptor: {
      logo: 'linux.png',
      color: 'amber',
      size: 28,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── JumpCloud ────────────────────────────────
  {
    categoryExact: ['jumpcloud-032', 'jumpcloud-031', 'jumpcloud'],
    typeExact: ['jumpcloud'],
    keywords: ['jumpcloud'],
    descriptor: {
      logo: 'jumpclud.png',
      color: 'sky',
      size: 38,
      filter: GLOW.blue,
      transform: 'scale(1.10)',
    },
  },

  // ── Asana ────────────────────────────────────
  {
    categoryExact: ['asana'],
    typeExact: ['asana'],
    keywords: ['asana', 'asana workspace', 'asana task'],
    descriptor: {
      logo: 'asana.png',
      color: 'violet',
      size: 40,
      filter: GLOW.pink,
      transform: 'scale(1.15)',
    },
  },

  // ── Fast2SMS ─────────────────────────────────
  {
    categoryExact: ['fast2sms'],
    typeExact: ['fast2sms'],
    keywords: ['fast2sms'],
    descriptor: {
      logo: 'Fast2SMS.png',
      color: 'rose',
      size: 36,
      filter: GLOW.cyan,
      transform: 'scale(1.06)',
    },
  },

  // ── TOTP Generator ───────────────────────────
  {
    categoryExact: ['totp'],
    typeExact: ['totp'],
    keywords: ['generate-totp', 'generate totp', 'totp'],
    descriptor: {
      logo: 'totp generator.png',
      color: 'slate',
      size: 36,
      filter: GLOW.cyan,
      transform: 'scale(1.08)',
    },
  },

  // ── SFTP ─────────────────────────────────────
  {
    categoryExact: ['sftp', 'ftp'],
    typeExact: ['sftp', 'ftp'],
    keywords: ['sftp'],
    descriptor: {
      logo: 'sftp.png',
      color: 'amber',
      size: 28,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── MongoDB ──────────────────────────────────
  {
    categoryExact: ['mongodb', 'mongo', 'mongo db'],
    typeExact: ['mongodb', 'mongo'],
    keywords: ['mongodb', 'mongo'],
    descriptor: {
      logo: 'mongo-db.png',
      color: 'emerald',
      size: 28,
      filter: GLOW.emerald,
      transform: 'scale(1)',
    },
  },

  // ── Jenkins ──────────────────────────────────
  {
    categoryExact: ['jenkins'],
    typeExact: ['jenkins'],
    keywords: ['jenkins'],
    descriptor: {
      logo: 'jenkins.png',
      color: 'rose',
      size: 28,
      filter: GLOW.rose,
      transform: 'scale(1)',
    },
  },

  // ── Salesforce ───────────────────────────────
  {
    categoryExact: ['salesforce', 'crm'],
    typeExact: ['salesforce'],
    keywords: ['salesforce'],
    descriptor: {
      logo: 'salesforce.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── SAP ──────────────────────────────────────
  {
    categoryExact: ['sap'],
    typeExact: ['sap'],
    keywords: ['sap'],
    descriptor: {
      logo: 'sap.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── PDF / Adobe Sign ─────────────────────────
  {
    categoryExact: ['pdf', 'adobe-sign', 'adobesign', 'adobe sign', 'adobe'],
    typeExact: ['pdf', 'adobe-sign', 'adobesign'],
    keywords: ['pdf', 'adobe sign', 'adobesign', 'adobe'],
    descriptor: {
      logo: 'pdf.png',
      color: 'rose',
      size: 28,
      filter: GLOW.rose,
      transform: 'scale(1)',
    },
  },

  // ── Zoho Desk ────────────────────────────────
  {
    categoryExact: ['zoho desk', 'zohodesk', 'zoho-desk'],
    typeExact: ['zoho-desk', 'zohodesk'],
    keywords: ['zoho desk', 'zohodesk'],
    descriptor: {
      logo: 'ZOHODESK.png',
      color: 'amber',
      size: 28,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── Zoho ─────────────────────────────────────
  {
    categoryExact: ['zoho'],
    typeExact: ['zoho'],
    keywords: ['zoho'],
    descriptor: {
      logo: 'zoho.png',
      color: 'amber',
      size: 28,
      filter: GLOW.gold,
      transform: 'scale(1)',
    },
  },

  // ── Outlook / Email ──────────────────────────
  {
    categoryExact: ['outlook'],
    typeExact: ['outlook'],
    keywords: ['outlook', 'send email', 'send mail', 'read email'],
    descriptor: {
      logo: 'outlook.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },

  // ── File Operations ──────────────────────────
  {
    categoryExact: ['file-operations', 'file operations', 'fileoperations'],
    typeExact: ['file-operations', 'fileoperations'],
    keywords: ['file-operations', 'file operations'],
    descriptor: {
      logo: 'file-operations.png',
      color: 'slate',
      size: 28,
      filter: GLOW.generic,
      transform: 'scale(1)',
    },
  },

  // ── Text Processing ──────────────────────────
  {
    categoryExact: ['text-processing', 'text processing'],
    typeExact: ['text-processing'],
    keywords: ['text-processing', 'text processing'],
    descriptor: {
      logo: 'text.png',
      color: 'slate',
      size: 28,
      filter: GLOW.generic,
      transform: 'scale(1)',
    },
  },

  // ── Generic AI fallback ──────────────────────
  // â”€â”€ Document AI actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Keep dedicated action-type rules before the package-level fallback.
  // This makes canvas logos deterministic even for saved/hydrated nodes where
  // an explicit action.logo may be absent.
  {
    typeExact: ['document-ai-ocr-extract'],
    keywords: [],
    descriptor: {
      logo: 'OCR.png',
      color: 'sky',
      size: 36,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },
  {
    typeExact: ['document-ai-summarize-text'],
    keywords: [],
    descriptor: {
      logo: 'SummerizeText.png',
      color: 'violet',
      size: 36,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },
  {
    typeExact: ['document-ai-summarize-pdf'],
    keywords: [],
    descriptor: {
      logo: 'SummerizePDF.png',
      color: 'violet',
      size: 36,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },
  {
    typeExact: ['document-ai-transcribe'],
    keywords: [],
    descriptor: {
      logo: 'transcription.png',
      color: 'violet',
      size: 36,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },
  {
    categoryExact: ['document-ai-042', 'document ai'],
    keywords: ['document-ai'],
    descriptor: {
      logo: 'Document_AI.png',
      color: 'sky',
      size: 36,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },
  {
    categoryExact: ['ai'],
    typeExact: ['ai'],
    keywords: ['ai', 'llm'],
    descriptor: {
      logo: 'ai.png',
      color: 'violet',
      size: 28,
      filter: GLOW.violet,
      transform: 'scale(1)',
    },
  },

  // ── Generic REST API ─────────────────────────
  {
    categoryExact: ['api', 'rest'],
    typeExact: ['api', 'rest'],
    keywords: [],
    descriptor: {
      logo: 'api.png',
      color: 'sky',
      size: 28,
      filter: GLOW.sky,
      transform: 'scale(1)',
    },
  },
];

// ─────────────────────────────────────────────
// Fallback — shown when nothing matches
// ─────────────────────────────────────────────

const FALLBACK_DESCRIPTOR: PluginDescriptor = {
  logo:      'api.png',
  color:     'slate',
  size:      28,
  filter:    GLOW.generic,
  transform: 'scale(1)',
};

// ─────────────────────────────────────────────
// Core resolution function
//
// Priority:
//   0. action.logo  — explicit override on the action object
//   1. categoryExact
//   2. typeExact
//   3. keywords (corpus match)
//   4. FALLBACK_DESCRIPTOR
// ─────────────────────────────────────────────

const resolvePlugin = (action: WorkflowAction): PluginDescriptor => {
  // Special workflow control nodes should never fall back to the generic API logo.
  if (isWorkflowStartAction(action)) {
    return {
      logo: normalizeLogoName(action.logo || 'start.png'),
      color: 'emerald',
      size: 36,
      filter: GLOW.actionAsset,
      transform: 'scale(1.02)',
    };
  }

  if (isWorkflowEndAction(action)) {
    return {
      logo: normalizeLogoName(action.logo || 'end.png'),
      color: 'rose',
      size: 36,
      filter: GLOW.actionAsset,
      transform: 'scale(1.02)',
    };
  }

  // Saved/hydrated workflow-control nodes do not always retain action.logo.
  // Resolve their dedicated 48×48 assets from the stable control-node type
  // so canvas rendering never falls back to the generic API icon.
  const workflowControlType = norm(action?.type);
  const workflowControlName = norm(action?.name);
  const workflowControlCategory = norm(action?.category);
  const isWorkflowControlCategory = workflowControlCategory === 'workflow-control-001';

  const workflowControlDescriptor = (
    logo: string,
    color: PluginDescriptor['color']
  ): PluginDescriptor => ({
    logo: normalizeLogoName(action.logo || logo),
    color,
    size: 36,
    filter: GLOW.actionAsset,
    transform: 'scale(1.02)',
  });

  if (
    workflowControlType === 'workflow-for-each' ||
    (isWorkflowControlCategory && workflowControlName === 'for each')
  ) {
    return workflowControlDescriptor('for_each.png', 'violet');
  }

  if (
    workflowControlType === 'workflow-while' ||
    (isWorkflowControlCategory && workflowControlName === 'while')
  ) {
    return workflowControlDescriptor('while.png', 'sky');
  }

  if (
    workflowControlType === 'workflow-repeat-until' ||
    (isWorkflowControlCategory && workflowControlName === 'repeat until')
  ) {
    return workflowControlDescriptor('repeat_until.png', 'violet');
  }

  if (
    workflowControlType === 'workflow-break' ||
    (isWorkflowControlCategory && workflowControlName === 'break')
  ) {
    return workflowControlDescriptor('break.png', 'amber');
  }

  if (
    workflowControlType === 'workflow-continue' ||
    (isWorkflowControlCategory && workflowControlName === 'continue')
  ) {
    return workflowControlDescriptor('continue.png', 'sky');
  }

  // Priority 0: explicit logo override
  if (action.logo) {
    const normalizedLogo = normalizeLogoName(action.logo);
    const logoNorm = norm(normalizedLogo);
    const logoRule = PLUGIN_RULES.find(
      (rule) => norm(rule.descriptor.logo) === logoNorm
    );

    if (logoRule) {
      return {
        ...logoRule.descriptor,
        // Explicit 48×48 action assets need more room than legacy brand marks.
        size: Math.max(logoRule.descriptor.size, 34),
      };
    }

    return {
      ...FALLBACK_DESCRIPTOR,
      logo: normalizedLogo,
      color: 'sky',
      size: 36,
      filter: GLOW.actionAsset,
      transform: 'scale(1.02)',
    };
  }

  const corpus = buildCorpus(action);

  for (const rule of PLUGIN_RULES) {
    if (rule.categoryExact?.length && exactMatch(action.category, rule.categoryExact)) {
      return rule.descriptor;
    }
    if (rule.typeExact?.length && exactMatch(action.type, rule.typeExact)) {
      return rule.descriptor;
    }
    if (rule.keywords?.length && keywordMatch(corpus, rule.keywords)) {
      return rule.descriptor;
    }
  }

  return FALLBACK_DESCRIPTOR;
};

// ─────────────────────────────────────────────
// ConnectorDot — reusable sub-component
//
// Visual behavior:
//   • faint "socket" at rest so ports stay discoverable
//   • accent fill when the node is hovered
//   • enlarged + halo on direct hover
//   • pinging beacon while a connection is in progress,
//     advertising the port as a valid drop target
// Interaction logic is unchanged.
// ─────────────────────────────────────────────

interface ConnectorDotProps {
  side: 'left' | 'right';
  hovered: boolean;
  accentDot: string;
  isConnecting: boolean;
  nodeId: string;
  onStartConnection?: (nodeId: string, portId?: string | null) => void;
  onCompleteConnection?: (nodeId: string) => void;
}

const ConnectorDot = ({
  side,
  hovered,
  accentDot,
  isConnecting,
  nodeId,
  onStartConnection,
  onCompleteConnection,
}: ConnectorDotProps) => {
  const [dotHovered, setDotHovered] = useState(false);

  const active  = dotHovered || isConnecting;
  const visible = hovered || isConnecting || dotHovered;

  return (
    <div
      role="button"
      aria-label={side === 'left' ? 'Input port' : 'Output port'}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (isConnecting) {
          onCompleteConnection?.(nodeId);
        } else {
          onStartConnection?.(nodeId);
        }
      }}
      onMouseEnter={() => setDotHovered(true)}
      onMouseLeave={() => setDotHovered(false)}
      style={{
        position:       'absolute',
        [side]:         -10,
        top:            '50%',
        transform:      'translateY(-50%)',
        width:          20,
        height:         20,
        cursor:         'crosshair',
        zIndex:         20,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}
    >
      {/* Beacon advertising a live connection drop target */}
      {isConnecting && (
        <span
          aria-hidden="true"
          style={{
            position:     'absolute',
            width:        8,
            height:       8,
            borderRadius: '50%',
            background:   accentDot,
            opacity:      0.75,
            animation:    'wfn-ping 1.3s cubic-bezier(0, 0, 0.2, 1) infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Port */}
      <span
        style={{
          width:        active ? 9 : 7,
          height:       active ? 9 : 7,
          borderRadius: '50%',
          background:   visible ? accentDot : 'rgba(148,163,184,0.45)',
          opacity:      visible ? 1 : 0.30,
          boxShadow:    visible
            ? `0 0 0 2px rgba(8,12,26,0.92), 0 0 ${active ? 12 : 8}px ${accentDot}`
            : '0 0 0 2px rgba(8,12,26,0.60)',
          transform:    active ? 'scale(1.12)' : 'scale(1)',
          transition:   'all 0.18s cubic-bezier(0.2, 0.8, 0.4, 1)',
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────
// PortHandle — one named output branch
// ─────────────────────────────────────────────
//
// A step that declares ports gets one handle per port instead of the single
// unnamed dot, each labelled and vertically distributed down the node's right
// edge. The label is the point: "Unmatched" written next to the lower handle is
// what stops an author wiring the exception report to the wrong branch, which
// was previously a silent mistake because both bindings resolved.
//
// Exception ports are drawn amber. That is the same visual grammar as the
// reference tool, and it reads correctly at a glance on a large canvas: the
// warm handle is the one carrying rows a person still has to deal with.

export const PORT_ROW_HEIGHT = 22;

/** Vertical offset of a port handle, measured from the node's top edge. */
export function portHandleOffset(index: number, total: number, nodeHeight: number): number {
  if (total <= 1) return nodeHeight / 2;
  const span = (total - 1) * PORT_ROW_HEIGHT;
  return nodeHeight / 2 - span / 2 + index * PORT_ROW_HEIGHT;
}

interface PortHandleProps {
  port: OutputPort;
  index: number;
  total: number;
  nodeHeight: number;
  hovered: boolean;
  accentDot: string;
  isConnecting: boolean;
  nodeId: string;
  onStartConnection?: (nodeId: string, portId?: string | null) => void;
  onCompleteConnection?: (nodeId: string) => void;
}

const PortHandle = ({
  port,
  index,
  total,
  nodeHeight,
  hovered,
  accentDot,
  isConnecting,
  nodeId,
  onStartConnection,
  onCompleteConnection,
}: PortHandleProps) => {
  const [dotHovered, setDotHovered] = useState(false);

  const tone      = port.tone === 'exception' ? '#f59e0b' : accentDot;
  const active    = dotHovered || isConnecting;
  const visible   = hovered || isConnecting || dotHovered;
  const top       = portHandleOffset(index, total, nodeHeight);

  return (
    <div
      role="button"
      aria-label={`${port.label} output port`}
      title={port.description ? `${port.label} — ${port.description}` : port.label}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (isConnecting) onCompleteConnection?.(nodeId);
        else onStartConnection?.(nodeId, port.id);
      }}
      onMouseEnter={() => setDotHovered(true)}
      onMouseLeave={() => setDotHovered(false)}
      style={{
        position:       'absolute',
        right:          -10,
        top,
        transform:      'translateY(-50%)',
        width:          20,
        height:         20,
        cursor:         'crosshair',
        zIndex:         20,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}
    >
      {isConnecting && (
        <span
          aria-hidden="true"
          style={{
            position:      'absolute',
            width:         8,
            height:        8,
            borderRadius:  '50%',
            background:    tone,
            opacity:       0.75,
            animation:     'wfn-ping 1.3s cubic-bezier(0, 0, 0.2, 1) infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      <span
        style={{
          width:        active ? 9 : 7,
          height:       active ? 9 : 7,
          borderRadius: '50%',
          background:   visible ? tone : 'rgba(148,163,184,0.45)',
          opacity:      visible ? 1 : 0.30,
          boxShadow:    visible
            ? `0 0 0 2px rgba(8,12,26,0.92), 0 0 ${active ? 12 : 8}px ${tone}`
            : '0 0 0 2px rgba(8,12,26,0.60)',
          transform:    active ? 'scale(1.12)' : 'scale(1)',
          transition:   'all 0.18s cubic-bezier(0.2, 0.8, 0.4, 1)',
        }}
      />

      {/* The label. Always rendered so the branch is readable at rest, and
          lifted to full contrast on hover. */}
      <span
        style={{
          position:      'absolute',
          left:          20,
          whiteSpace:    'nowrap',
          fontSize:      9.5,
          fontWeight:    600,
          letterSpacing: 0.2,
          color:         visible ? tone : 'rgba(148,163,184,0.75)',
          opacity:       visible ? 1 : 0.65,
          textShadow:    '0 1px 3px rgba(8,12,26,0.95)',
          pointerEvents: 'none',
          transition:    'all 0.18s ease',
        }}
      >
        {port.label}
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────
// SpecialGlyph — workflow start / end markers
// ─────────────────────────────────────────────

const SpecialGlyph = ({
  kind,
  color,
}: {
  kind: 'start' | 'end';
  color: string;
}) => {
  const Icon = kind === 'start' ? Icons.Play : Icons.Flag;
  const tint = kind === 'start' ? '16,185,129' : '244,63,94';

  return (
    <div
      style={{
        width:          38,
        height:         38,
        borderRadius:   13,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:
          `radial-gradient(130% 130% at 28% 18%, rgba(${tint},0.30), rgba(${tint},0.06) 62%), rgba(${tint},0.05)`,
        border:    `1px solid ${color}55`,
        boxShadow:
          `inset 0 1px 0 rgba(255,255,255,0.10), ` +
          `0 0 0 1px rgba(255,255,255,0.04), ` +
          `0 0 20px ${color}26`,
      }}
    >
      <Icon
        size={kind === 'start' ? 17 : 16}
        color={color}
        fill={color}
        strokeWidth={2}
        style={kind === 'start' ? { transform: 'translateX(1px)' } : undefined}
      />
    </div>
  );
};

// ─────────────────────────────────────────────
// WorkflowNode — main component
// ─────────────────────────────────────────────

const WorkflowNode = ({
  id,
  action,
  onMove,
  onDelete,
  onSelect,
  onStartConnection,
  onCompleteConnection,
  onRename,
  onDuplicate,
  isSelected   = false,
  isRunning    = false,
  isConnecting = false,
  isInvalid    = false,
  zoomLevel    = 100,
  gridSize     = 16,
  hasBreakpoint      = false,
  breakpointDisabled = false,
  isPausedHere       = false,
  onToggleBreakpoint,
}: WorkflowNodeProps) => {
  const nodeId = String(
    action.id ?? id ?? action.name ?? crypto.randomUUID()
  );

  const plugin = useMemo(() => resolvePlugin(action), [action]);
  const accent = ACCENT[plugin.color] ?? ACCENT.slate;
  const isStartNode = isWorkflowStartAction(action);
  const isEndNode = isWorkflowEndAction(action);

  /** Named branches this step routes from. Empty for a single-output step. */
  const declaredPorts = useMemo(() => getOutputPorts(action as any), [action]);

  /** Presentation-only: dims the node when status === 'disabled'. */
  const isDisabled = norm(action.status) === 'disabled';

  // ── State ──────────────────────────────────
  const [dragging,     setDragging]     = useState(false);
  const [hovered,      setHovered]      = useState(false);
  const [imgError,     setImgError]     = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isRenaming,   setIsRenaming]   = useState(false);
  const [renameValue,  setRenameValue]  = useState(action.name ?? '');

  const dragRef = useRef({
    active:  false,
    moved:   false,
    startX:  0,
    startY:  0,
    clientX: 0,
    clientY: 0,
  });

  useEffect(() => { ensureNodeStyles(); }, []);
  useEffect(() => { setRenameValue(action.name ?? ''); }, [action.name]);
  useEffect(() => { setImgError(false); }, [plugin.logo]);

  // ── Drag ──────────────────────────────────
  const beginDrag = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      dragRef.current = {
        active:  true,
        moved:   false,
        startX:  action.x ?? 0,
        startY:  action.y ?? 0,
        clientX: e.clientX,
        clientY: e.clientY,
      };

      setDragging(true);
    },
    [action.x, action.y]
  );

  useEffect(() => {
    if (!dragging) return;

    const scale = Math.max(0.1, zoomLevel / 100);

    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragRef.current.clientX) / scale;
      const dy = (e.clientY - dragRef.current.clientY) / scale;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;

      onMove(
        nodeId,
        Math.round((dragRef.current.startX + dx) / gridSize) * gridSize,
        Math.round((dragRef.current.startY + dy) / gridSize) * gridSize
      );
    };

    const handleUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup',   handleUp);

      if (!dragRef.current.moved) {
        if (isConnecting) onCompleteConnection?.(nodeId);
        else              onSelect(nodeId);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup',   handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup',   handleUp);
    };
  }, [dragging, gridSize, isConnecting, nodeId, onMove, onSelect, onCompleteConnection, zoomLevel]);

  // ── Context menu ──────────────────────────
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
    setMenuPosition({ x: e.clientX, y: e.clientY });
  };

  // ── Rename ────────────────────────────────
  const handleRename = () => {
    const clean = renameValue.trim();
    if (clean && clean !== action.name && onRename) onRename(nodeId, clean);
    setIsRenaming(false);
  };

  // ── Derived visual treatments ─────────────
  // No transforms on the node body — connector ports stay perfectly
  // aligned with edges drawn by the parent canvas. Depth is expressed
  // through layered shadows + border weight instead.

  const bodyTint = isStartNode
    ? 'rgba(16,185,129,0.06)'
    : isEndNode
    ? 'rgba(244,63,94,0.05)'
    : 'rgba(148,163,184,0)';

  const borderColor = isSelected
    ? accent.border
    : hovered
    ? 'rgba(148,163,184,0.30)'
    : 'rgba(148,163,184,0.14)';

  const depthShadow = dragging
    ? '0 16px 36px -8px rgba(2,6,23,0.65), 0 4px 12px rgba(2,6,23,0.45)'
    : hovered
    ? '0 10px 26px -8px rgba(2,6,23,0.55), 0 2px 8px rgba(2,6,23,0.35)'
    : '0 4px 14px -4px rgba(2,6,23,0.45), 0 1px 4px rgba(2,6,23,0.30)';

  const selectionRing = isSelected
    ? `0 0 0 1px ${accent.border}, 0 0 0 5px ${accent.glow}, 0 0 22px ${accent.glow}, `
    : '';

  const bodyShadow =
    `inset 0 1px 0 rgba(255,255,255,0.06), ${selectionRing}${depthShadow}`;

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <>
      <div
        className="absolute"
        role="group"
        aria-label={action.name ?? 'Workflow node'}
        style={{
          position: 'absolute',
          left:     action.x ?? 0,
          top:      action.y ?? 0,
          width:    NODE_WIDTH,
          height:   NODE_HEIGHT,
          zIndex:   dragging ? 60 : isSelected ? 50 : 10,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={handleContextMenu}
      >
        {/* ── Breakpoint gutter ─────────────────
            Sits just outside the node's left edge, like an editor gutter. It
            appears on hover so the canvas stays clean, and stays visible once a
            breakpoint is set so you can always see where the run will stop. */}
        {onToggleBreakpoint && (hovered || hasBreakpoint || isPausedHere) && (
          <button
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleBreakpoint(nodeId);
            }}
            title={hasBreakpoint ? 'Remove breakpoint' : 'Stop the run before this node'}
            aria-label={hasBreakpoint ? 'Remove breakpoint' : 'Set breakpoint'}
            aria-pressed={hasBreakpoint}
            style={{
              position: 'absolute',
              left: -22,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: hasBreakpoint
                ? `2px solid ${breakpointDisabled ? '#64748b' : '#ef4444'}`
                : '2px solid rgba(148,163,184,0.45)',
              background: hasBreakpoint && !breakpointDisabled ? '#ef4444' : 'transparent',
              boxShadow: isPausedHere ? '0 0 0 4px rgba(245,158,11,0.35)' : 'none',
              cursor: 'pointer',
              padding: 0,
              zIndex: 70,
            }}
          />
        )}

        {/* ── Node body ─────────────────────── */}
        <div
          onMouseDown={beginDrag}
          style={{
            width:        '100%',
            height:       '100%',
            borderRadius: NODE_RADIUS,
            background:
              `linear-gradient(${bodyTint}, ${bodyTint}), ` +
              `linear-gradient(168deg, rgba(148,163,184,0.10), rgba(148,163,184,0.02) 46%, rgba(2,6,23,0.05)), ` +
              `rgba(15,23,42,0.82)`,
            border:               `1px solid ${borderColor}`,
            boxShadow:            bodyShadow,
            backdropFilter:       'blur(12px) saturate(1.15)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.15)',
            position:             'relative',
            cursor:               dragging ? 'grabbing' : 'grab',
            display:              'flex',
            alignItems:           'center',
            justifyContent:       'center',
            opacity:              isDisabled ? 0.55 : 1,
            filter:               isDisabled ? 'saturate(0.55)' : 'none',
            outline:
              isConnecting && hovered
                ? `1.5px dashed ${accent.border}`
                : 'none',
            outlineOffset: 3,
            transition:
              'box-shadow 0.2s ease, border-color 0.18s ease, ' +
              'opacity 0.2s ease, filter 0.2s ease',
          }}
        >
          {/* ── Run status overlay (presentation only; no execution change) ── */}
          {(() => {
            const st = String(action.status ?? (isRunning ? 'running' : '')).toLowerCase();
            const META: Record<string, { ring: string; badge: string; text: string; label: string; pulse?: boolean }> = {
              running: { ring: 'rgba(56,189,248,0.85)', badge: 'rgba(56,189,248,0.15)', text: '#7dd3fc', label: 'Running', pulse: true },
              completed: { ring: 'rgba(16,185,129,0.85)', badge: 'rgba(16,185,129,0.15)', text: '#6ee7b7', label: 'Done' },
              success: { ring: 'rgba(16,185,129,0.85)', badge: 'rgba(16,185,129,0.15)', text: '#6ee7b7', label: 'Done' },
              failed: { ring: 'rgba(244,63,94,0.9)', badge: 'rgba(244,63,94,0.15)', text: '#fda4af', label: 'Failed' },
              error: { ring: 'rgba(244,63,94,0.9)', badge: 'rgba(244,63,94,0.15)', text: '#fda4af', label: 'Failed' },
              skipped: { ring: 'rgba(245,158,11,0.85)', badge: 'rgba(245,158,11,0.15)', text: '#fcd34d', label: 'Skipped' },
            };
            const m = META[st] ?? (isInvalid ? { ring: 'rgba(245,158,11,0.85)', badge: 'rgba(245,158,11,0.15)', text: '#fcd34d', label: 'Check' } : undefined);
            if (!m) return null;
            return (
              <>
                {/* Status ring */}
                <div
                  aria-hidden="true"
                  style={{
                    position:      'absolute',
                    inset:         0,
                    borderRadius:  NODE_RADIUS,
                    boxShadow:     `0 0 0 2px ${m.ring}, 0 0 16px -2px ${m.ring}`,
                    pointerEvents: 'none',
                    animation:     m.pulse
                      ? 'wfn-ring-pulse 1.6s ease-in-out infinite'
                      : 'none',
                  }}
                />
                {/* Status badge */}
                <div
                  style={{
                    position:       'absolute',
                    top:            -9,
                    right:          8,
                    display:        'flex',
                    alignItems:     'center',
                    gap:            4,
                    background:     m.badge,
                    color:          m.text,
                    border:         `1px solid ${m.ring}`,
                    borderRadius:   999,
                    padding:        '2px 7px 2px 6px',
                    fontSize:       9,
                    fontWeight:     700,
                    textTransform:  'uppercase',
                    letterSpacing:  '0.07em',
                    lineHeight:     1.2,
                    whiteSpace:     'nowrap',
                    pointerEvents:  'none',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    boxShadow:      '0 2px 10px rgba(2,6,23,0.5)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width:        4,
                      height:       4,
                      borderRadius: '50%',
                      background:   m.text,
                      boxShadow:    `0 0 6px ${m.text}`,
                      flexShrink:   0,
                      animation:    m.pulse
                        ? 'wfn-ring-pulse 1.6s ease-in-out infinite'
                        : 'none',
                    }}
                  />
                  {m.label}
                </div>
              </>
            );
          })()}

          {!isStartNode && (
            <ConnectorDot
              side="left"
              hovered={hovered}
              accentDot={accent.dot}
              isConnecting={isConnecting}
              nodeId={nodeId}
              onStartConnection={onStartConnection}
              onCompleteConnection={onCompleteConnection}
            />
          )}

          {!isEndNode && (
            declaredPorts.length > 0 ? (
              // A step that declares branches shows one labelled handle each.
              declaredPorts.map((port, index) => (
                <PortHandle
                  key={port.id}
                  port={port}
                  index={index}
                  total={declaredPorts.length}
                  nodeHeight={NODE_HEIGHT}
                  hovered={hovered}
                  accentDot={accent.dot}
                  isConnecting={isConnecting}
                  nodeId={nodeId}
                  onStartConnection={onStartConnection}
                  onCompleteConnection={onCompleteConnection}
                />
              ))
            ) : (
              // Everything else keeps the single unnamed output it has always had.
              <ConnectorDot
                side="right"
                hovered={hovered}
                accentDot={accent.dot}
                isConnecting={isConnecting}
                nodeId={nodeId}
                onStartConnection={onStartConnection}
                onCompleteConnection={onCompleteConnection}
              />
            )
          )}

          {imgError ? (
            isStartNode || isEndNode ? (
              <SpecialGlyph kind={isStartNode ? 'start' : 'end'} color={accent.dot} />
            ) : (
              <div
                style={{
                  width:          Math.min(NODE_WIDTH - 6, plugin.size + 12),
                  height:         Math.min(NODE_HEIGHT - 6, plugin.size + 12),
                  borderRadius:   13,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  background:     'rgba(30,41,59,0.70)',
                  border:         '1px solid rgba(148,163,184,0.18)',
                  boxShadow:      'inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
              >
                <Icons.Box size={Math.min(plugin.size, 26)} color="#94a3b8" strokeWidth={1.8} />
              </div>
            )
          ) : (
            <div
              style={{
                width:        Math.min(NODE_WIDTH - 6, plugin.size + 12),
                height:       Math.min(NODE_HEIGHT - 6, plugin.size + 12),
                borderRadius: 14,
                padding:      1.5,
                boxSizing:    'border-box',
                background:   `conic-gradient(from 180deg, ${getBrandRing(plugin.logo).join(', ')})`,
                boxShadow:    `0 0 0 1px rgba(255,255,255,0.05), 0 0 16px ${accent.glow}` +
                              (hovered ? `, 0 0 26px ${accent.glow}` : ''),
                filter:       hovered ? 'saturate(1.15) brightness(1.05)' : 'none',
                transition:   'filter 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              <div
                style={{
                  width:          '100%',
                  height:         '100%',
                  borderRadius:   12,
                  background:     'linear-gradient(170deg, rgba(30,41,59,0.78), rgba(5,12,25,0.88))',
                  boxShadow:      'inset 0 1px 0 rgba(255,255,255,0.05)',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={encodeURI(`/plugins/${plugin.logo}`)}
                  alt=""
                  draggable={false}
                  onError={() => setImgError(true)}
                  style={{
                    width:         Math.min(plugin.size, NODE_WIDTH - 12),
                    height:        Math.min(plugin.size, NODE_HEIGHT - 12),
                    maxWidth:      '100%',
                    maxHeight:     '100%',
                    objectFit:     'contain',
                    filter:        plugin.filter,
                    transform:     hovered
                      ? `${plugin.transform} scale(1.06)`
                      : plugin.transform,
                    transition:    'transform 0.2s cubic-bezier(0.2, 0.8, 0.4, 1), filter 0.2s ease',
                    userSelect:    'none',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {isRunning && (
            <div
              aria-hidden="true"
              style={{
                position:      'absolute',
                top:           -2,
                right:         -2,
                width:         10,
                height:        10,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position:     'absolute',
                  inset:        0,
                  borderRadius: '50%',
                  background:   accent.dot,
                  opacity:      0.6,
                  animation:    'wfn-ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite',
                }}
              />
              <span
                style={{
                  position:     'absolute',
                  inset:        2,
                  borderRadius: '50%',
                  background:   accent.dot,
                  boxShadow:    `0 0 8px ${accent.dot}`,
                }}
              />
            </div>
          )}
        </div>

        {/* ── Label ────────────────────────── */}
        {isRenaming ? (
          <input
            autoFocus
            className="wfn-rename"
            aria-label="Rename node"
            spellCheck={false}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  handleRename();
              if (e.key === 'Escape') {
                setIsRenaming(false);
                setRenameValue(action.name ?? '');
              }
            }}
            style={{
              marginTop:     9,
              width:         124,
              marginLeft:    -34,
              textAlign:     'center',
              background:    'rgba(10,16,30,0.95)',
              border:        '1px solid rgba(148,163,184,0.28)',
              color:         '#f1f5f9',
              borderRadius:  9,
              padding:       '5px 9px',
              fontSize:      11.5,
              fontWeight:    600,
              letterSpacing: '0.01em',
              boxShadow:     '0 8px 20px rgba(2,6,23,0.5)',
              ['--wfn-accent']:      accent.border,
              ['--wfn-accent-soft']: accent.glow,
            } as React.CSSProperties}
          />
        ) : (
          <div
            title={action.name}
            style={{
              marginTop:     8,
              width:         120,
              marginLeft:    -32,
              textAlign:     'center',
              color:         isSelected ? '#ffffff' : hovered ? '#e8eef7' : '#cbd5e1',
              fontSize:      11.5,
              fontWeight:    600,
              letterSpacing: '0.01em',
              lineHeight:    1.3,
              whiteSpace:    'nowrap',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              textShadow:    '0 1px 2px rgba(2,6,23,0.9), 0 2px 10px rgba(2,6,23,0.7)',
              opacity:       isDisabled ? 0.6 : 1,
              transition:    'color 0.15s ease, opacity 0.2s ease',
            }}
          >
            {action.name}
          </div>
        )}
      </div>

      {/* ── Context menu (portal) ─────────────── */}
      {menuOpen &&
        createPortal(
          <div
            className="wfn-menu"
            role="menu"
            aria-label="Node actions"
            style={{
              position:   'fixed',
              left:       menuPosition.x,
              top:        menuPosition.y,
              minWidth:   178,
              maxWidth:   220,
              padding:    5,
              background: 'linear-gradient(170deg, rgba(30,41,59,0.97), rgba(15,23,42,0.98))',
              border:     '1px solid rgba(148,163,184,0.16)',
              borderRadius: 13,
              zIndex:     9999,
              boxShadow:
                '0 24px 60px -12px rgba(2,6,23,0.75), ' +
                '0 0 0 1px rgba(2,6,23,0.40), ' +
                'inset 0 1px 0 rgba(255,255,255,0.05)',
              backdropFilter:       'blur(20px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
            }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            {/* Node name header (display only) */}
            <div
              style={{
                padding:       '6px 9px 7px',
                marginBottom:  4,
                fontSize:      10.5,
                fontWeight:    600,
                letterSpacing: '0.02em',
                color:         '#94a3b8',
                whiteSpace:    'nowrap',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                borderBottom:  '1px solid rgba(148,163,184,0.10)',
              }}
            >
              {action.name ?? 'Node'}
            </div>

            <button
              type="button"
              role="menuitem"
              className="wfn-menu-item"
              onClick={() => { setIsRenaming(true); setMenuOpen(false); }}
            >
              <Icons.PencilLine size={13.5} strokeWidth={2} style={{ color: '#94a3b8', flexShrink: 0 }} />
              Rename
            </button>

            <button
              type="button"
              role="menuitem"
              className="wfn-menu-item"
              onClick={() => { onDuplicate?.(nodeId); setMenuOpen(false); }}
            >
              <Icons.Copy size={13.5} strokeWidth={2} style={{ color: '#94a3b8', flexShrink: 0 }} />
              Duplicate
            </button>

            <div
              aria-hidden="true"
              style={{
                height:     1,
                margin:     '4px 2px',
                background: 'rgba(148,163,184,0.10)',
              }}
            />

            <button
              type="button"
              role="menuitem"
              className="wfn-menu-item wfn-danger"
              onClick={() => { onDelete(nodeId); setMenuOpen(false); }}
            >
              <Icons.Trash2 size={13.5} strokeWidth={2} style={{ color: '#fb7185', flexShrink: 0 }} />
              Delete
            </button>
          </div>,
          document.body
        )}
    </>
  );
};

export default memo(WorkflowNode);