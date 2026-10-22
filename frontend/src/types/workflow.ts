/**
 * Enhanced, enterprise-grade Workflow Engine Schema
 * Designed for scalability, extensibility, and robust execution tracking.
 * Inspired by n8n, Temporal, and Apache Airflow.
 */

// ============================================================================
// Core Enums & Utility Types
// ============================================================================

export type ActionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'error'
  | 'skipped'
  | 'paused'
  | 'waiting'
  | 'success'
  | 'failed';

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived' | 'failed' | 'completed';
export type LogLevel = 'info' | 'warning' | 'error' | 'success' | 'debug';
export type VariableScope = 'global' | 'local' | 'secret';
export type ConnectionType = 'success' | 'error' | 'conditional' | 'default';
export type ErrorHandlingStrategy = 'continue' | 'stop' | 'retry' | 'fallback';

export type ActionAvailabilityState = 'available' | 'unavailable';

export interface ActionAvailability {
  state: ActionAvailabilityState;
  code?: string;
  reason?: string;
}

export interface APIConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  auth?: Record<string, any>;
  timeout?: number;

  // Common fields used in automation configs
  bodyType?: 'json' | 'form-data' | string;
  authType?: string;
  retryPolicy?: Record<string, any>;
  errorHandling?: string;
}

// ============================================================================
// Action & Execution Definitions
// ============================================================================

/**
 * Defines a single executable node/step within a workflow.
 */
import type { PluginContract } from './pluginContract';

export interface WorkflowAction extends Partial<PluginContract> {
  // --- Core Identity ---
  id: string;
  type: string;
  category: string;
  name: string;
  description: string;
  icon: string;

/**
 * Optional image filename stored inside public/plugins.
 * Example: "ness_report_input.png"
 */
logo?: string;

color?: string;

  // --- UI/Display Metadata ---
  group?: string;
  badge?: string;
  /** Structural marker for workflow-control nodes (e.g. Start/End); excluded from required-field validation. */
  isControlNode?: boolean;
  complexity?: 'basic' | 'intermediate' | 'advanced' | string;
  estimatedTime?: number;
  supportsStreaming?: boolean;
  requiresAuth?: boolean;
  retryable?: boolean;
  aiHints?: {
    promptTemplate?: string;
    expectedInput?: string[];
    expectedOutput?: string[];
  };

  // --- UI/Canvas Properties ---
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isCollapsed?: boolean;
  selected?: boolean;
  /** UI-only: visually dim/disable a node on the canvas. Not an execution status. */
  disabled?: boolean;
  /**
   * Optional action-level availability override. Package-level availability
   * remains the normal source of truth for catalogue actions.
   */
  availability?: ActionAvailability;

  // --- Configuration ---
  properties?: Record<string, any>;
  api?: APIConfig;
  propertyConfig?: Record<string, any>;

  // --- Execution Control ---
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  onError?: ErrorHandlingStrategy;
  fallbackActionId?: string;
  dependsOn?: string[];

  // --- Input/Output Mapping ---
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;

  // --- Runtime State ---
  status?: ActionStatus;
  executionTime?: number;
  startedAt?: string;
  finishedAt?: string;
  lastRunId?: string;

  // --- Metadata ---
  tags?: string[];
  notes?: string;
  version?: string;
}

// ============================================================================
// Variables & Data Management
// ============================================================================

/**
 * Defines a variable available within the workflow context.
 */
export interface WorkflowVariable {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'dictionary';
  value: any;
  description?: string;
  isSecret?: boolean;

  // --- Enhanced Properties ---
  scope?: VariableScope;
  defaultValue?: any;
  required?: boolean;
  validationRules?: Record<string, any>; // e.g., { min: 0, max: 100, pattern: '...' }
  masked?: boolean; // Should the value be masked in the UI? (Even if not a strict 'secret')
  lastUpdated?: string; // ISO Timestamp
}

// ============================================================================
// Connections & Routing
// ============================================================================

/**
 * Defines a directed edge between two WorkflowActions.
 * Unified and enhanced connection interface.
 */
