import type { LucideIcon } from 'lucide-react';

/**
 * Domain types shared across the Agents module.
 * Adding a new backend agent only requires extending `data.ts` — no type
 * changes are needed unless the agent exposes a different response contract.
 */

/* --------------------------------- Catalog -------------------------------- */

export type AgentStatus = 'active' | 'coming-soon';

export interface AgentDefinition {
  /** Stable identifier, also used as the React key. */
  id: string;
  /** Display name shown on the catalog card. */
  name: string;
  /** Short, one-line summary of what the agent does. */
  description: string;
  /** Free-form category label (e.g. "Security", "Compliance"). */
  category: string;
  /** Only `active` agents are navigable; everything else renders "Coming Soon". */
  status: AgentStatus;
  /** Lucide icon component rendered on the card. */
  icon: LucideIcon;
  /** Route to navigate to when an active agent is opened. */
  route?: string;
  /** Optional tags surfaced on the card footer. */
  tags?: string[];
}

/* ------------------------- Vulnerability Scanner -------------------------- */

/** Request payload accepted by POST /VulnerabilityScanner/api/triage/run. */
export interface TriageRequest {
  scanId: string;
  project: string;
  language: string;
  reportPath: string;
  repositoryPath: string;
  sanitizerConfigPath: string;
  outputDirectory: string;
  confidenceThreshold: number;
}

/**
 * Backend verdicts. Kept open-ended (`string & {}`) so the UI keeps autocomplete
 * for the known values while still rendering any future verdict the backend adds.
 */
export type Verdict =
  | 'AUTO_CLOSED_FP'
  | 'HIGH_CONFIDENCE_TP'
  | (string & {});

export interface PathEvidence {
  file: string;
  line: number;
  nodeType: string;
  symbol: string;
  methodFqn: string;
  code: string;
}

export interface Finding {
  id: string;
  rule: string;
  severity: string;
  file: string;
  line: number;
  verdict: Verdict;
  confidence: number;
  reason: string;
  sanitizerMatched: string | null;
  pathEvidence: PathEvidence[];
}

export interface ScanSummary {
  totalFindings: number;
  autoClosed: number;
  likelyFp: number;
  probableTp: number;
  highConfidenceTp: number;
}

export interface ScanResponse {
  scanId: string;
  project: string;
  generatedAt: string;
  summary: ScanSummary;
  findings: Finding[];
}

/** Metadata used to render the (empty) request form generically. */
export interface TriageFormField {
  key: keyof TriageRequest;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
  required: boolean;
}

/* ------------------------- Voice Transcription ---------------------------- */

/** Known sentiments, left open-ended so any future label still renders. */
export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | (string & {});

/** A single diarized utterance from the transcription backend. */
export interface TranscriptionSegment {
  speaker: string;
  text: string;
}

/**
 * Response of POST /voice_transcription/api/transcription/upload.
 * Field names mirror the backend payload exactly.
 */
export interface TranscriptionResponse {
  fileName: string;
  transcriptionText: TranscriptionSegment[];
  confidenceScore: number;
  overallSentiment: Sentiment;
  positivePercent: number;
  negativePercent: number;
  neutralPercent: number;
  processingTimeMs: number;
}