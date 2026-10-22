import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkflowAction, WorkflowVariable, BindingSourceGroup } from '../types/workflow';
import { BindingPicker, BindingPreview } from './BindingPicker';
import { containsToken } from '../lib/expression';
import { evaluateToken } from '../lib/expression';
import { applyFieldVisibility } from '../lib/fieldVisibility';
import { columnsFromOutput } from '../lib/outputSchema';
import AdvanceRestClientEditor from './ui/AdvanceRestClientEditor';

// Minimal structural typing for the Chromium File System Access API handle
// that is forwarded to the editor alongside the picked File. The editor uses
// it to re-read fresh bytes per node and write updated workbooks back to disk.
import type { LocalFileHandle } from '../types/fileSystem';

// showOpenFilePicker is Chromium-only (Chrome / Edge). When available, picking
// through it yields a writable handle so workflow writes land in the actual
// file; elsewhere the field falls back to a plain <input type="file">.
const supportsFileSystemAccess =
  typeof window !== 'undefined' &&
  typeof (window as any).showOpenFilePicker === 'function';

interface PropertiesPanelProps {
  action: WorkflowAction | null;
  onUpdateAction: (action: WorkflowAction) => void;
  onFileSelected?: (
    actionId: string,
    fieldPath: string,
    file: File | null,
    fileHandle?: LocalFileHandle | null
  ) => void;
  /**
   * Asks the editor whether a real File object is currently cached for a file
   * field (fieldPath uses the same "a::b" path convention as onFileSelected).
   * Saved workflows only persist the file *name*, so when this returns false
   * for a non-empty value, the file must be re-selected before running.
   */
  hasSelectedFile?: (actionId: string, fieldPath: string) => boolean;
  /**
   * Asks the editor whether the field is backed by a writable disk handle
   * (File System Access API), i.e. whether workflow writes will be saved back
   * to the original file rather than downloaded as a copy.
   */
  hasWritableHandle?: (actionId: string, fieldPath: string) => boolean;
  isOpen: boolean;
  onToggle: () => void;
  variables: WorkflowVariable[];
  /**
   * Everything this node can bind to: workflow variables, the previous node's
   * output, every earlier step's output, and run metadata. Built by the editor
   * from the live workflow graph plus the most recent run, so the picker only
   * ever offers values that will actually exist when the node executes.
   */
  bindingGroups?: BindingSourceGroup[];
  /**
   * Scope used to resolve inline previews. This is the SAME scope shape the
   * executor builds, so 'what will be sent' is never an approximation.
   */
  previewScope?: Record<string, any>;
  className?: string;
}

type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'password'
  | 'url'
  | 'email'
  | 'date'
  | 'time'
  | 'file'
  | 'object'
  | 'array';

interface PropertyConfig {
  type?: FieldType;
  uiType?: string;
  label?: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  rows?: number;
  required?: boolean;
  description?: string;
  schema?: Record<string, PropertyNode>;
  /** Row shape for `object-grid`, or field shape for `object-fields`. */
  itemSchema?: Record<string, PropertyConfig>;
  /** Label for the add button on grid and list controls. */
  addLabel?: string;
  /** Column headers for the `key-value` builder. */
  keyLabel?: string;
  valueLabel?: string;
  /** Groups fields into sections in the panel. */
  group?: string;
  [key: string]: any;
}

type PropertyNode = PropertyConfig | Record<string, any>;

const SPRING_TABS = {
  type: 'spring',
  stiffness: 380,
  damping: 38,
} as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const META_KEYS = new Set([
  'type',
  'uiType',
  'label',
  'placeholder',
  'options',
  'min',
  'max',
  'rows',
  'required',
  'description',
  'schema',
  'itemSchema',
  'addLabel',
  'keyLabel',
  'valueLabel',
  'group',
]);

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
};

const deepClone = <T,>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const pathToKey = (path: string[]) => path.join('::');

const humanizeKey = (key: string) =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const getValueAtPath = (obj: any, path: string[]) => {
  return path.reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
};

const setValueAtPath = (
  obj: Record<string, any>,
  path: string[],
  value: any
) => {
  const clone = deepClone(obj ?? {});
  let cursor: any = clone;

  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!isPlainObject(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[path[path.length - 1]] = value;
  return clone;
};

const isFieldConfig = (node: PropertyNode): node is PropertyConfig => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return (
    Object.prototype.hasOwnProperty.call(node, 'type') ||
    Object.prototype.hasOwnProperty.call(node, 'uiType') ||
    Object.prototype.hasOwnProperty.call(node, 'options') ||
    Object.prototype.hasOwnProperty.call(node, 'rows') ||
    Object.prototype.hasOwnProperty.call(node, 'min') ||
    Object.prototype.hasOwnProperty.call(node, 'max')
  );
};

// Fields the panel must never render, regardless of what a node's saved
// propertyConfig contains. `operationType` is an internal routing constant for
// the File Operations backend (a fixed per-action value sent in the request
// body, not something an end user edits). A field can also opt out per-config
// with `hidden: true`. This is checked before rendering AND before validation,
// so older nodes that snapshotted the field still stop showing it.
const HIDDEN_FIELD_KEYS = new Set<string>(['operationType']);

const isHiddenField = (key: string, node: PropertyNode): boolean =>
  HIDDEN_FIELD_KEYS.has(key) ||
  (isFieldConfig(node) && (node as any).hidden === true);

const getNodeChildren = (node: PropertyNode): Record<string, PropertyNode> => {
  if (!isPlainObject(node)) return {};

  if (isPlainObject(node.schema)) {
    return node.schema as Record<string, PropertyNode>;
  }

  const out: Record<string, PropertyNode> = {};
  Object.entries(node).forEach(([key, value]) => {
    if (META_KEYS.has(key)) return;
    out[key] = value as PropertyNode;
  });
  return out;
};

const inferConfigFromValue = (
  key: string,
  value: any
): PropertyConfig => {
  const label = humanizeKey(key);
  const lower = key.toLowerCase();

  if (typeof value === 'boolean') {
    return { type: 'boolean', label };
  }

  if (typeof value === 'number') {
    return { type: 'number', label, min: 0 };
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      label,
      uiType: 'json-editor',
      rows: 5,
    };
  }

  if (isPlainObject(value)) {
    return {
      type: 'object',
      label,
      schema: inferSchemaFromObject(value),
    };
  }

  let type: FieldType = 'string';
  let rows = 3;

  if (lower.includes('url') || String(value ?? '').startsWith('http')) {
    type = 'url';
  } else if (lower.includes('email') || String(value ?? '').includes('@')) {
    type = 'email';
  } else if (lower.includes('password')) {
    type = 'password';
  } else if (
    lower.includes('body') ||
    lower.includes('message') ||
    lower.includes('description') ||
    lower.includes('content') ||
    lower.includes('query') ||
    lower.includes('payload') ||
    lower.includes('rawcontent') ||
    lower.includes('headers')
  ) {
    type = 'textarea';
    rows = 5;
  }

  if (lower === 'method' || lower === 'httpmethod') {
    type = 'select';
  }

  return {
    type,
    label,
    rows,
  };
};

const inferSchemaFromObject = (
  obj: Record<string, any>
): Record<string, PropertyNode> => {
  const schema: Record<string, PropertyNode> = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    schema[key] = inferConfigFromValue(key, value);
  });
  return schema;
};

const isEmptyValue = (value: any) => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
};

const stringifyJson = (value: any) => {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatDateForInput = (value: any) => {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0].slice(0, 10);
  // Accept a full ISO timestamp and trim it to the date portion.
  if (text.includes('T')) return text.split('T')[0];
  return text;
};

// Normalise stored time values to the 24h "HH:mm" an <input type="time"> needs.
// Accepts "HH:mm", "HH:mm:ss", a full ISO timestamp, or a 12h "h:mm AM/PM"
// (so older nodes that stored "7:55 PM" still display in the picker).
const formatTimeForInput = (value: any) => {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();

  if (text.includes('T')) {
    const timePart = text.split('T')[1] ?? '';
    const isoHm = timePart.match(/^(\d{2}):(\d{2})/);
    if (isoHm) return `${isoHm[1]}:${isoHm[2]}`;
  }

  const ampm = text.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let hour = parseInt(ampm[1], 10) % 12;
    if (/[Pp][Mm]/.test(ampm[3])) hour += 12;
    return `${String(hour).padStart(2, '0')}:${ampm[2]}`;
  }

  const hm = text.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`;

  return text;
};

// Convert the 24h "HH:mm" an <input type="time"> produces into the 12h
// "h:mm AM/PM" form the backend's time parser accepts (the format proven to
// work via Postman, e.g. "7:55 PM"). The conversion is exact — "13:18" → "1:18
// PM", "01:18" → "1:18 AM" — and `formatTimeForInput` reads this form back, so
// the picker still displays the stored value correctly.
const to12HourTime = (hhmm: string): string => {
  if (!hhmm) return '';
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${meridiem}`;
};

// Attachments are sent to the backend as { fileName, filePath } objects.
// filePath must be a path the backend can read on its own machine.
const createEmptyAttachment = () => ({
  fileName: '',
  filePath: '',
});

const matchesSearch = (text: string, term: string) =>
  text.toLowerCase().includes(term.toLowerCase());

const filterSchemaTree = (
  schema: Record<string, PropertyNode>,
  term: string
): Record<string, PropertyNode> => {
  if (!term.trim()) return schema;

  const filtered: Record<string, PropertyNode> = {};

  Object.entries(schema).forEach(([key, node]) => {
    const nodeLabel = isFieldConfig(node)
      ? node.label ?? humanizeKey(key)
      : (node as any).label ?? humanizeKey(key);

    if (isFieldConfig(node)) {
      const haystack = [
        key,
        nodeLabel,
        node.description ?? '',
        node.type ?? '',
        node.uiType ?? '',
        ...(node.options ?? []),
      ].join(' ');

      if (matchesSearch(haystack, term)) {
        filtered[key] = node;
      }

      return;
    }

    const children = getNodeChildren(node);
    const childFiltered = filterSchemaTree(children, term);
    const haystack = [
      key,
      nodeLabel,
      (node as any).description ?? '',
    ].join(' ');

    if (matchesSearch(haystack, term) || Object.keys(childFiltered).length > 0) {
      filtered[key] = {
        ...(isPlainObject(node) ? node : {}),
        schema: childFiltered,
        label: nodeLabel,
      };
    }
  });

  return filtered;
};

export const getTypeIcon = (type: string) => {
  const common = 'w-3 h-3';

  switch (type) {
    case 'string':
      return <Icons.Type className={`${common} text-emerald-400`} />;
    case 'number':
      return <Icons.Hash className={`${common} text-blue-400`} />;
    case 'boolean':
      return <Icons.ToggleLeft className={`${common} text-violet-400`} />;
    case 'object':
      return <Icons.Braces className={`${common} text-orange-400`} />;
    case 'array':
      return <Icons.List className={`${common} text-amber-400`} />;
    case 'password':
      return <Icons.Lock className={`${common} text-rose-400`} />;
    case 'email':
      return <Icons.Mail className={`${common} text-cyan-400`} />;
    case 'url':
      return <Icons.Link2 className={`${common} text-sky-400`} />;
    default:
      return <Icons.Variable className={`${common} text-slate-500`} />;
  }
};

const PremiumToggle = ({
  checked,
  onChange,
  accentClass = 'peer-checked:bg-[#1A4060] peer-checked:border-[#2A6090]/70 peer-checked:after:bg-sky-300',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  accentClass?: string;
}) => (
  <label className="relative inline-flex items-center cursor-pointer shrink-0">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only peer"
    />
    <div
      className={`
        w-8 h-[18px] rounded-full border transition-all duration-200
        bg-[#070C17] border-white/[0.08]
        after:content-[''] after:absolute after:top-[3px] after:left-[3px]
        after:bg-slate-500 after:rounded-full after:h-3 after:w-3
        after:transition-all after:duration-200 after:shadow-[0_1px_3px_rgba(0,0,0,0.4)]
        peer-checked:after:translate-x-[14px]
        ${accentClass}
      `}
    />
  </label>
);