export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;

  // --- Routing Logic ---
  type?: ConnectionType;
  condition?: string; // Expression to evaluate (e.g., "data.status === 'success'")
  conditionType?: 'script' | 'expression';
  priority?: number; // Execution priority for multiple outgoing paths (lower number = higher priority)
  routingStrategy?: 'first-match' | 'all-match'; // How to handle multiple valid outgoing connections from a node

  // --- UI/Visual Properties ---
  label?: string;
  labelStyle?: Record<string, any>;
  sourcePort?: string; // Specific named port on the source node
  targetPort?: string; // Specific named port on the target node
  sourcePointIndex?: number; // 0-7 for 8 connection points (45° increments)
  style?: 'straight' | 'step' | 'curved' | string;
  color?: string;
  isAnimated?: boolean; // Runtime animation state

  // --- State & Metadata ---
  isDisabled?: boolean;
  isActive?: boolean; // Runtime indication if data passed through recently
  metadata?: Record<string, any>;
}

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * The top-level container for a complete automation process.
 * Compatible with the dynamic workspace store requirements.
 */
export interface Workflow {
  // --- Core Identity ---
  id: string;
  name: string;
  description: string;
  version: string;

  // --- Workspace Integration ---
  parentId?: string | null; // Reference to the parent folder ID in the workspace
  icon?: string; // Display icon for the workspace directory
  type?: 'workflow'; // Discriminator for workspace item type

  // --- Components ---
  actions: WorkflowAction[];
  variables: WorkflowVariable[];
  connections: Connection[];
  triggers?: Trigger[];
  schedule?: Schedule;

  // --- Execution Settings ---
  status?: WorkflowStatus;
  concurrency?: number; // Max concurrent runs (0 = unlimited)
  timeout?: number; // Global workflow timeout in ms
  retryPolicy?: Record<string, any>; // Global retry configuration

  // --- Environment & Settings ---
  envVariables?: Record<string, string>; // Environment-specific overrides
  settings?: {
    autosave?: boolean;
    loggingLevel?: LogLevel;
    saveExecutionData?: boolean; // Whether to persist full payloads
  };

  // --- Audit & History ---
  createdBy?: string;
  updatedBy?: string;
  createdAt: string; // ISO Timestamp
  updatedAt: string; // ISO Timestamp
  lastRun?: string; // ISO Timestamp or string description of last run for UI
  versionHistory?: Array<{ version: string; savedAt: string; savedBy: string; description?: string }>;

  // --- Analytics Summary ---
  analytics?: WorkflowMetrics;
}

// ============================================================================
// Triggers & Scheduling
// ============================================================================

/**
 * Defines an event that initiates a workflow execution.
 */
export interface Trigger {
  id: string;
  type: 'manual' | 'schedule' | 'file-watcher' | 'webhook' | 'email' | 'event';
  name: string;
  description?: string;
  enabled: boolean;
  properties: Record<string, any>; // Specific configuration based on type (e.g., webhook URL, file path)

  // --- Enhanced Properties ---
  scheduleId?: string; // Link to specific schedule if type='schedule'
  conditions?: string[]; // Array of expressions that must evaluate to true to fire
  retryPolicy?: Record<string, any>;
  lastTriggeredAt?: string; // ISO Timestamp
}

/**
 * Defines time-based execution rules.
 */
export interface Schedule {
  enabled: boolean;
  type: 'interval' | 'cron';
  value: string; // Cron expression or interval string (e.g., "5m")
  timezone: string;

  // --- Enhanced Properties ---
  nextRun?: string; // ISO Timestamp
  lastRun?: string; // ISO Timestamp
  retryOnFailure?: boolean;
  maxRuns?: number; // Limit total executions (0 = unlimited)
}

// ============================================================================
// Execution Tracking & Logging
// ============================================================================

/**
 * Detailed record of a specific event during execution.
 */
export interface ExecutionLog {
  id: string;
  workflowId?: string; // Link to parent workflow
  runId?: string; // Link to specific execution run
  actionId?: string; // Link to specific action

  timestamp: string; // ISO Timestamp
  level: LogLevel;
  message: string;

  // --- Enhanced Properties ---
  data?: any; // Payload or context data
  error?: any; // Error object or message
  stackTrace?: string; // Detailed stack trace for errors
  duration?: number; // Duration of the logged operation in ms
  metadata?: Record<string, any>; // Additional context
  statusSnapshot?: ActionStatus; // Status at the time of logging
}

/**
 * Represents a complete, end-to-end execution of a workflow.
 * (NEW)
 */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: ActionStatus;

  startedAt: string; // ISO Timestamp
  finishedAt?: string; // ISO Timestamp
  duration?: number; // Total execution time in ms

  triggeredBy?: string; // ID of Trigger or User ID

  executionStates: ActionExecutionState[]; // State of individual nodes during this run
  logs: ExecutionLog[];
  metrics?: Record<string, any>;
}

/**
 * Snapshot of an action's state during a specific WorkflowRun.
 * (NEW)
 */
export interface ActionExecutionState {
  actionId: string;
  status: ActionStatus;

