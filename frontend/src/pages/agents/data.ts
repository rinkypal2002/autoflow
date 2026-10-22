import { Shield, Mic, Layers, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type {
  AgentDefinition,
  TriageRequest,
  TriageFormField,
  Verdict,
  Sentiment,
} from './types';
import { SERVICES } from '../../config/services';
import { toEngineProxyUrl } from '../../lib/engineProxyUrl';

/* ------------------------------ Backend API ------------------------------- */

/** Triage execution endpoint. Engine host comes from VITE_ENGINE_URL. */
export const API_TRIAGE_ENDPOINT = toEngineProxyUrl(
  `${SERVICES.engineBase}/VulnerabilityScanner/api/triage/run`
);

/** Voice transcription upload endpoint (multipart/form-data, field: `file`). */
export const API_TRANSCRIPTION_ENDPOINT = toEngineProxyUrl(
  `${SERVICES.engineBase}/voice_transcription/api/transcription/upload`
);

/**
 * The form starts completely empty — nothing is pre-filled.
 * `confidenceThreshold` keeps the API's documented default of 70 (a number
 * field can't be meaningfully blank) but every path/string field is empty and
 * must be entered by the user before execution.
 */
export const EMPTY_TRIAGE_REQUEST: TriageRequest = {
  scanId: '',
  project: '',
  language: '',
  reportPath: '',
  repositoryPath: '',
  sanitizerConfigPath: '',
  outputDirectory: '',
  confidenceThreshold: 70,
};

/** Field metadata drives the generic form renderer. */
export const TRIAGE_FORM_FIELDS: TriageFormField[] = [
  { key: 'scanId', label: 'Scan ID', type: 'text', placeholder: 'e.g. SCAN-2024-001', required: true },
  { key: 'project', label: 'Project', type: 'text', placeholder: 'e.g. payments-service', required: true },
  { key: 'language', label: 'Language', type: 'text', placeholder: 'e.g. java', required: true },
  { key: 'reportPath', label: 'Report Path', type: 'text', placeholder: 'Absolute path to the SAST report', required: true },
  { key: 'repositoryPath', label: 'Repository Path', type: 'text', placeholder: 'Absolute path to the source repo', required: true },
  { key: 'sanitizerConfigPath', label: 'Sanitizer Config Path', type: 'text', placeholder: 'e.g. classpath:rules/sanitizers.yml', required: true },
  { key: 'outputDirectory', label: 'Output Directory', type: 'text', placeholder: 'Where triage artifacts are written', required: true },
  { key: 'confidenceThreshold', label: 'Confidence Threshold', type: 'number', placeholder: '70', required: false },
];

/* ------------------------------ Agent catalog ----------------------------- */

/**
 * Add a new backend agent here. Set `status: 'active'` and a `route`, then
 * register the matching <Route> in App.tsx and build its page component.
 */
export const AGENTS: AgentDefinition[] = [
  {
    id: 'vulnerability-scanner',
    name: 'Vulnerability Scanner',
    description: 'Backend triage agent for SAST findings. Classifies findings and separates false positives from true positives.',
    category: 'Security',
    status: 'active',
    icon: Shield,
    route: '/agents/vulnerability-scanner',
    tags: ['SAST', 'Triage'],
  },
  {
    id: 'voice-transcription',
    name: 'Voice Transcription',
    description: 'Transcribes and diarizes call recordings, then scores sentiment across the conversation.',
    category: 'Speech',
    status: 'active',
    icon: Mic,
    route: '/agents/voice-transcription',
    tags: ['Audio', 'Sentiment'],
  },
  {
    id: 'dependency-scanner',
    name: 'Dependency Scanner',
    description: 'Detects vulnerable and outdated dependencies across your software supply chain.',
    category: 'Security',
    status: 'coming-soon',
    icon: Layers,
    tags: ['SCA', 'Supply Chain'],
  },
  {
    id: 'secrets-detection',
    name: 'Secrets Detection',
    description: 'Scans repositories and history for leaked credentials, tokens, and private keys.',
    category: 'Security',
    status: 'coming-soon',
    icon: Lock,
    tags: ['Secrets'],
  },
  {
    id: 'compliance-agent',
    name: 'Compliance Agent',
    description: 'Maps findings to compliance frameworks and produces audit-ready evidence.',
    category: 'Governance',
    status: 'coming-soon',
    icon: ShieldCheck,
    tags: ['Audit', 'Policy'],
  },
  {
    id: 'ai-remediation',
    name: 'AI Remediation Agent',
    description: 'Suggests and drafts code-level fixes for confirmed vulnerabilities.',
    category: 'Automation',
    status: 'coming-soon',
    icon: Sparkles,
    tags: ['AI', 'Fixes'],
  },
];

/* ----------------------------- Display helpers ---------------------------- */

export const formatDateTime = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const verdictLabel = (verdict: Verdict): string => {
  if (verdict === 'AUTO_CLOSED_FP') return 'Auto-closed FP';
  if (verdict === 'HIGH_CONFIDENCE_TP') return 'High-confidence TP';
  return verdict;
};

export const verdictClass = (verdict: Verdict): string => {
  if (verdict === 'AUTO_CLOSED_FP') return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';
  if (verdict === 'HIGH_CONFIDENCE_TP') return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
  return 'text-slate-300 bg-white/5 border-white/10';
};

export const severityClass = (severity: string): string => {
  switch (severity.toLowerCase()) {
    case 'high':
      return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
    case 'medium':
      return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
    case 'low':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
    default:
      return 'text-slate-300 bg-white/5 border-white/10';
  }
};

/* ----------------------- Voice transcription helpers ---------------------- */

/** Pill classes for an overall-sentiment label. */
export const sentimentClass = (sentiment: Sentiment): string => {
  switch (String(sentiment).toUpperCase()) {
    case 'POSITIVE':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
    case 'NEGATIVE':
      return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
    case 'NEUTRAL':
      return 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20';
    default:
      return 'text-slate-300 bg-white/5 border-white/10';
  }
};

/** Gradient used for sentiment-breakdown bars. */
export const sentimentBarClass = (kind: 'positive' | 'negative' | 'neutral'): string => {
  switch (kind) {
    case 'positive':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
    case 'negative':
      return 'bg-gradient-to-r from-rose-500 to-rose-400';
    default:
      return 'bg-gradient-to-r from-cyan-500 to-indigo-500';
  }
};

/**
 * Stable color treatment per speaker label, so each speaker reads consistently
 * across the transcript without hardcoding any particular speaker name.
 */
export const speakerAccent = (speaker: string, index: number): string => {
  const palette = [
    'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    'text-indigo-300 bg-indigo-500/10 border-indigo-500/20',
    'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    'text-amber-300 bg-amber-500/10 border-amber-500/20',
    'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
  ];
  // Derive a deterministic slot from the label, falling back to order.
  let hash = 0;
  for (let i = 0; i < speaker.length; i += 1) hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0;
  const slot = speaker ? hash % palette.length : index % palette.length;
  return palette[slot];
};

/** Initials for a speaker avatar (e.g. "Speaker 2" → "S2"). */
export const speakerInitials = (speaker: string): string => {
  const tokens = speaker.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  const first = tokens[0][0] ?? '';
  const last = tokens[tokens.length - 1];
  const lastPart = /^\d+$/.test(last) ? last : (last[0] ?? '');
  return `${first}${lastPart}`.toUpperCase();
};

/** 51248 → "51.2s"; 840 → "840ms". */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

/** 92.51 → "92.5%". */
export const formatPercent = (value: number, digits = 1): string => {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
};

/** 1536000 → "1.5 MB". */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};