const CustomDropdown = ({
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Render an empty-string option as a readable "Any" entry.
  const labelFor = (option: string) =>
    option === '' ? 'Any' : option.toUpperCase();

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    return options.filter((option) =>
      labelFor(option).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setSearchTerm('');
        }}
        className={`
          group w-full px-3 py-[7px] bg-[#070C17] text-slate-200 rounded-lg
          border transition-all duration-200 text-[12px] text-left flex items-center justify-between
          shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]
          ${isOpen
            ? 'border-white/[0.14] ring-1 ring-white/[0.06]'
            : 'border-white/[0.07] hover:border-white/[0.11]'}
          ${className ?? ''}
        `}
      >
        <span className={value ? 'text-slate-200' : 'text-slate-500'}>
          {value ? value.toUpperCase() : placeholder ?? 'Select'}
        </span>
        <Icons.ChevronDown
          className={`w-3.5 h-3.5 transition-all duration-200 ${
            isOpen
              ? 'rotate-180 text-slate-400'
              : 'text-slate-600 group-hover:text-slate-500'
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: EASE_OUT }}
              className="absolute z-50 w-full mt-1.5 bg-[#080D1A]/[0.98] backdrop-blur-2xl border border-white/[0.09] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.04)] overflow-hidden"
            >
              <div className="p-1.5 border-b border-white/[0.05]">
                <div className="relative flex items-center">
                  <Icons.Search className="absolute left-2.5 w-3 h-3 text-slate-600 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Filter options…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-[11.5px] bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto panel-scroll">
                {filteredOptions.length > 0 ? (
                  <div className="py-1 px-1">
                    {filteredOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          onChange(option);
                          setIsOpen(false);
                          setSearchTerm('');
                        }}
                        className={`w-full px-2 py-1.5 text-left rounded-lg transition-all duration-100 flex items-center justify-between group/item ${
                          value === option
                            ? 'bg-white/[0.06] text-slate-100'
                            : 'hover:bg-white/[0.04] text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-5 rounded-md flex items-center justify-center text-[8px] font-bold border text-slate-400 bg-white/[0.03] border-white/[0.08]">
                            {option === '' ? '—' : option.slice(0, 3).toUpperCase()}
                          </span>
                          <span className="text-[11.5px] font-medium">
                            {labelFor(option)}
                          </span>
                        </div>
                        {value === option && (
                          <Icons.Check className="w-3 h-3 text-slate-300" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <Icons.SearchX className="w-4 h-4 text-slate-600 mx-auto mb-2" />
                    <p className="text-[11px] text-slate-500">No options found</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// Derive the list of column names to offer in a "field" picker. Rows normally
// arrive from the previous step at run time, so at design time we learn the
// available columns from the sample the user has entered. We prefer the
// conventional `data` property, then fall back to the first sibling that looks
// like an array of row objects. Keys are collected in first-seen order and de-
// duplicated, so a field is offered even if only some rows contain it.
const deriveFieldOptions = (
  draft: any,
  scope?: Record<string, any>,
  datasetProperty?: string
): string[] => {
  if (!draft || typeof draft !== 'object') return [];

  /**
   * Resolve a value that may be a binding token.
   *
   * Column discovery is deliberately source-agnostic. `columnsFromOutput`
   * understands a DataSet (`columns[]`), a legacy sheet (`headers[]`), a bare
   * array of row objects, and the `data` / `rows` / `records` wrappers that
   * JDBC, CSV and REST connectors use — so an Excel read, a database query, a
   * Google Sheets pull, a REST array and an upstream transformation all
   * populate the same dropdown with no per-plugin special casing.
   */
  const resolveToken = (value: any): any => {
    if (typeof value !== 'string' || !value.includes('{{') || !scope) return undefined;
    try {
      const result = evaluateToken(value.replace(/^\s*\{\{|\}\}\s*$/g, '').trim(), scope);
      return result.found ? result.value : undefined;
    } catch {
      return undefined;
    }
  };

  // The action declares which property carries its dataset (`consumesDataSet`).
  // Honouring it matters for the two-input operations: Join and Lookup each
  // bind a second dataset, and the column pickers must offer the columns of the
  // set they actually belong to rather than whichever token resolved first.
  const preferred = datasetProperty ? draft[datasetProperty] : undefined;
  const ordered = preferred === undefined
    ? Object.values(draft)
    : [preferred, ...Object.values(draft)];

  for (const value of ordered) {
    const resolved = resolveToken(value);
    if (resolved === undefined) continue;
    const columns = columnsFromOutput(resolved);
    if (columns.length > 0) return columns;
    // Not a row set — a single object still has usable keys, which is what a
    // REST call returning one record or a variable holding an object gives you.
    if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
      const keys = Object.keys(resolved).filter((k) => !k.startsWith('$'));
      if (keys.length > 0) return keys;
    }
  }

  // Literal rows pasted into the field, and the original behaviour for every
  // action that predates binding-driven inputs.
  const candidates = [(draft as any).data, ...Object.values(draft)];
  for (const candidate of candidates) {
    if (
      Array.isArray(candidate) &&
      candidate.some((row) => row && typeof row === 'object' && !Array.isArray(row))
    ) {
      const keys: string[] = [];
      for (const row of candidate) {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
        }
      }
      return keys;
    }
  }
  return [];
};

// A field picker: a searchable dropdown of the columns detected in the sample
// data, with the ability to type a name that isn't in the list yet (so it still
// works before any sample is added, or for a column only produced upstream).
// Unlike CustomDropdown, field names are shown with their original casing.
const FieldSelect = ({
  value,
  fieldOptions,
  onChange,
  placeholder,
  invalid = false,
  compact = false,
}: {
  value: string;
  fieldOptions: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Draws the required-and-empty border, matching the other grid cells. */
  invalid?: boolean;
  /** Grid-row height, so a picker lines up with the inputs beside it. */
  compact?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return fieldOptions;
    return fieldOptions.filter((option) =>
      option.toLowerCase().includes(q)
    );
  }, [fieldOptions, searchTerm]);

  const typed = searchTerm.trim();
  const showCustom =
    typed.length > 0 &&
    !fieldOptions.some((option) => option.toLowerCase() === typed.toLowerCase());

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const commit = (next: string) => {
    onChange(next);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setSearchTerm('');
        }}
        className={`
          group w-full bg-[#070C17] text-slate-200 text-left flex items-center justify-between
          border transition-all duration-200
          ${compact
            ? 'h-[30px] px-2 rounded-md text-[11.5px]'
            : 'px-3 py-[7px] rounded-lg text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'}
          ${invalid
            ? 'border-rose-500/40'
            : isOpen
              ? 'border-white/[0.14] ring-1 ring-white/[0.06]'
              : 'border-white/[0.07] hover:border-white/[0.11]'}
        `}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-4 h-4 rounded-[5px] flex items-center justify-center bg-white/[0.03] border border-white/[0.08]">
            <Icons.Hash className="w-2.5 h-2.5 text-slate-500" />
          </span>
          <span className={`truncate ${value ? 'text-slate-200' : 'text-slate-500'}`}>
            {value || placeholder || 'Select field'}
          </span>
        </span>
        <Icons.ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-all duration-200 ${
            isOpen
              ? 'rotate-180 text-slate-400'
              : 'text-slate-600 group-hover:text-slate-500'
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: EASE_OUT }}
              className="absolute z-50 w-full mt-1.5 bg-[#080D1A]/[0.98] backdrop-blur-2xl border border-white/[0.09] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.04)] overflow-hidden"
            >
              <div className="p-1.5 border-b border-white/[0.05]">
                <div className="relative flex items-center">
                  <Icons.Search className="absolute left-2.5 w-3 h-3 text-slate-600 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search or type a field…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (filteredOptions.length > 0) commit(filteredOptions[0]);
                        else if (typed) commit(typed);
                      }
                    }}
                    className="w-full pl-7 pr-3 py-1.5 text-[11.5px] bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto panel-scroll">
                <div className="py-1 px-1">
                  {filteredOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => commit(option)}
                      className={`w-full px-2 py-1.5 text-left rounded-lg transition-all duration-100 flex items-center justify-between group/item ${
                        value === option
                          ? 'bg-white/[0.06] text-slate-100'
                          : 'hover:bg-white/[0.04] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 w-4 h-4 rounded-[5px] flex items-center justify-center bg-white/[0.03] border border-white/[0.08]">
                          <Icons.Hash className="w-2.5 h-2.5 text-slate-500" />
                        </span>
                        <span className="text-[11.5px] font-medium truncate">
                          {option}
                        </span>
                      </div>
                      {value === option && (
                        <Icons.Check className="w-3 h-3 shrink-0 text-slate-300" />
                      )}
                    </button>
                  ))}

                  {showCustom && (
                    <button
                      type="button"
                      onClick={() => commit(typed)}
                      className="w-full px-2 py-1.5 mt-0.5 text-left rounded-lg transition-all duration-100 flex items-center gap-2 border border-dashed border-white/[0.1] hover:border-white/[0.18] text-slate-400 hover:text-slate-200"
                    >
                      <Icons.Plus className="w-3 h-3 shrink-0" />
                      <span className="text-[11.5px] font-medium truncate">
                        Use “{typed}”
                      </span>
                    </button>
                  )}

                  {filteredOptions.length === 0 && !showCustom && (
                    <div className="p-4 text-center">
                      <p className="text-[11px] text-slate-500 leading-snug">
                        {fieldOptions.length === 0
                          ? 'No columns detected yet. Add a sample row above, or type a field name.'
                          : 'No matching field.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// Map a field group name (e.g. "Authentication", "Meeting") to a section icon.
// Groups are opt-in per field via propertyConfig.group; fields without a group
// render exactly as before (no header), so existing categories are unaffected.
const groupIconFor = (group: string): React.ElementType => {
  const key = group.toLowerCase();
  if (key.includes('auth') || key.includes('credential')) return Icons.ShieldCheck;
  if (key.includes('team')) return Icons.Users;
  if (key.includes('channel')) return Icons.Hash;
  if (key.includes('meeting') || key.includes('calendar') || key.includes('event'))
    return Icons.Calendar;
  if (key.includes('chat') || key.includes('message')) return Icons.MessageSquare;
  if (key.includes('member') || key.includes('people') || key.includes('attendee'))
    return Icons.UserPlus;
  return Icons.Settings2;
};

const SectionHeader = ({
  icon: Icon,
  label,
  iconClass = 'text-slate-500',
}: {
  icon: React.ElementType;
  label: string;
  iconClass?: string;
}) => (
  <div className="flex items-center gap-2 mb-3">
    <div className={`shrink-0 ${iconClass}`}>
      <Icon className="w-3 h-3" strokeWidth={2} />
    </div>
    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.1em]">
      {label}
    </span>
    <div className="flex-1 h-px bg-white/[0.04]" />
  </div>
);

const FieldWrapper = ({
  label,
  required,
  error,
  description,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-0.5 text-[10.5px] font-medium text-slate-500 select-none pl-0.5">
      {label}
      {required && (
        <span className="text-rose-400/70 ml-0.5 text-[11px] leading-none">
          *
        </span>
      )}
    </label>
    {children}
    <AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, height: 0, y: -2 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-[10.5px] text-rose-400/70 flex items-center gap-1 pt-0.5 overflow-hidden"
        >
          <Icons.AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </motion.p>
      )}
    </AnimatePresence>
    {description && !error && (
      <p className="text-[10.5px] text-slate-600 leading-snug pl-0.5">
        {description}
      </p>
    )}
  </div>
);

// ─── Enterprise data controls ─────────────────────────────────────────────────
//
// Added for the Database Plugin, driven entirely by `uiType` in propertyConfig,
// so no existing action's rendering changes. Each control edits a structured
// value (array of objects, array of strings, or a flat object) in place of the
// raw JSON editor these fields previously fell through to.

type GridColumnConfig = PropertyConfig & { width?: 'sm' | 'md' | 'lg' };

const GRID_WIDTHS: Record<string, string> = {
  sm: 'w-[86px] shrink-0',
  md: 'w-[136px] shrink-0',
  lg: 'flex-1 min-w-[150px]',
};

const gridCellClass = (hasError: boolean) =>
  [
    'w-full h-[30px] px-2 bg-[#070C17] text-slate-200 rounded-md border text-[11.5px]',
    'focus:outline-none placeholder-slate-600 transition-colors',
    hasError
      ? 'border-rose-500/30 focus:border-rose-500/50'
      : 'border-white/[0.07] hover:border-white/[0.11] focus:border-white/[0.15]',
  ].join(' ');

const GridRowButton = ({
  icon,
  title,
  onClick,
  disabled,
  danger,
}: {
  icon: keyof typeof Icons;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => {
  const Icon = Icons[icon] as React.ComponentType<{ className?: string }>;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'h-[30px] w-[26px] shrink-0 rounded-md border border-white/[0.06] flex items-center justify-center transition-colors',
        disabled
          ? 'opacity-25 cursor-not-allowed text-slate-600'
          : danger
            ? 'text-slate-500 hover:text-rose-300 hover:border-rose-500/25 hover:bg-rose-500/[0.06]'
            : 'text-slate-500 hover:text-slate-200 hover:border-white/[0.12] hover:bg-white/[0.03]',
      ].join(' ')}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
};

const AddRowButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full h-[32px] rounded-lg border border-dashed border-white/[0.09] text-[11px] font-medium text-slate-400 hover:text-slate-100 hover:border-white/[0.16] hover:bg-white/[0.02] transition-colors flex items-center justify-center gap-1.5"
  >
    <Icons.Plus className="w-3 h-3" />
    {label}
  </button>
);

const EmptyGridState = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-3.5 text-[11px] text-slate-500 text-center">
    {message}
  </div>
);

/**
 * Array of objects with a fixed shape, rendered as a dynamic grid.
 * Drives `columns`, `filters`, `sort`, `aggregations` and `having`.
 */

/**
 * Picks WHICH upstream output feeds a dataset field.
 *
 * A transformation node has to be told which table to work on. Making that a
 * free-text or JSON field was wrong twice over: a JSON editor rejects a bare
 * `{{previous.data}}` as invalid JSON and refuses to save it, and forcing quotes
 * to satisfy the parser turns the token into a literal string. There was no
 * correct thing to type.
 *
 * More importantly it asked the wrong question. The workflow already knows every
 * earlier step and what each produced, so the user should be choosing from that
 * list — not recalling token syntax. With several upstream plugins, picking
 * "the Salesforce query, not the Excel read" is the normal case, and a text box
 * makes it guesswork.
 *
 * Candidates are discovered by resolving every binding token against the live
 * preview scope and keeping the ones that are actually a list of rows, so the
 * list reflects real data rather than a guess. Row and column counts come from
 * the same resolution, which is why a source can be verified before running.
 */
const DatasetSourceSelect = ({
  value,
  groups,
  scope,
  onChange,
}: {
  value: string;
  groups: BindingSourceGroup[];
  scope: Record<string, any>;
  onChange: (value: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const found: { token: string; label: string; group: string; rows: number; columns: string[] }[] = [];

    groups.forEach((group) => {
      (group.sources ?? []).forEach((source: any) => {
        const token = String(source.token ?? '');
        if (!token || seen.has(token)) return;
        seen.add(token);
        try {
          const result = evaluateToken(token.replace(/^\s*\{\{|\}\}\s*$/g, '').trim(), scope);
          if (!result.found || !Array.isArray(result.value)) return;
          const rows = result.value as any[];
          // A dataset is a list of row objects. A list of strings (headers, tags)
          // is not something a transformation can filter, so it is left out
          // rather than offered and then failing at the backend.
          if (rows.length === 0 || !rows.some((row) => row && typeof row === 'object' && !Array.isArray(row))) return;
          found.push({
            token,
            label: source.label ?? token,
            group: group.label ?? '',
            rows: rows.length,
            columns: columnsFromOutput(rows),
          });
        } catch {
          // Unresolvable tokens simply are not candidates.
        }
      });
    });
    return found;
  }, [groups, scope]);

  const selected = candidates.find((candidate) => candidate.token === value);
  const showCustom = isCustom || (Boolean(value) && !selected);

  if (showCustom) {
    return (
      <div className="space-y-1.5">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="{{steps['Read Sheet'].data}}"
          className="w-full h-[34px] px-3 bg-[#070C17] text-slate-200 rounded-lg border border-white/[0.07] text-[12px] font-mono focus:outline-none focus:border-white/[0.14]"
        />
        {candidates.length > 0 && (
          <button
            type="button"
            onClick={() => { setIsCustom(false); setIsOpen(true); }}
            className="text-[10.5px] text-sky-400/70 hover:text-sky-300 transition-colors"
          >
            Choose from a previous step instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`w-full px-3 h-[38px] bg-[#070C17] text-left rounded-lg border transition-all duration-200 flex items-center justify-between gap-2 ${
          selected ? 'border-white/[0.07]' : 'border-rose-500/40'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icons.Table2 className="w-3.5 h-3.5 text-sky-400/60 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[12px] text-slate-200 truncate">
              {selected ? selected.label : 'Select a source step…'}
            </span>
            {selected && (
              <span className="block text-[9.5px] text-slate-500 truncate">
                {selected.group} · {selected.rows} rows · {selected.columns.length} columns
              </span>
            )}
          </span>
        </span>
        <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1 w-full max-h-[280px] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0B0F19] shadow-2xl p-1"
          >
            {candidates.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-slate-500">
                No table-shaped output found upstream yet. Run the workflow once, or
                enter an expression manually.
              </div>
            )}
            {candidates.map((candidate) => (
              <button
                key={candidate.token}
                type="button"
                onClick={() => { onChange(candidate.token); setIsOpen(false); }}
                className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                  candidate.token === value ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className="block text-[12px] text-slate-200 truncate">{candidate.label}</span>
                <span className="block text-[9.5px] text-slate-500 truncate">
                  {candidate.group} · {candidate.rows} rows · {candidate.columns.slice(0, 4).join(', ')}
                  {candidate.columns.length > 4 ? '…' : ''}
                </span>
                <span className="block text-[9px] font-mono text-slate-600 truncate">{candidate.token}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setIsCustom(true); setIsOpen(false); }}
              className="w-full text-left px-2.5 py-2 mt-1 rounded-lg border-t border-white/[0.05] text-[11px] text-slate-400 hover:bg-white/[0.04] transition-colors"
            >
              Enter an expression manually…
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ObjectGrid = ({
  rows,
  itemSchema,
  addLabel,
  onChange,
  fieldOptions = [],
  stacked = false,
}: {
  rows: Record<string, any>[];
  itemSchema: Record<string, GridColumnConfig>;
  addLabel: string;
  onChange: (next: Record<string, any>[]) => void;
  /**
   * Lay each row out as a labelled card instead of a horizontal strip.
   *
   * The panel is a fixed 340px and the row reserves 84px for its controls, so
   * roughly 230px is left for cells. Three columns at the default width need
   * more than twice that, which pushes the third field off-screen entirely —
   * a filter whose Value box cannot be reached is not a filter. Opt-in per
   * field, so every existing grid keeps the horizontal layout it was designed
   * for.
   */
  stacked?: boolean;
  /**
   * Column names offered by cells declaring `uiType: 'field-select'`.
   *
   * The grid previously branched only on `type` and `options`, so a
   * `field-select` cell fell through to a plain text box. Every column picker
   * inside a repeating row — filter conditions, sort keys, conversions,
   * aggregations, validation rules — was therefore a blank field the user had
   * to type a column name into from memory, which is exactly the guesswork a
   * picker exists to remove.
   */
  fieldOptions?: string[];
}) => {
  const columns = Object.entries(itemSchema);

  const blankRow = () => {
    const row: Record<string, any> = {};
    columns.forEach(([key, cfg]) => {
      // Optional per-cell defaults are additive: existing grids that do not
      // declare one keep their exact historical blank-row behaviour. This is
      // needed by DTOs where `true`, `1`, or `null` has different semantics
      // from the renderer's old generic false/empty-string defaults.
      if (Object.prototype.hasOwnProperty.call(cfg, 'defaultValue')) {
        row[key] = deepClone((cfg as any).defaultValue);
      } else if (cfg.type === 'boolean') row[key] = false;
      else if (cfg.type === 'array') row[key] = [];
      else if (Array.isArray(cfg.options) && cfg.options.length > 0) row[key] = cfg.options[0];
      else row[key] = '';
    });
    return row;
  };

  const patch = (index: number, key: string, value: any) => {
    const next = rows.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    onChange(next);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {rows.length > 0 && !stacked && (
        <div className="flex items-center gap-1.5 px-0.5">
          {columns.map(([key, cfg]) => (
            <div
              key={key}
              className={`${GRID_WIDTHS[cfg.width || 'md']} text-[9.5px] font-semibold uppercase tracking-wider text-slate-600 truncate`}
              title={cfg.description || cfg.label || key}
            >
              {cfg.label || humanizeKey(key)}
              {cfg.required && <span className="text-rose-400/60 ml-0.5">*</span>}
            </div>
          ))}
          <div className="w-[84px] shrink-0" />
        </div>
      )}

      {rows.map((row, index) => (
        <div
          key={index}
          className={
            stacked
              ? 'rounded-lg border border-white/[0.06] bg-white/[0.012] p-2 space-y-1.5'
              : 'flex items-center gap-1.5'
          }
        >
          {stacked && (
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-600">
                {addLabel.replace(/^\+?\s*Add\s*/i, '') || 'Item'} {index + 1}
              </span>
            </div>
          )}
          {columns.map(([key, cfg]) => {
            const value = row?.[key];
            const invalid = Boolean(cfg.required) && (value === '' || value == null);
            return (
              <div key={key} className={stacked ? 'space-y-1' : GRID_WIDTHS[cfg.width || 'md']}>
                {stacked && (
                  <label
                    className="block text-[9.5px] font-semibold uppercase tracking-wider text-slate-600"
                    title={cfg.description || cfg.label || key}
                  >
                    {cfg.label || humanizeKey(key)}
                    {cfg.required && <span className="text-rose-400/60 ml-0.5">*</span>}
                  </label>
                )}
                {cfg.type === 'boolean' ? (
                  <div className="h-[30px] flex items-center justify-center rounded-md border border-white/[0.06] bg-[#070C17]">
                    <PremiumToggle
                      checked={Boolean(value)}
                      onChange={(v) => patch(index, key, v)}
                      accentClass="peer-checked:bg-[#0E3A5C] peer-checked:border-sky-600/50 peer-checked:after:bg-sky-300"
                    />
                  </div>
                ) : cfg.uiType === 'field-select' ? (
                  <FieldSelect
                    value={String(value ?? '')}
                    fieldOptions={fieldOptions}
                    onChange={(next) => patch(index, key, next)}
                    placeholder={cfg.placeholder || 'Column'}
                    invalid={invalid}
                    compact
                  />
                ) : Array.isArray(cfg.options) && cfg.options.length > 0 ? (
                  <select
                    value={String(value ?? '')}
                    onChange={(e) => patch(index, key, e.target.value)}
                    className={`${gridCellClass(invalid)} appearance-none cursor-pointer`}
                  >
                    <option value="">—</option>
                    {cfg.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : cfg.type === 'array' ? (
                  <input
                    value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                    onChange={(e) =>
                      patch(
                        index,
                        key,
                        e.target.value
                          .split(',')
                          .map((part) => part.trim())
                          .filter(Boolean)
                      )
                    }
                    placeholder={cfg.placeholder || 'a, b, c'}
                    className={gridCellClass(invalid)}
                  />
                ) : (
                  <input
                    type={cfg.type === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    onChange={(e) =>
                      patch(
                        index,
                        key,
                        cfg.type === 'number'
                          ? e.target.value === ''
                            ? (cfg as any).emptyAsNull
                              ? null
                              : ''
                            : Number(e.target.value)
                          : e.target.value === '' && (cfg as any).emptyAsNull
                            ? null
                            : e.target.value
                      )
                    }
                    placeholder={cfg.placeholder}
                    className={gridCellClass(invalid)}
                  />
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-1 w-[84px] shrink-0">
            <GridRowButton icon="ChevronUp" title="Move up" disabled={index === 0} onClick={() => move(index, -1)} />
            <GridRowButton
              icon="ChevronDown"
              title="Move down"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            />
            <GridRowButton
              icon="Trash2"
              title="Delete row"
              danger
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}

      {rows.length === 0 && <EmptyGridState message="No rows yet." />}
      <AddRowButton label={addLabel} onClick={() => onChange([...rows, blankRow()])} />
    </div>
  );
};

/**
 * Array of objects whose columns the user defines at runtime. Drives `records`,
 * where the shape depends on the target table rather than on any fixed schema.
 */
const RecordGrid = ({
  rows,
  addLabel,
  onChange,
}: {
  rows: Record<string, any>[];
  addLabel: string;
  onChange: (next: Record<string, any>[]) => void;
}) => {
  const [newColumn, setNewColumn] = useState('');

  const columns = useMemo(() => {
    const seen: string[] = [];
    rows.forEach((row) =>
      Object.keys(row || {}).forEach((key) => {
        if (!seen.includes(key)) seen.push(key);
      })
    );
    return seen;
  }, [rows]);

  const addColumn = () => {
    const name = newColumn.trim();
    if (!name || columns.includes(name)) return;
    onChange(rows.length === 0 ? [{ [name]: '' }] : rows.map((row) => ({ ...row, [name]: '' })));
    setNewColumn('');
  };

  const removeColumn = (name: string) =>
    onChange(
      rows.map((row) => {
        const next = { ...row };
        delete next[name];
        return next;
      })
    );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={newColumn}
          onChange={(e) => setNewColumn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addColumn();
            }
          }}
          placeholder="New column name, then Enter"
          className={gridCellClass(false)}
        />
        <GridRowButton icon="Plus" title="Add column" onClick={addColumn} />
      </div>

      {columns.length > 0 && (
        <div className="flex items-center gap-1.5 px-0.5">
          {columns.map((column) => (
            <div key={column} className="flex-1 min-w-[110px] flex items-center gap-1">
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-600 truncate">
                {column}
              </span>
              <button
                type="button"
                title={`Remove column ${column}`}
                onClick={() => removeColumn(column)}
                className="text-slate-700 hover:text-rose-300 transition-colors"
              >
                <Icons.X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <div className="w-[84px] shrink-0" />
        </div>
      )}

      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1.5">
          {columns.map((column) => (
            <div key={column} className="flex-1 min-w-[110px]">
              <input
                value={row?.[column] ?? ''}
                onChange={(e) =>
                  onChange(rows.map((r, i) => (i === index ? { ...r, [column]: e.target.value } : r)))
                }
                className={gridCellClass(false)}
              />
            </div>
          ))}
          <div className="flex items-center gap-1 w-[84px] shrink-0">
            <GridRowButton
              icon="Copy"
              title="Duplicate row"
              onClick={() => onChange([...rows.slice(0, index + 1), { ...row }, ...rows.slice(index + 1)])}
            />
            <GridRowButton
              icon="Trash2"
              title="Delete row"
              danger
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}

      {columns.length === 0 && <EmptyGridState message="Add a column to start building records." />}
      {columns.length > 0 && (
        <AddRowButton
          label={addLabel}
          onClick={() =>
            onChange([...rows, Object.fromEntries(columns.map((column) => [column, '']))])
          }
        />
      )}
    </div>
  );
};

/** Flat object edited as key/value pairs. Drives `updates` and `conditions`. */
const KeyValueBuilder = ({
  value,
  keyLabel,
  valueLabel,
  addLabel,
  onChange,
}: {
  value: Record<string, any>;
  keyLabel: string;
  valueLabel: string;
  addLabel: string;
  onChange: (next: Record<string, any>) => void;
}) => {
  // Held as pairs so a half-typed key does not collapse into the object and
  // reorder the remaining rows on every keystroke.
  const [pairs, setPairs] = useState<Array<{ k: string; v: any }>>(() =>
    Object.entries(value || {}).map(([k, v]) => ({ k, v }))
  );
  const signature = JSON.stringify(value || {});
  const lastSignature = useRef(signature);

  useEffect(() => {
    if (signature !== lastSignature.current) {
      lastSignature.current = signature;
      setPairs(Object.entries(value || {}).map(([k, v]) => ({ k, v })));
    }
  }, [signature, value]);

  const commit = (next: Array<{ k: string; v: any }>) => {
    setPairs(next);
    const object: Record<string, any> = {};
    next.forEach(({ k, v }) => {
      if (k.trim()) object[k.trim()] = v;
    });
    lastSignature.current = JSON.stringify(object);
    onChange(object);
  };

  return (
    <div className="space-y-1.5">
      {pairs.length > 0 && (
        <div className="flex items-center gap-1.5 px-0.5">
          <div className="flex-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-600">
            {keyLabel}
          </div>
          <div className="flex-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-600">
            {valueLabel}
          </div>
          <div className="w-[26px] shrink-0" />
        </div>
      )}

      {pairs.map((pair, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            value={pair.k}
            onChange={(e) =>
              commit(pairs.map((p, i) => (i === index ? { ...p, k: e.target.value } : p)))
            }
            placeholder="column"
            className={`${gridCellClass(!pair.k.trim())} flex-1`}
          />
          <input
            value={pair.v ?? ''}
            onChange={(e) =>
              commit(pairs.map((p, i) => (i === index ? { ...p, v: e.target.value } : p)))
            }
            placeholder="value"
            className={`${gridCellClass(false)} flex-1`}
          />
          <GridRowButton
            icon="Trash2"
            title="Remove"
            danger
            onClick={() => commit(pairs.filter((_, i) => i !== index))}
          />
        </div>
      ))}

      {pairs.length === 0 && <EmptyGridState message="No entries yet." />}
      <AddRowButton label={addLabel} onClick={() => commit([...pairs, { k: '', v: '' }])} />
    </div>
  );
};

/** Array of plain strings. Drives `columns`, `group_by`, `params` and `values`. */
const StringListBuilder = ({
  items,
  addLabel,
  placeholder,
  onChange,
}: {
  items: string[];
  addLabel: string;
  placeholder?: string;
  onChange: (next: string[]) => void;
}) => (
  <div className="space-y-1.5">
    {items.map((item, index) => (
      <div key={index} className="flex items-center gap-1.5">
        <input
          value={item ?? ''}
          onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
          placeholder={placeholder}
          className={`${gridCellClass(false)} flex-1`}
        />
        <GridRowButton
          icon="ChevronUp"
          title="Move up"
          disabled={index === 0}
          onClick={() => {
            const next = [...items];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            onChange(next);
          }}
        />
        <GridRowButton
          icon="Trash2"
          title="Remove"
          danger
          onClick={() => onChange(items.filter((_, i) => i !== index))}
        />
      </div>
    ))}
    {items.length === 0 && <EmptyGridState message="Nothing added yet." />}
    <AddRowButton label={addLabel} onClick={() => onChange([...items, ''])} />
  </div>
);

/** Multiline SQL editor with a gutter. Drives the `query` field. */
const SqlEditor = ({
  value,
  rows,
  placeholder,
  hasError,
  onChange,
}: {
  value: string;
  rows: number;
  placeholder?: string;
  hasError: boolean;
  onChange: (next: string) => void;
}) => {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const text = String(value ?? '');
  const lineCount = Math.max(text.split('\n').length, rows);

  return (
    <div
      className={[
        'rounded-xl border overflow-hidden bg-[#060B15] transition-colors',
        hasError ? 'border-rose-500/25' : 'border-white/[0.07] focus-within:border-white/[0.15]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05] bg-white/[0.015]">
        <div className="flex items-center gap-1.5">
          <Icons.Terminal className="w-3 h-3 text-slate-600" />
          <span className="text-[9.5px] font-mono text-slate-600">SQL</span>
        </div>
        <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>
      <div className="flex">
        <div
          ref={gutterRef}
          className="select-none py-2.5 px-2 text-right text-[11px] leading-[1.7] font-mono text-slate-700 bg-white/[0.012] border-r border-white/[0.04] overflow-hidden"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={text}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
            }
          }}
          placeholder={placeholder}
          rows={rows}
          className="flex-1 bg-transparent text-slate-200 font-mono text-[11.5px] leading-[1.7] py-2.5 px-3 resize-y focus:outline-none placeholder-slate-600"
        />
      </div>
    </div>
  );
};

/** Password field with a reveal toggle. */
const PasswordField = ({
  value,
  placeholder,
  hasError = false,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  hasError: boolean;
  className: string;
  onChange: (next: string) => void;
}) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        value={value ?? ''}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${className} pr-9 ${
          hasError ? 'border-rose-500/25 focus:border-rose-500/45' : ''
        }`}
      />
      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        title={revealed ? 'Hide password' : 'Show password'}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
      >
        {revealed ? <Icons.EyeOff className="w-3.5 h-3.5" /> : <Icons.Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

/** Fixed-shape object rendered as stacked fields. Drives add_column's `column`. */
const ObjectFields = ({
  value,
  itemSchema,
  onChange,
}: {
  value: Record<string, any>;
  itemSchema: Record<string, PropertyConfig>;
  onChange: (next: Record<string, any>) => void;
}) => (
  <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.01] p-2.5">
    {Object.entries(itemSchema).map(([key, cfg]) => {
      const current = value?.[key];
      const invalid = Boolean(cfg.required) && (current === '' || current == null);
      if (cfg.type === 'boolean') {
        return (
          <div
            key={key}
            className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-white/[0.05] bg-white/[0.012]"
          >
            <label className="text-[11.5px] font-medium text-slate-300">
              {cfg.label || humanizeKey(key)}
            </label>
            <PremiumToggle
              checked={Boolean(current)}
              onChange={(v) => onChange({ ...(value || {}), [key]: v })}
              accentClass="peer-checked:bg-[#0E3A5C] peer-checked:border-sky-600/50 peer-checked:after:bg-sky-300"
            />
          </div>
        );
      }
      return (
        <div key={key} className="space-y-1">
          <label className="text-[10px] font-medium text-slate-500 pl-0.5 flex items-center gap-0.5">
            {cfg.label || humanizeKey(key)}
            {cfg.required && <span className="text-rose-400/70">*</span>}
          </label>
          {Array.isArray(cfg.options) && cfg.options.length > 0 ? (
            <select
              value={String(current ?? '')}
              onChange={(e) => onChange({ ...(value || {}), [key]: e.target.value })}
              className={`${gridCellClass(invalid)} appearance-none cursor-pointer`}
            >
              <option value="">—</option>
              {cfg.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={current ?? ''}
              placeholder={cfg.placeholder}
              onChange={(e) => onChange({ ...(value || {}), [key]: e.target.value })}
              className={gridCellClass(invalid)}
            />
          )}
          {cfg.description && (
            <p className="text-[10px] text-slate-600 leading-snug pl-0.5">{cfg.description}</p>
          )}
        </div>
      );
    })}
  </div>
);

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  action,
  onUpdateAction,
  onFileSelected,
  hasSelectedFile,
  hasWritableHandle,
  isOpen,
  onToggle,
  variables,
  bindingGroups,
  previewScope,
  className = '',
}) => {
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  // Local buffer for the "Raw Properties" editor so invalid keystrokes are not reverted.
  const [rawJsonDraft, setRawJsonDraft] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'properties' | 'advanced' | 'validation'
  >('properties');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openVariablePickerKey, setOpenVariablePickerKey] = useState<
    string | null
  >(null);
  const inputRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});
  // Buffer refs for the type-to-add inputs used by user-list (tag) fields.
  const tagInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const ActionIcon =
    (Icons[
      (action?.icon as keyof typeof Icons) ?? 'Settings'
    ] as React.ComponentType<any>) || Icons.Settings;

  const actionTypeText = useMemo(() => {
    if (!action) return '';
    return String(action.category || action.type || 'Action');
  }, [action]);

  const isRestAction = useMemo(() => {
    if (!action) return false;
    const haystack = [
      action.name,
      action.type,
      action.category,
      action.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (
      haystack.includes('rest') ||
      haystack.includes('advance-rest-client') ||
      haystack.includes('restclient')
    );
  }, [action]);

  useEffect(() => {
    if (!action) return;
    // Reconcile saved properties against the current propertyConfig. A node
    // persisted under an older action definition can still carry keys the
    // current schema no longer declares (e.g. credential fields removed in a
    // later revision). Drop those keys *only when empty*, so stale fields stop
    // "ghosting" into the panel, while any key that actually holds a value is
    // always preserved and still rendered.
    const incoming = deepClone((action as any).properties ?? {}) as Record<string, any>;
    const cfg = (action as any).propertyConfig;
    let nextDraft: Record<string, any> = incoming;
    if (cfg && isPlainObject(cfg) && Object.keys(cfg).length > 0) {
      const declared = new Set(Object.keys(cfg));
      nextDraft = Object.fromEntries(
        Object.entries(incoming).filter(
          ([key, value]) => declared.has(key) || !isEmptyValue(value)
        )
      );
    }

    // Auto-heal time fields saved by an earlier build. The time picker now
    // stores the 12h "h:mm AM/PM" the backend parses, but nodes saved before
    // that change still hold 24h "HH:mm" (e.g. "01:18"), which previously only
    // converted when the picker was re-opened. Convert any declared time field
    // still in 24h form here, so existing nodes work without re-touching their
    // pickers. `healedTime` marks the node dirty only when something actually
    // changed, so the converted value is persisted by the auto-save effect.
    let healedTime = false;
    if (cfg && isPlainObject(cfg)) {
      Object.entries(cfg).forEach(([key, node]) => {
        const isTime =
          isPlainObject(node) &&
          ((node as any).type === 'time' || (node as any).uiType === 'time');
        const v = nextDraft[key];
        if (isTime && typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) {
          nextDraft[key] = to12HourTime(v.trim());
          healedTime = true;
        }
      });
    }

    setDraft(nextDraft);
    setJsonDrafts({});
    setJsonErrors({});
    setRawJsonDraft(null);
    setHasUnsavedChanges(healedTime);
    setOpenVariablePickerKey(null);
    // Reset only when selecting a different node. Depending on the full action
    // object would reset local drafts after every debounced save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.id]);

  // Debounced auto-save. Guarded by `hasUnsavedChanges` so that re-renders
  // triggered by our own onUpdateAction (which changes the `action` identity)
  // do not re-fire the save in an endless 300ms loop.
  useEffect(() => {
    if (!action || !hasUnsavedChanges) return;
    const t = setTimeout(() => {
      if (Object.keys(jsonErrors).length === 0) {
        onUpdateAction({
          ...action,
          properties: draft,
        });
        setHasUnsavedChanges(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [draft, jsonErrors, action, onUpdateAction, hasUnsavedChanges]);

  const rawSchema = useMemo<Record<string, PropertyNode>>(() => {
    if (!action) return {};

    // Always infer a schema from the current property values as a baseline.
    const inferred = inferSchemaFromObject((draft ?? {}) as Record<string, any>);
    const explicit = (action as any)?.propertyConfig;

    // When an explicit propertyConfig is provided, use it as the source of
    // truth but still surface any extra keys present in the draft that the
    // config doesn't describe — so a field is never silently hidden from the
    // panel. When no usable config exists, fall back to the inferred schema so
    // the panel always renders the action's properties instead of nothing.
    if (explicit && isPlainObject(explicit) && Object.keys(explicit).length > 0) {
      const merged: Record<string, PropertyNode> = { ...explicit };
      Object.keys(inferred).forEach((key) => {
        // Surface an undeclared key only when it holds a value, so a field
        // removed from propertyConfig never reappears as an empty ghost. (The
        // draft is already reconciled on load; this is a second-line guard.)
        if (!(key in merged) && !isEmptyValue((draft as any)?.[key])) {
          merged[key] = inferred[key];
        }
      });
      return applyFieldVisibility(merged, draft as Record<string, any>);
    }

    return applyFieldVisibility(inferred, draft as Record<string, any>);
  }, [action, draft]);

  const visibleSchema = useMemo(() => {
    if (!searchTerm.trim()) return rawSchema;
    return filterSchemaTree(rawSchema, searchTerm.trim());
  }, [rawSchema, searchTerm]);

  const validationIssues = useMemo(() => {
    const issues: { pathKey: string; label: string; message: string }[] = [];

    const walk = (
      schema: Record<string, PropertyNode>,
      values: any,
      path: string[] = []
    ) => {
      Object.entries(schema).forEach(([key, node]) => {
        if (isHiddenField(key, node)) return;
        const nextPath = [...path, key];
        const value = values?.[key];
        const keyPath = pathToKey(nextPath);

        if (isFieldConfig(node)) {
          const label = node.label ?? humanizeKey(key);
          const required = Boolean(node.required);
          const isJsonEditor =
            node.uiType === 'json-editor' ||
            node.type === 'array' ||
            node.type === 'object';

          if (required && isEmptyValue(value)) {
            issues.push({
              pathKey: keyPath,
              label,
              message: 'Required',
            });
          }

          if (isJsonEditor && jsonErrors[keyPath]) {
            issues.push({
              pathKey: keyPath,
              label,
              message: jsonErrors[keyPath],
            });
          }

          if (node.type === 'number' && value !== undefined && value !== null) {
            const num = Number(value);
            if (Number.isNaN(num)) {
              issues.push({
                pathKey: keyPath,
                label,
                message: 'Invalid number',
              });
            }
          }

          // A file field that carries a saved name without a live File object
          // (i.e. the workflow was saved and reloaded) will fail at execution —
          // uploads aren't persisted with workflows. Surface it here so the
          // Check tab flags it before the run does.
          const isFileType = node.type === 'file' || node.uiType === 'file';
          if (
            isFileType &&
            !isEmptyValue(value) &&
            action &&
            hasSelectedFile &&
            !hasSelectedFile(action.id, keyPath)
          ) {
            issues.push({
              pathKey: keyPath,
              label,
              message: "Re-select file — uploads aren't stored with saved workflows",
            });
          }

          return;
        }

        const children = getNodeChildren(node);
        if (Object.keys(children).length > 0) {
          walk(children, value ?? {}, nextPath);
        }
      });
    };

    walk(rawSchema, draft ?? {});

    if (jsonErrors.__raw__) {
      issues.push({
        pathKey: '__raw__',
        label: 'Raw Properties',
        message: jsonErrors.__raw__,
      });
    }

    return issues;
  }, [rawSchema, draft, jsonErrors, action, hasSelectedFile]);

  const updateDraft = useCallback(
    (path: string[], value: any) => {
      setDraft((prev) => setValueAtPath(prev, path, value));
      setHasUnsavedChanges(true);
      // Any structured edit invalidates the raw-editor buffer so it re-syncs.
      setRawJsonDraft(null);
    },
    []
  );

  const updateJsonEditor = useCallback(
    (path: string[], rawText: string, config?: PropertyConfig) => {
      const key = pathToKey(path);
      setJsonDrafts((prev) => ({ ...prev, [key]: rawText }));
      setHasUnsavedChanges(true);

      const trimmed = rawText.trim();
      if (!trimmed) {
        if (config?.required) {
          setJsonErrors((prev) => ({
            ...prev,
            [key]: 'This field is required',
          }));
        } else {
          setJsonErrors((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        return;
      }

      try {
        const parsed = JSON.parse(rawText);
        setDraft((prev) => setValueAtPath(prev, path, parsed));
        setJsonErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } catch {
        setJsonErrors((prev) => ({
          ...prev,
          [key]: 'Invalid JSON',
        }));
      }
    },
    []
  );

  /**
   * Insert a binding token at the caret (or append it). Receives a COMPLETE
   * token such as `{{steps.ReadEmployeeExcel.employeeId}}` — the picker owns
   * token construction now, so nested paths survive intact instead of being
   * re-wrapped as a flat variable name.
   */
  const insertVariable = useCallback(
    (path: string[], token: string) => {
      const key = pathToKey(path);
      const input = inputRefs.current[key];

      const current = String(getValueAtPath(draft, path) ?? '');
      let nextValue = current;

      if (input && typeof input.selectionStart === 'number') {
        const start = input.selectionStart ?? current.length;
        const end = input.selectionEnd ?? current.length;
        nextValue =
          current.slice(0, start) + token + current.slice(end);

        setTimeout(() => {
          input.focus();
          const caret = start + token.length;
          input.selectionStart = caret;
          input.selectionEnd = caret;
        }, 0);
      } else {
        nextValue = current ? `${current}${token}` : token;
      }

      updateDraft(path, nextValue);
      setOpenVariablePickerKey(null);
    },
    [draft, updateDraft]
  );

  /**
   * Effective binding catalogue. Falls back to a variables-only group so the
   * panel still works standalone (e.g. in tests or a preview harness) when the
   * editor has not supplied a live catalogue.
   */
  const effectiveBindingGroups: BindingSourceGroup[] = useMemo(() => {
    if (bindingGroups && bindingGroups.length > 0) return bindingGroups;
    if (variables.length === 0) return [];
    return [
      {
        id: 'variables',
        label: 'Variables',
        icon: 'Variable',
        description: 'Workflow-wide values, readable from every node.',
        sources: variables.map((v) => ({
          token: `{{variables.${v.name}}}`,
          path: `variables.${v.name}`,
          label: v.name,
          valueType: v.type ?? 'string',
          preview: v.isSecret ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : String(v.value ?? ''),
          description: v.description,
          isSecret: Boolean(v.isSecret),
        })),
      },
    ];
  }, [bindingGroups, variables]);

  const effectivePreviewScope = useMemo(() => {
    if (previewScope) return previewScope;
    return variables.reduce<Record<string, any>>((acc, v) => {
      acc[v.name] = v.value;
      return acc;
    }, {});
  }, [previewScope, variables]);

  /** Which property carries this action's upstream dataset, if it declares one. */
  const datasetProperty = (action as any)?.consumesDataSet?.property as string | undefined;

  /** Replace a field's entire value with a hand-written expression. */
  const applyExpression = useCallback(
    (path: string[], expression: string) => {
      updateDraft(path, expression);
      setOpenVariablePickerKey(null);
    },
    [updateDraft]
  );

  const renderVariablePicker = (path: string[]) => {
    const key = pathToKey(path);
    if (openVariablePickerKey !== key) return null;

    return (
      <BindingPicker
        groups={effectiveBindingGroups}
        value={String(getValueAtPath(draft, path) ?? '')}
        previewScope={effectivePreviewScope}
        onInsert={(token) => insertVariable(path, token)}
        onReplace={(expression) => applyExpression(path, expression)}
        onClose={() => setOpenVariablePickerKey(null)}
      />
    );
  };

  const renderJsonEditor = (
    path: string[],
    config: PropertyConfig,
    value: any
  ) => {
    const key = pathToKey(path);
    const display = jsonDrafts[key] ?? stringifyJson(value ?? (config.type === 'array' ? [] : {}));

    return (
      <div className="relative">
        <textarea
          value={display}
          onChange={(e) => updateJsonEditor(path, e.target.value, config)}
          rows={config.rows || 5}
          spellCheck={false}
          className={`
            w-full px-3.5 py-3 font-mono text-[11px] leading-[1.75]
            bg-transparent focus:outline-none resize-y
            transition-colors duration-200
            ${jsonErrors[key] ? 'text-rose-300/80' : 'text-cyan-300/75'}
          `}
          style={{ caretColor: '#67e8f9' }}
        />
        <AnimatePresence>
          {jsonErrors[key] && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="px-3 py-2 border-t border-rose-500/15 flex items-center gap-1.5"
              style={{ background: 'rgba(239,68,68,0.04)' }}
            >
              <Icons.AlertCircle className="w-3 h-3 text-rose-400/70 shrink-0" />
              <span className="text-[10.5px] text-rose-400/70">
                {jsonErrors[key]}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderPrimitiveField = (
    key: string,
    config: PropertyConfig,
    path: string[],
    value: any
  ) => {
    const pathKey = pathToKey(path);
    const error = jsonErrors[pathKey];
    const required = Boolean(config.required);

    // Some hand-authored configs put a nested object in `type` (a sub-schema
    // whose own key happens to be "type"). Coerce non-string values so a stray
    // object can never leak into icon/label helpers or the control switch below.
    const fieldType = typeof config.type === 'string' ? config.type : 'string';
    const uiType = typeof config.uiType === 'string' ? config.uiType : '';
    const isDateField = fieldType === 'date' || uiType === 'date';
    const isFileField = fieldType === 'file' || uiType === 'file';
    const isMultiSelectField =
      uiType === 'multi-select' || uiType === 'checkbox-group';
    const isFileListField =
      uiType === 'file-list' ||
      (fieldType === 'array' && (key.toLowerCase().includes('attachment') || key.toLowerCase().includes('file')));
    // A simple time-of-day picker (sends 24h "HH:mm").
    const isTimeField = fieldType === 'time' || uiType === 'time';
    // A chip/tag control for choosing or typing multiple emails/users.
    const isUserListField =
      uiType === 'user-list' || uiType === 'email-list' || uiType === 'tags';

    const baseInputClass = [
      'w-full px-3 bg-[#070C17] text-slate-200 rounded-lg border transition-all duration-200',
      'focus:outline-none placeholder-slate-600',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]',
      error
        ? 'border-rose-500/25 focus:border-rose-500/45 focus:ring-1 focus:ring-rose-500/15'
        : 'border-white/[0.07] hover:border-white/[0.11] focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.05]',
    ].join(' ');

    const textInputClasses = `${baseInputClass} text-[12px] h-[34px] py-0`;
    const textareaClasses = `${baseInputClass} font-mono text-[11.5px] leading-[1.7] resize-y min-h-[88px] py-2.5`;
    // Any scalar field can be bound. `number` is included deliberately: an
    // enterprise engine must let a numeric field carry `{{previous.count}}`,
    // which is a string until it resolves at run time.
    const showVariableButton = ['string', 'textarea', 'url', 'email', 'password', 'number'].includes(
      fieldType
    ) && !isDateField && !isFileField && !isMultiSelectField && !isFileListField;

    // A numeric field holding a binding must render as text, or the browser
    // silently discards the token.
    const isBoundValue = typeof value === 'string' && containsToken(value);

    const selectedValues = Array.isArray(value)
      ? value.map((item) => String(item))
      : [];
    const attachmentRows = Array.isArray(value)
      ? value
      : [];

    if (fieldType === 'boolean') {
      // A toggle cannot express "whatever the upstream step decided". Before
      // this branch understood tokens, `Boolean(value)` collapsed a bound
      // `{{variables.strictMode}}` to `true` on the first render and the next
      // edit wrote that literal back — the binding was destroyed by being
      // looked at. Swapping the control for the token (and offering the same
      // BindingPicker every text field has) is what makes a boolean a
      // first-class bindable field. `PremiumToggle` itself is untouched.
      const isBoundBoolean = typeof value === 'string' && containsToken(value);

      return (
        <div className="px-3 py-2.5 rounded-lg border border-white/[0.05] bg-white/[0.012] hover:bg-white/[0.02] hover:border-white/[0.08] transition-all duration-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <label className="text-[12px] font-medium text-slate-200 leading-tight">
                {config.label || humanizeKey(key)}
              </label>
              {config.description && (
                <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                  {config.description}
                </p>
              )}
            </div>

            {/* `relative` anchors the BindingPicker, which positions itself
                absolutely against its nearest positioned ancestor. */}
            <div className="relative flex items-center gap-1.5 shrink-0">
              {isBoundBoolean ? (
                <span
                  className="max-w-[160px] truncate px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] font-mono text-[10px] text-cyan-300/80"
                  title={String(value)}
                >
                  {String(value)}
                </span>
              ) : (
                <PremiumToggle
                  checked={Boolean(value)}
                  onChange={(v) => updateDraft(path, v)}
                  accentClass="peer-checked:bg-[#0E3A5C] peer-checked:border-sky-600/50 peer-checked:after:bg-sky-300"
                />
              )}

              <button
                type="button"
                onClick={() =>
                  setOpenVariablePickerKey(
                    openVariablePickerKey === pathKey ? null : pathKey
                  )
                }
                className={`p-1 rounded-md transition-all duration-150 ${
                  openVariablePickerKey === pathKey
                    ? 'bg-white/[0.07] text-slate-200'
                    : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.05]'
                }`}
                title="Bind a value from a previous step"
              >
                <Icons.Link2 className="w-3 h-3" />
              </button>

              {isBoundBoolean && (
                <button
                  type="button"
                  // Clearing restores an explicit `false` rather than deleting
                  // the key: a boolean the user can see is off must serialise
                  // as `false`, not vanish from the payload and re-inherit a
                  // carried value.
                  onClick={() => updateDraft(path, false)}
                  className="p-1 rounded-md text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] transition-all duration-150"
                  title="Clear binding and set to false"
                >
                  <Icons.X className="w-3 h-3" />
                </button>
              )}

              <AnimatePresence>{renderVariablePicker(path)}</AnimatePresence>
            </div>
          </div>

          {isBoundBoolean && (
            <BindingPreview value={value} scope={effectivePreviewScope} />
          )}
        </div>
      );
    }

    // A field is a single-choice dropdown when it declares an option list (or is
    // explicitly typed/ui-typed as a select). Previously only `type: 'select'`
    // was honoured, so fields authored as `type: 'string', uiType: 'select',
    // options: [...]` fell through to a plain text box and their choices were
    // ignored. Multi-select / chip / file / date / time controls are handled by
    // their own branches, so they're excluded here.
    const hasOptionList =
      Array.isArray(config.options) && config.options.length > 0;
    const isDropdownField =
      fieldType === 'select' ||
      uiType === 'select' ||
      (hasOptionList &&
        !isMultiSelectField &&
        !isUserListField &&
        !isFileField &&
        !isFileListField &&
        !isDateField &&
        !isTimeField);

    if (isDropdownField) {
      // Same problem as the toggle, with an extra twist: `CustomDropdown`
      // upper-cases its display value, so a bound `{{previous.language}}` was
      // not merely un-editable — it rendered as `{{PREVIOUS.LANGUAGE}}` and
      // read like a broken token. A bound dropdown therefore shows the token
      // verbatim instead, and the picker's hand-written-expression mode stays
      // available for any value the option list does not enumerate.
      const isBoundSelect = typeof value === 'string' && containsToken(value);

      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                {isBoundSelect ? (
                  <div
                    className="w-full px-3 py-[7px] rounded-lg border border-white/[0.07] bg-[#070C17] flex items-center gap-2"
                    title={String(value)}
                  >
                    <Icons.Link2 className="w-3 h-3 text-cyan-400/70 shrink-0" />
                    <span className="truncate font-mono text-[11px] text-cyan-300/80">
                      {String(value)}
                    </span>
                  </div>
                ) : (
                  <CustomDropdown
                    value={String(value ?? '')}
                    options={config.options || []}
                    onChange={(next) => updateDraft(path, next)}
                    placeholder={`Select ${config.label || humanizeKey(key)}`}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpenVariablePickerKey(
                    openVariablePickerKey === pathKey ? null : pathKey
                  )
                }
                className={`p-1.5 rounded-md shrink-0 transition-all duration-150 ${
                  openVariablePickerKey === pathKey
                    ? 'bg-white/[0.07] text-slate-200'
                    : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.05]'
                }`}
                title="Bind a value from a previous step"
              >
                <Icons.Braces className="w-3 h-3" />
              </button>

              {isBoundSelect && (
                <button
                  type="button"
                  onClick={() => updateDraft(path, '')}
                  className="p-1.5 rounded-md shrink-0 text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] transition-all duration-150"
                  title="Clear binding"
                >
                  <Icons.X className="w-3 h-3" />
                </button>
              )}
            </div>

            <AnimatePresence>{renderVariablePicker(path)}</AnimatePresence>
          </div>

          {isBoundSelect && (
            <BindingPreview value={value} scope={effectivePreviewScope} />
          )}
        </FieldWrapper>
      );
    }

    if (uiType === 'field-select') {
      const fieldOptions = deriveFieldOptions(draft, effectivePreviewScope, datasetProperty);
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <FieldSelect
            value={String(value ?? '')}
            fieldOptions={fieldOptions}
            onChange={(next) => updateDraft(path, next)}
            placeholder={config.placeholder || `Select ${config.label || humanizeKey(key)}`}
          />
        </FieldWrapper>
      );
    }

    if (isDateField) {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <input
            ref={(el) => {
              inputRefs.current[pathKey] = el;
            }}
            type="date"
            value={formatDateForInput(value)}
            onChange={(e) => updateDraft(path, e.target.value)}
            className={textInputClasses}
            required={required}
          />
        </FieldWrapper>
      );
    }

    if (isTimeField) {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <input
            ref={(el) => {
              inputRefs.current[pathKey] = el;
            }}
            type="time"
            value={formatTimeForInput(value)}
            onChange={(e) => updateDraft(path, to12HourTime(e.target.value))}
            className={textInputClasses}
            required={required}
          />
        </FieldWrapper>
      );
    }

    if (isFileField) {
      const hasStoredName = typeof value === 'string' && value.trim() !== '';
      // When the prop isn't provided, default to "cached" so integrations that
      // don't wire hasSelectedFile never see a false warning.
      const fileIsCached = hasStoredName
        ? (hasSelectedFile?.(action?.id ?? '', pathKey) ?? true)
        : false;
      const fileIsWritable =
        hasStoredName && fileIsCached
          ? (hasWritableHandle?.(action?.id ?? '', pathKey) ?? false)
          : false;

      // Chromium path: pick via showOpenFilePicker and keep the handle, so the
      // executor can save updated workbooks back to this exact file. Write
      // permission is requested here, inside the user's click gesture — asking
      // later (mid-execution) can be blocked once the gesture has expired.
      const pickViaFileSystemAccess = async () => {
        try {
          const [handle] = await (window as any).showOpenFilePicker({ multiple: false });
          if (!handle) return;
          try {
            await handle.requestPermission?.({ mode: 'readwrite' });
          } catch {
            // Read-only is still usable — the executor falls back to a download.
          }
          const file: File = await handle.getFile();
          onFileSelected?.(action?.id ?? '', pathKey, file, handle as LocalFileHandle);
          updateDraft(path, file.name);
        } catch {
          // AbortError — the user cancelled the picker.
        }
      };

      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <div className="space-y-2">
            {supportsFileSystemAccess ? (
              <button
                type="button"
                onClick={pickViaFileSystemAccess}
                className={`${textInputClasses} flex items-center gap-2 text-left`}
              >
                <Icons.FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span
                  className={`truncate ${hasStoredName ? 'text-slate-200' : 'text-slate-500'}`}
                >
                  {hasStoredName ? String(value) : 'Choose a file…'}
                </span>
              </button>
            ) : (
              <input
                ref={(el) => {
                  inputRefs.current[pathKey] = el;
                }}
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  onFileSelected?.(action?.id ?? '', pathKey, file, null);
                  updateDraft(path, file ? file.name : '');
                  e.target.value = '';
                }}
                className={`${textInputClasses} pt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.06] file:px-2.5 file:py-1 file:text-[11px] file:font-medium file:text-slate-200 hover:file:bg-white/[0.09]`}
                required={required}
              />
            )}
            {hasStoredName && !fileIsCached ? (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-[10.5px] leading-snug text-amber-300/90">
                <Icons.AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                <span>
                  Saved as "{value}" — re-select the file before running.
                  Uploads aren't stored with saved workflows.
                </span>
              </div>
            ) : fileIsWritable ? (
              <div className="flex items-start gap-1.5 text-[10.5px] leading-snug text-emerald-400/80 pl-0.5">
                <Icons.HardDriveDownload className="w-3 h-3 shrink-0 mt-px" />
                <span>
                  Selected file: {value} — changes will be saved back to this
                  file. Keep it closed in Excel while the workflow runs.
                </span>
              </div>
            ) : (
              <div className="text-[10.5px] text-slate-500 pl-0.5">
                {hasStoredName
                  ? `Selected file: ${value} — updated copies will be downloaded`
                  : 'Choose a file from your device'}
              </div>
            )}
          </div>
        </FieldWrapper>
      );
    }

    if (isMultiSelectField) {
      const options = config.options || [];
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {options.map((option) => {
                const active = selectedValues.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? selectedValues.filter((item) => item !== option)
                        : [...selectedValues, option];
                      updateDraft(path, next);
                    }}
                    className={`
                      px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all duration-150
                      ${
                        active
                          ? 'bg-sky-500/15 text-sky-200 border-sky-500/25'
                          : 'bg-[#070C17] text-slate-400 border-white/[0.07] hover:border-white/[0.11] hover:text-slate-200'
                      }
                    `}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {options.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-[11px] text-slate-500">
                No options configured.
              </div>
            )}

            <div className="flex items-center justify-between text-[10.5px] text-slate-500">
              <span>{selectedValues.length} selected</span>
              <button
                type="button"
                onClick={() => updateDraft(path, [])}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </FieldWrapper>
      );
    }

    if (isUserListField) {
      const suggestions = (config.options || []).filter(
        (opt) => !selectedValues.includes(opt)
      );

      const addEmail = (raw: string) => {
        const v = raw.trim();
        if (!v || selectedValues.includes(v)) return;
        updateDraft(path, [...selectedValues, v]);
      };

      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <div className="space-y-2">
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedValues.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-sky-500/15 text-sky-200 border border-sky-500/25 text-[11px] font-medium"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft(
                          path,
                          selectedValues.filter((e) => e !== email)
                        )
                      }
                      className="p-0.5 rounded hover:bg-white/10 text-sky-300/80 hover:text-sky-100 transition-colors"
                      title="Remove"
                    >
                      <Icons.X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={(el) => {
                  tagInputRefs.current[pathKey] = el;
                }}
                type="email"
                placeholder="Type an email, then Enter to add"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addEmail(e.currentTarget.value);
                    e.currentTarget.value = '';
                  } else if (
                    e.key === 'Backspace' &&
                    !e.currentTarget.value &&
                    selectedValues.length
                  ) {
                    updateDraft(path, selectedValues.slice(0, -1));
                  }
                }}
                className={`${textInputClasses} flex-1`}
              />
              <button
                type="button"
                onClick={() => {
                  const el = tagInputRefs.current[pathKey];
                  if (!el) return;
                  addEmail(el.value);
                  el.value = '';
                  el.focus();
                }}
                className="shrink-0 inline-flex items-center px-3 h-[34px] rounded-lg border border-white/[0.07] bg-white/[0.03] text-[11px] font-medium text-slate-300 hover:border-white/[0.11] hover:text-slate-100 transition-colors"
              >
                Add
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {suggestions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => addEmail(opt)}
                    className="px-2.5 py-1 rounded-lg border border-dashed border-white/[0.1] text-[11px] text-slate-400 hover:text-slate-100 hover:border-white/[0.2] transition-colors"
                  >
                    + {opt}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-[10.5px] text-slate-500">
              <span>{selectedValues.length} selected</span>
              {selectedValues.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateDraft(path, [])}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </FieldWrapper>
      );
    }

    if (isFileListField) {
      const rows = attachmentRows.length > 0 ? attachmentRows : [];
      // When the field sets pathOnly, hide the File Name field and Browse button
      // and show only File Path (for backends that read a server-side path and
      // ignore browsed/uploaded content). The stored shape stays { fileName,
      // filePath } so the backend contract is unchanged; fileName just stays empty.
      const pathOnly = Boolean((config as any).pathOnly);
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <div className="space-y-3">
            {rows.map((row: any, index: number) => {
              const rowValue = isPlainObject(row) ? row : {};
              return (
                <div
                  key={`${pathKey}-${index}`}
                  className="rounded-xl border border-white/[0.06] bg-[#060B15] p-3 space-y-3"
                >
                  <div className="grid grid-cols-1 gap-2">
                    {!pathOnly && (
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">
                        File Name
                      </label>
                      <input
                        type="text"
                        value={String(rowValue.fileName ?? '')}
                        onChange={(e) => {
                          const next = [...rows];
                          next[index] = {
                            ...(isPlainObject(next[index]) ? next[index] : {}),
                            fileName: e.target.value,
                          };
                          updateDraft(path, next);
                        }}
                        className={textInputClasses}
                        placeholder="test.pdf"
                      />
                    </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">
                        File Path
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={String(rowValue.filePath ?? '')}
                          onChange={(e) => {
                            const next = [...rows];
                            next[index] = {
                              ...(isPlainObject(next[index]) ? next[index] : {}),
                              filePath: e.target.value,
                            };
                            updateDraft(path, next);
                          }}
                          className={`${textInputClasses} flex-1`}
                          placeholder="D:\\Rinky Pal\\test.pdf"
                        />
                        {!pathOnly && (
                        <label className="shrink-0 inline-flex items-center px-3 h-[34px] rounded-lg border border-white/[0.07] bg-white/[0.03] text-[11px] font-medium text-slate-300 hover:border-white/[0.11] hover:text-slate-100 cursor-pointer transition-colors">
                          Browse
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              if (!file) return;

                              onFileSelected?.(
                                action?.id ?? '',
                                `${pathKey}::${index}`,
                                file
                              );

                              const next = [...rows];
                              const existing = isPlainObject(next[index])
                                ? next[index]
                                : {};
                              next[index] = {
                                ...existing,
                                fileName: existing.fileName || file.name,
                              };
                              updateDraft(path, next);
                              // Allow re-picking the same file later.
                              e.target.value = '';
                            }}
                          />
                        </label>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-1 leading-snug pl-0.5">
                        {pathOnly
                          ? 'Enter the full path to a file the backend can read on its own machine.'
                          : 'Browse stores the filename here and sends the selected File to the executor for multipart upload.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] text-slate-500">
                      Attachment #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = rows.filter((_: any, i: number) => i !== index);
                        updateDraft(path, next);
                      }}
                      className="text-[10.5px] text-rose-300 hover:text-rose-200 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => updateDraft(path, [...rows, createEmptyAttachment()])}
              className="w-full h-[34px] rounded-lg border border-dashed border-white/[0.08] text-[11px] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-colors"
            >
              + Add Attachment
            </button>

            {rows.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-[11px] text-slate-500">
                No attachments added yet.
              </div>
            )}
          </div>
        </FieldWrapper>
      );
    }

    // ─── Structured controls ────────────────────────────────────────────────
    // Opt-in via `uiType`, so any action that does not declare one keeps
    // falling through to the JSON editor exactly as it did before.

    if (uiType === 'object-grid') {
      const rows = Array.isArray(value) ? (value as Record<string, any>[]) : [];
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <ObjectGrid
            rows={rows}
            itemSchema={(config.itemSchema || {}) as Record<string, GridColumnConfig>}
            addLabel={config.addLabel || 'Add Row'}
            onChange={(next) => updateDraft(path, next)}
            fieldOptions={deriveFieldOptions(draft, effectivePreviewScope, datasetProperty)}
            stacked={Boolean((config as any).stacked)}
          />
        </FieldWrapper>
      );
    }

    if (uiType === 'record-grid') {
      const rows = Array.isArray(value) ? (value as Record<string, any>[]) : [];
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <RecordGrid
            rows={rows}
            addLabel={config.addLabel || 'Add Record'}
            onChange={(next) => updateDraft(path, next)}
          />
        </FieldWrapper>
      );
    }

    if (uiType === 'key-value') {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <KeyValueBuilder
            value={isPlainObject(value) ? value : {}}
            keyLabel={config.keyLabel || 'Key'}
            valueLabel={config.valueLabel || 'Value'}
            addLabel={config.addLabel || 'Add Entry'}
            onChange={(next) => updateDraft(path, next)}
          />
        </FieldWrapper>
      );
    }

    if (uiType === 'string-list') {
      const items = Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <StringListBuilder
            items={items}
            addLabel={config.addLabel || 'Add Item'}
            placeholder={config.placeholder}
            onChange={(next) => updateDraft(path, next)}
          />
        </FieldWrapper>
      );
    }

    if (uiType === 'object-fields') {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <ObjectFields
            value={isPlainObject(value) ? value : {}}
            itemSchema={(config.itemSchema || {}) as Record<string, PropertyConfig>}
            onChange={(next) => updateDraft(path, next)}
          />
        </FieldWrapper>
      );
    }

    if (uiType === 'sql-editor') {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <SqlEditor
            value={String(value ?? '')}
            rows={config.rows || 10}
            placeholder={config.placeholder}
            hasError={Boolean(error)}
            onChange={(next) => updateDraft(path, next)}
          />
        </FieldWrapper>
      );
    }

    if (fieldType === 'password') {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <PasswordField
            value={String(value ?? '')}
            placeholder={config.placeholder}
            hasError={Boolean(error)}
            className={textInputClasses}
            onChange={(next) => updateDraft(path, next)}
          />
        </FieldWrapper>
      );
    }

    if (uiType === 'dataset-source') {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <DatasetSourceSelect
            value={typeof value === 'string' ? value : ''}
            groups={effectiveBindingGroups}
            scope={effectivePreviewScope}
            onChange={(next) => updateDraft(path, next)}
          />
          {typeof value === 'string' && containsToken(value) && (
            <BindingPreview value={value} scope={effectivePreviewScope} />
          )}
        </FieldWrapper>
      );
    }

    if (fieldType === 'object' || fieldType === 'array' || config.uiType === 'json-editor') {
      return (
        <FieldWrapper
          label={config.label || humanizeKey(key)}
          required={required}
          error={error}
          description={config.description}
        >
          <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-[#060B15]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05] bg-white/[0.015]">
              <div className="flex items-center gap-1.5">
                <Icons.Braces className="w-3 h-3 text-slate-600" />
                <span className="text-[9.5px] font-mono text-slate-600">
                  {config.label || humanizeKey(key)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* A dataset field is normally filled by binding an upstream
                    step, not by typing an array. Without this button there is
                    no way to discover or change which step feeds the node —
                    `showVariableButton` only fires for string-like types, and
                    the JSON editor is a separate render path that never reaches
                    it. */}
                <button
                  type="button"
                  onClick={() =>
                    setOpenVariablePickerKey(
                      openVariablePickerKey === pathKey ? null : pathKey
                    )
                  }
                  className={`px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider transition-all duration-150 flex items-center gap-1 ${
                    openVariablePickerKey === pathKey
                      ? 'bg-white/[0.07] text-slate-200'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.05]'
                  }`}
                  title="Bind a value from a previous step"
                >
                  <Icons.Link2 className="w-3 h-3" />
                  Bind
                </button>
                <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider">
                  JSON
                </span>
              </div>
            </div>
            {renderJsonEditor(path, config, value)}
            <AnimatePresence>{renderVariablePicker(path)}</AnimatePresence>
          </div>
          {/* Shows what the token actually resolves to, so "is this right?" is
              answerable without running the workflow. */}
          {typeof value === 'string' && containsToken(value) && (
            <BindingPreview value={value} scope={effectivePreviewScope} />
          )}
        </FieldWrapper>
      );
    }

    return (
      <FieldWrapper
        label={config.label || humanizeKey(key)}
        required={required}
        error={error}
        description={config.description}
      >
        <div className="relative">
          {fieldType === 'textarea' ? (
            <textarea
              ref={(el) => {
                inputRefs.current[pathKey] = el;
              }}
              value={String(value ?? '')}
              onChange={(e) => {
                updateDraft(path, e.target.value);
              }}
              placeholder={config.placeholder}
              rows={config.rows || 4}
              className={`${textareaClasses} ${showVariableButton ? 'pr-9' : ''}`}
              required={required}
            />
          ) : (
            <input
              ref={(el) => {
                inputRefs.current[pathKey] = el;
              }}
              // A bound numeric field falls back to a text input: `{{x}}` is a
              // string until it resolves, and a number input would drop it.
              type={
                fieldType === 'number' && !isBoundValue
                  ? 'number'
                  : fieldType === 'url'
                    ? 'url'
                    : fieldType === 'email'
                      ? 'email'
                      : 'text'
              }
              value={value ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const nextValue =
                  fieldType === 'number' && !containsToken(raw)
                    ? raw === ''
                      ? ''
                      : Number(raw)
                    : raw;
                updateDraft(path, nextValue);
              }}
              placeholder={config.placeholder}
              min={config.min}
              max={config.max}
              className={`${textInputClasses} ${showVariableButton ? 'pr-9' : ''}`}
              required={required}
            />
          )}

          {showVariableButton && (
            <button
              type="button"
              onClick={() => {
                setOpenVariablePickerKey(
                  openVariablePickerKey === pathKey ? null : pathKey
                );
              }}
              className={`absolute right-1.5 ${
                fieldType === 'textarea' ? 'top-2' : 'top-1/2 -translate-y-1/2'
              } p-1 rounded-md transition-all duration-150 ${
                openVariablePickerKey === pathKey
                  ? 'bg-white/[0.07] text-slate-200'
                  : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.05]'
              }`}
              title="Insert variable"
            >
              <Icons.Braces className="w-3 h-3" />
            </button>
          )}

          <AnimatePresence>
            {renderVariablePicker(path)}
          </AnimatePresence>
        </div>

        {/* Resolved-value preview: removes hidden mapping by showing exactly
            what this field becomes once bindings are resolved. */}
        {isBoundValue && (
          <BindingPreview value={value} scope={effectivePreviewScope} />
        )}
      </FieldWrapper>
    );
  };
  const renderNode = (
    key: string,
    node: PropertyNode,
    path: string[] = []
  ): React.ReactNode => {
    if (isHiddenField(key, node)) return null;
    const nextPath = [...path, key];
    const value = getValueAtPath(draft, nextPath);
    const nodeLabel = isFieldConfig(node)
      ? node.label || humanizeKey(key)
      : (node as any).label || humanizeKey(key);

    const isObjectGroup =
      isFieldConfig(node) &&
      node.type === 'object' &&
      node.uiType !== 'json-editor' &&
      (node.schema || isPlainObject(value));

    if (isFieldConfig(node) && !isObjectGroup) {
      return (
        <div key={pathToKey(nextPath)}>
          {renderPrimitiveField(key, node, nextPath, value)}
        </div>
      );
    }

    const childrenSource = isFieldConfig(node)
      ? node.schema || (isPlainObject(value) ? inferSchemaFromObject(value) : {})
      : node.schema
        ? (node.schema as Record<string, PropertyNode>)
        : getNodeChildren(node);

    const renderedChildren =
      Object.entries(childrenSource).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(childrenSource).map(([childKey, childNode]) => (
            <div key={pathToKey([...nextPath, childKey])}>
              {renderNode(childKey, childNode, nextPath)}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/[0.06] px-3 py-4 text-center text-[11px] text-slate-600">
          No nested fields
        </div>
      );

    return (
      <div
        key={pathToKey(nextPath)}
        className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.012]"
      >
        <div className="px-3 py-2.5 border-b border-white/[0.04] bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-[#070C17] border border-white/[0.07]">
              <Icons.Braces className="w-3 h-3 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-slate-200 truncate">
                {nodeLabel}
              </p>
              {node.description && (
                <p className="text-[10.5px] text-slate-500 mt-0.5">
                  {node.description}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="p-3">{renderedChildren}</div>
      </div>
    );
  };

  const tabs = [
    { id: 'properties', label: 'Setup', Icon: Icons.SlidersHorizontal },
    { id: 'advanced', label: 'Advanced', Icon: Icons.Settings2 },
    { id: 'validation', label: 'Check', Icon: Icons.Activity },
  ] as const;

  if (!isOpen || !action) return null;

  const actionIdShort = String((action as any)?.id ?? '').slice(0, 8);
  const hasBlockingErrors = Object.keys(jsonErrors).length > 0;

  return (
    <div
      className={`flex flex-col h-full bg-[#08101C] border-l border-white/[0.05] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-40 ${
        isOpen
          ? 'w-[340px] opacity-100 translate-x-0'
          : 'w-0 opacity-0 translate-x-8 overflow-hidden'
      } ${className}`}
      style={{
        boxShadow:
          '-12px 0 40px rgba(0,0,0,0.45), -1px 0 0 rgba(255,255,255,0.03)',
      }}
    >
      <div className="shrink-0 px-4 pt-4 pb-3.5 border-b border-white/[0.05]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background:
                  'linear-gradient(145deg, #111927 0%, #0C1520 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <ActionIcon className="w-4 h-4 text-slate-300" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-slate-100 leading-tight tracking-[-0.015em] truncate">
                {action.name}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-medium truncate">
                {actionTypeText || 'Action'}
              </p>
            </div>
          </div>

          <button
            onClick={onToggle}
            className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] rounded-lg transition-all duration-150 shrink-0 ml-2 active:scale-95"
          >
            <Icons.X className="w-3.5 h-3.5" />
          </button>
        </div>

        {action.description && (
          <p className="text-[11px] text-slate-500 mt-3 leading-[1.65] line-clamp-2">
            {action.description}
          </p>
        )}

        {isRestAction && (
          <div className="mt-3 rounded-lg border border-cyan-500/15 bg-cyan-500/8 px-3 py-2 text-[10.5px] text-cyan-200/80">
            REST integration detected. Edit the nested request sections below.
          </div>
        )}
      </div>

      <div
        className="shrink-0 flex items-center gap-0.5 px-2.5 py-2 border-b border-white/[0.05]"
        style={{ background: 'rgba(7,12,23,0.5)' }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                text-[11px] font-medium transition-all duration-200 select-none
                ${
                  active
                    ? 'text-slate-100'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                }
              `}
            >
              <tab.Icon
                className={`w-[13px] h-[13px] transition-colors duration-200 ${
                  active ? 'text-slate-300' : 'text-slate-600'
                }`}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {tab.label}
              {tab.id === 'validation' && validationIssues.length > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                  {validationIssues.length}
                </span>
              )}
              {active && (
                <motion.div
                  layoutId="panelActiveTab"
                  className="absolute inset-0 rounded-md -z-10"
                  style={{
                    background: 'rgba(255,255,255,0.065)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 3px rgba(0,0,0,0.3)',
                  }}
                  transition={SPRING_TABS}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto panel-scroll">
        <AnimatePresence mode="wait">
          {activeTab === 'properties' && (
            <motion.div
              key="properties"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="p-4 space-y-5"
            >
              <div className="relative">
                <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter settings…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="
                    w-full pl-8 pr-3 h-[34px] bg-[#070C17] text-slate-200 placeholder-slate-600 rounded-lg
                    border border-white/[0.07] hover:border-white/[0.11] focus:border-white/[0.15]
                    focus:ring-1 focus:ring-white/[0.05] focus:outline-none
                    text-[12px] transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]
                  "
                />
              </div>

              {Object.keys(visibleSchema).length > 0 ? (
                <div className="space-y-4">
                  {(() => {
                    // Render fields in author order, inserting a SectionHeader
                    // whenever the field's `group` changes. Fields without a
                    // group render with no header (unchanged behaviour), so only
                    // categories that opt in (e.g. Microsoft Teams) get sections.
                    const nodes: React.ReactNode[] = [];
                    let lastGroup: string | null = null;
                    Object.entries(visibleSchema).forEach(([key, node], index) => {
                      if (isHiddenField(key, node)) return;
                      const group =
                        isFieldConfig(node) && (node as any).group
                          ? String((node as any).group)
                          : null;
                      if (group && group !== lastGroup) {
                        const GroupIcon = groupIconFor(group);
                        nodes.push(
                          <div
                            key={`__group_${group}_${index}`}
                            className={index === 0 ? '' : 'pt-1'}
                          >
                            <SectionHeader icon={GroupIcon} label={group} />
                          </div>
                        );
                      }
                      lastGroup = group;
                      nodes.push(renderNode(key, node));
                    });
                    return nodes;
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div
                    className="w-10 h-10 rounded-xl border border-white/[0.06] flex items-center justify-center mb-3"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.03)',
                    }}
                  >
                    <Icons.SlidersHorizontal className="w-4 h-4 text-slate-600" />
                  </div>
                  <p className="text-[12px] font-medium text-slate-400">
                    No properties found
                  </p>
                  <p className="text-[10.5px] text-slate-600 mt-1">
                    Try a different search term
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'advanced' && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="p-4 space-y-5"
            >
              <section>
                <SectionHeader
                  icon={Icons.Zap}
                  label="Execution"
                  iconClass="text-amber-400/70"
                />
                <div
                  className="rounded-xl border border-white/[0.05] overflow-hidden"
                  style={{ background: 'rgba(7,12,23,0.6)' }}
                >
                  <div className="divide-y divide-white/[0.04]">
                    <div className="px-3 py-3 space-y-1.5">
                      <label className="block text-[10.5px] font-medium text-slate-500">
                        Retry Attempts
                      </label>
                      <input
                        type="number"
                        value={draft.retryCount ?? 0}
                        onChange={(e) =>
                          updateDraft(['retryCount'], Number(e.target.value))
                        }
                        min="0"
                        max="10"
                        className="
                          w-full px-3 h-[34px] bg-[#070C17] text-slate-200 text-[12px] rounded-lg border
                          border-white/[0.07] hover:border-white/[0.11] focus:border-white/[0.15]
                          focus:ring-1 focus:ring-white/[0.05] focus:outline-none
                          transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]
                        "
                      />
                    </div>
                    <div className="px-3 py-3 space-y-1.5">
                      <label className="block text-[10.5px] font-medium text-slate-500">
                        Timeout (ms)
                      </label>
                      <input
                        type="number"
                        value={draft.timeout ?? 5000}
                        onChange={(e) =>
                          updateDraft(['timeout'], Number(e.target.value))
                        }
                        min="1000"
                        max="300000"
                        className="
                          w-full px-3 h-[34px] bg-[#070C17] text-slate-200 text-[12px] rounded-lg border
                          border-white/[0.07] hover:border-white/[0.11] focus:border-white/[0.15]
                          focus:ring-1 focus:ring-white/[0.05] focus:outline-none
                          transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]
                        "
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <SectionHeader
                  icon={Icons.ShieldAlert}
                  label="Resilience"
                  iconClass="text-emerald-400/70"
                />
                <div className="space-y-2">
                  {[
                    {
                      key: 'continueOnError',
                      label: 'Continue on Error',
                      description: "Don't stop workflow if this fails",
                      accent:
                        'peer-checked:bg-[#0D3525] peer-checked:border-emerald-600/50 peer-checked:after:bg-emerald-300',
                    },
                    {
                      key: 'enableLogging',
                      label: 'Verbose Logging',
                      description: 'Write detailed steps to console',
                      accent:
                        'peer-checked:bg-[#0E3A5C] peer-checked:border-sky-600/50 peer-checked:after:bg-sky-300',
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/[0.05] bg-white/[0.012] hover:bg-white/[0.02] hover:border-white/[0.08] transition-all duration-200"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="text-[12px] font-medium text-slate-200 leading-tight">
                          {item.label}
                        </p>
                        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                          {item.description}
                        </p>
                      </div>
                      <PremiumToggle
                        checked={Boolean(draft[item.key])}
                        onChange={(v) => updateDraft([item.key], v)}
                        accentClass={item.accent}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <SectionHeader
                  icon={Icons.Braces}
                  label="Raw Properties"
                  iconClass="text-violet-400/70"
                />
                <div
                  className="rounded-xl border border-white/[0.06] overflow-hidden"
                  style={{
                    background: '#060B15',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.025)',
                  }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]"
                    style={{ background: 'rgba(255,255,255,0.015)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white/[0.06]" />
                      <span className="text-[9.5px] font-mono text-slate-600">
                        properties.json
                      </span>
                    </div>
                    <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider">
                      JSON
                    </span>
                  </div>

                  <textarea
                    value={rawJsonDraft !== null ? rawJsonDraft : stringifyJson(draft)}
                    onFocus={() => {
                      if (rawJsonDraft === null) setRawJsonDraft(stringifyJson(draft));
                    }}
                    onChange={(e) => {
                      const text = e.target.value;
                      setRawJsonDraft(text);
                      setHasUnsavedChanges(true);
                      try {
                        const parsed = JSON.parse(text);
                        if (!isPlainObject(parsed)) {
                          throw new Error('Root must be an object');
                        }
                        setDraft(parsed);
                        setJsonErrors((prev) => {
                          const next = { ...prev };
                          delete next.__raw__;
                          return next;
                        });
                      } catch {
                        setJsonErrors((prev) => ({
                          ...prev,
                          __raw__: 'Invalid JSON — root must be an object',
                        }));
                      }
                    }}
                    onBlur={() => {
                      // Re-sync the buffer to the canonical draft only when it is valid,
                      // so invalid text stays visible for the user to fix.
                      setRawJsonDraft((curr) => {
                        if (curr === null) return null;
                        try {
                          const parsed = JSON.parse(curr);
                          return isPlainObject(parsed) ? null : curr;
                        } catch {
                          return curr;
                        }
                      });
                    }}
                    spellCheck={false}
                    rows={10}
                    className={`
                      w-full px-3.5 py-3 font-mono text-[11px] leading-[1.75]
                      bg-transparent focus:outline-none resize-y
                      ${jsonErrors.__raw__ ? 'text-rose-300/80' : 'text-cyan-300/75'}
                    `}
                    style={{ caretColor: '#67e8f9' }}
                  />

                  <AnimatePresence>
                    {jsonErrors.__raw__ && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="px-3 py-2 border-t border-rose-500/15 flex items-center gap-1.5"
                        style={{ background: 'rgba(239,68,68,0.04)' }}
                      >
                        <Icons.AlertCircle className="w-3 h-3 text-rose-400/70 shrink-0" />
                        <span className="text-[10.5px] text-rose-400/70">
                          {jsonErrors.__raw__}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'validation' && (
            <motion.div
              key="validation"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="p-4 space-y-5"
            >
              <section>
                <SectionHeader
                  icon={Icons.ShieldCheck}
                  label="Pre-flight Check"
                  iconClass="text-slate-400"
                />
                <div className="rounded-xl border border-white/[0.05] overflow-hidden">
                  <div
                    className="px-3.5 py-2 flex items-center justify-between border-b border-white/[0.04]"
                    style={{ background: 'rgba(7,12,23,0.7)' }}
                  >
                    <p className="text-[10.5px] text-slate-500">
                      Verifying action configuration
                    </p>
                    {validationIssues.length === 0 ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.14]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                        <span className="text-[9px] font-semibold text-emerald-400/80 uppercase tracking-wide">
                          All clear
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/[0.08] border border-rose-500/[0.14]">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400/80" />
                        <span className="text-[9px] font-semibold text-rose-400/80 uppercase tracking-wide">
                          {validationIssues.length} issue
                          {validationIssues.length !== 1 ? 's' : ''}
                        </span>
                      </span>
                    )}
                  </div>

                  {validationIssues.length === 0 ? (
                    <div className="p-5 text-center text-[11px] text-slate-600">
                      No validation issues found.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.03]">
                      {validationIssues.map((issue) => (
                        <div
                          key={issue.pathKey}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-4 hover:bg-white/[0.015] transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-[11.5px] font-medium text-slate-300 truncate">
                              {issue.label}
                            </p>
                            <p className="text-[10.5px] text-slate-600">
                              {issue.message}
                            </p>
                          </div>
                          <span className="text-[9px] font-mono text-slate-600 shrink-0">
                            {issue.pathKey}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <SectionHeader
                  icon={Icons.TerminalSquare}
                  label="Sandbox"
                  iconClass="text-blue-400/70"
                />
                <button
                  className="w-full py-2.5 rounded-xl border border-white/[0.07] hover:border-white/[0.11] text-slate-300 hover:text-slate-100 text-[12px] font-medium flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] group"
                  style={{ background: 'rgba(255,255,255,0.025)' }}
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center bg-blue-500/[0.1] border border-blue-500/[0.2] group-hover:bg-blue-500/[0.15] transition-colors">
                    <Icons.Play className="w-2.5 h-2.5 text-blue-400" />
                  </div>
                  Run Test Execution
                </button>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className="shrink-0 px-4 py-3 border-t border-white/[0.05] flex items-center justify-between"
        style={{ background: 'rgba(7,12,23,0.6)' }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Icons.Fingerprint className="w-3 h-3 text-slate-700" />
            <span className="text-[9px] text-slate-600 font-mono tracking-wider">
              {actionIdShort || 'NO-ID'}
            </span>
          </div>

          <div className="h-4 flex items-center pl-4">
            {hasUnsavedChanges ? (
              hasBlockingErrors ? (
                <div className="flex items-center gap-1.5 text-rose-400/70">
                  <Icons.AlertCircle className="w-3 h-3" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em]">
                    Fix errors to save
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-500/60">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.1em]">
                    Saving…
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-1 text-emerald-600/60">
                <Icons.CheckCircle2 className="w-3 h-3" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em]">
                  Saved
                </span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onToggle}
          className="px-4 py-1.5 rounded-lg text-[11.5px] font-medium text-slate-300 hover:text-slate-100 transition-all duration-200 active:scale-[0.97] border border-white/[0.07] hover:border-white/[0.12]"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          Done
        </button>
      </div>

      <style>{`
        .panel-scroll::-webkit-scrollbar { width: 3px; }
        .panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 3px; }
        .panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
        .panel-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.05) transparent; }
      `}</style>
    </div>
  );
};

export default PropertiesPanel;