  startedAt: string; // ISO Timestamp
  finishedAt?: string; // ISO Timestamp
  duration?: number; // Duration in ms

  retries: number; // Number of times retried during this run

  input?: any; // Data received by the action
  output?: any; // Data produced by the action
  error?: any; // Error details if failed
}

// ============================================================================
// Library & Organization
// ============================================================================

/**
 * Represents a group of available actions in the UI library.
 */
export interface AutomationCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;

  metadata?: {
    tags?: string[];
    featured?: boolean;
    popularityScore?: number;
    order?: number;
    group?: string;
    [key: string]: any;
  };

  ui?: {
    gradient?: string;
    iconBg?: string;
    borderGlow?: boolean;
    cardStyle?: string;
    [key: string]: any;
  };

  control?: {
    enabled?: boolean;
    version?: string;
    availability?: ActionAvailability;
    [key: string]: any;
  };

  actions: Array<Omit<WorkflowAction, 'id' | 'x' | 'y'> & Partial<PluginContract>>;
}

/**
 * Aggregated statistics for a workflow over time.
 * (NEW)
 */
export interface WorkflowMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number; // Percentage (0-100)
  avgExecutionTime: number; // In ms
  lastRunAt?: string; // ISO Timestamp
  lastRunStatus?: ActionStatus;
}

// ============================================================================
// Workflow-wide Data Carry-Forward
// ============================================================================
//
// The execution context is the single store that every node reads from and
// writes to during a run. It is what makes a value produced by *any* node
// available to *every* later node, rather than only to the immediately
// connected one.

/** Which bucket of the context a node's output was classified into. */
export type OutputBucket =
  | 'apiResponse'
  | 'databaseResult'
  | 'fileReference'
  | 'extractedText'
  | 'computed'
  | 'generic';

/**
 * Everything the engine knows about one node's execution during a run.
 * Persisted in the context and reused for bindings, previews and snapshots.
 */
export interface NodeOutputRecord {
  /** Canvas node id. Stable across renames. */
  nodeId: string;
  /** Node display name at execution time. */
  nodeName: string;
  /** Binding-safe key derived from the name, e.g. "ReadEmployeeExcel". */
  stepKey: string;
  type?: string;
  category?: string;

  /**
   * Scheduler identity for this physical execution of the canvas node. Outside
   * loops it is normally the node id; inside loops it includes the active
   * loop/iteration path. Retries of the same physical execution keep the same
   * key. Optional for backward compatibility with snapshots written before
   * iteration-level execution history was introduced.
   */
  executionInstanceKey?: string;

  /**
   * Physical execution-instance order within the run. Unlike `sequence`, which
   * is the stable logical step position used by the normal UI, this advances
   * when the same node executes again in a later loop iteration.
   */
  executionInstanceSequence?: number;

  /** Position in the logical executed-node order, starting at 1. */
  sequence: number;
  status: ActionStatus;
  bucket: OutputBucket;

  /**
   * How many times the node was attempted, starting at 1. Values above 1 mean
   * the retry policy re-ran it; the record always reflects the FINAL attempt.
   */
  attempt?: number;

  startedAt: string;
  finishedAt?: string;
  durationMs?: number;

  /** Payload the node received (already resolved from the context). */
  input?: any;
  /** Payload the node produced. This is what later nodes bind to. */
  output?: any;
  /** Dot-path map of the output, powering `{{key}}` shorthand lookups. */
  flattened?: Record<string, any>;
  /**
   * Per-branch record counts for a step that declares output ports, captured
   * at record time so the Execution Results panel can report
   * "1,180 matched / 68 unmatched" without re-deriving it, and so a restored
   * snapshot reports the same thing. Absent for single-output steps.
   */
  branches?: Array<{
    id: string;
    label: string;
    tone?: 'primary' | 'exception' | 'neutral';
    recordCount: number | null;
    absent: boolean;
    description?: string;
  }>;
  error?: { message: string; stack?: string } | null;
}

/**
 * The layered lookup object handed to the expression resolver. Bare keys
 * resolve through the merged top level; namespaced keys resolve through the
 * explicit sub-objects.
 */
export interface ExecutionScope extends Record<string, any> {
  vars: Record<string, any>;
  variables: Record<string, any>;
  previous: Record<string, any>;
  prev: Record<string, any>;
  steps: Record<string, any>;
  nodes: Record<string, any>;
  runtime: Record<string, any>;
  files: Record<string, any>;
  env: Record<string, any>;
  run: Record<string, any>;
  workflow: Record<string, any>;
  input: any;
  self: Record<string, any>;
}

/**
 * Serialisable image of a run's context. Written after every node so an
 * interrupted run can be inspected — or resumed — afterwards.
 */
export interface ExecutionSnapshot {
  version: 1;
  runId: string;
  workflowId: string;
  workflowName?: string;
  status: ActionStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;

  variables: Record<string, any>;
  runtime: Record<string, any>;
  files: Record<string, any>;
  env: Record<string, any>;

  /** Executed logical nodes in order. One latest record per canvas node. */
  outputs: NodeOutputRecord[];

  /**
   * Physical node executions in scheduler order. This is additive execution
   * history: loop iterations and retry attempts live here while `outputs` stays
   * clean and backward-compatible for bindings and the normal Execution Panel.
   */
  executionInstances?: NodeOutputRecord[];

  /** Node id of the most recently completed node. */
  previousNodeId?: string | null;
  logs?: ExecutionLog[];
  metrics?: {
    totalNodes: number;
    completed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
}

// ============================================================================
// UI Binding Descriptors
// ============================================================================

/** One bindable value offered by the Properties Panel picker. */
export interface BindingSource {
  /** Token to insert, e.g. `{{steps.ReadEmployeeExcel.employeeId}}`. */
  token: string;
  /** Path without braces, used for search and for the expression editor. */
  path: string;
  label: string;
  /** `string` | `number` | `object` | `array` | … */
  valueType: string;
  /** Short preview of the last known value, if any. */
  preview?: string;
  description?: string;
  isSecret?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  DATASET                                   */
/* -------------------------------------------------------------------------- */

/**
 * Logical value types shared by every tabular source — Excel, CSV, JDBC,
 * Google Sheets, REST tables. Mirrors the backend `ValueType` enum exactly, so
 * a column's type means the same thing on both sides of the wire.
 */
export type DataSetValueType =
  | 'STRING'
  | 'INTEGER'
  | 'DECIMAL'
  | 'DOUBLE'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP'
  | 'TIME'
  | 'BINARY'
  | 'NULL'
  | 'MIXED';

export interface DataSetColumn {
  name: string;
  sourceName?: string;
  index: number;
  /** Source-specific hint, such as an Excel column letter. */
  address?: string;
  type: DataSetValueType;
  mixedTypes?: boolean;
  nullable?: boolean;
  precision?: number;
  scale?: number;
  maxLength?: number;
  samples?: string[];
}

export interface DataSetColumnStatistics {
  column: string;
  type: DataSetValueType;
  count: number;
  nullCount: number;
  nonNullCount: number;
  distinctCount: number;
  distinctApproximate?: boolean;
  min?: number | string;
  max?: number | string;
  sum?: number | string;
  mean?: number | string;
  median?: number | string;
  stdDev?: number | string;
  minDate?: string;
  maxDate?: string;
  minLength?: number;
  maxLength?: number;
  topValues?: Record<string, number>;
}

/**
 * A tabular payload, whatever produced it.
 *
 * `rows` may be absent: a handle describes a dataset that stayed on the server.
 * That is the normal case for anything large, and it is why `columns` rather
 * than the first row is the authority on what fields exist.
 */
export interface DataSetPayload {
  schemaVersion: string;
  datasetId: string;
  source?: { type: string; name?: string; container?: string; attributes?: Record<string, any> };
  columns?: DataSetColumn[];
  rowCount: number;

  rows?: Array<Record<string, any>>;
  rowNumbers?: number[];
  page?: { offset: number; limit: number; returned: number; total: number; hasMore: boolean };

  statistics?: Record<string, DataSetColumnStatistics>;
  columnValues?: Record<string, any[]>;
  cells?: Record<string, any>;
  rowsByNumber?: Record<string, Record<string, any>>;
  indexes?: Record<string, Record<string, number[]>>;

  /** Legacy fields, carrying exactly what the pre-DataSet contract returned. */
  sheetName?: string;
  headers?: string[];
  data?: Array<Record<string, string>>;
  totalRows?: number;
  totalColumns?: number;

  metadata?: Record<string, any>;
}

export interface BindingSourceGroup {
  id: string;
  label: string;
  /** lucide-react icon name. */
  icon: string;
  description?: string;
  /**
   * True for the group holding transport / diagnostic values (status codes,
   * headers, wrappers, timings). Still fully bindable — the flag only tells
   * the picker to keep it out of the default browsing experience.
   */
  isTechnical?: boolean;
  /** Render this group collapsed until the user asks for it. */
  defaultCollapsed?: boolean;
  sources: BindingSource[];
}