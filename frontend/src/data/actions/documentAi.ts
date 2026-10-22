/**
 * Document AI workflow actions.
 *
 * Source of truth:
 * - OCR is implemented by modules/automation-ai-services in Products Engine v11.4.
 * - Summarisation/transcription contracts are preserved here for UI continuity,
 *   but the certified v11.4 engine intentionally does not register those routes
 *   because their Python side-car runtimes are not shipped.
 *
 * Keeping unavailable actions visible is deliberate: authors can design around
 * the package without the UI pretending a backend route exists when it does not.
 */

import type { AutomationCategory } from '../../types/workflow';
import type { OutputField, OutputSchema } from '../../types/pluginContract';

const ENGINE_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_ENGINE_URL) ||
  'http://localhost:8080/engine';

export const DOCUMENT_AI_CATEGORY_ID = 'document-ai-042';

const OCR_PAGE_FIELDS: OutputField[] = [
  { path: 'pageNumber', label: 'Page Number', kind: 'number', visibility: 'primary' },
  { path: 'text', label: 'Page Text', kind: 'string', visibility: 'primary' },
  { path: 'source', label: 'Text Source', kind: 'string', visibility: 'secondary' },
  { path: 'confidence', label: 'Page Confidence', kind: 'number', visibility: 'primary' },
  { path: 'language', label: 'Page Language', kind: 'string', visibility: 'secondary' },
  { path: 'wordCount', label: 'Word Count', kind: 'number', visibility: 'secondary' },
  { path: 'skewAngleCorrected', label: 'Skew Corrected', kind: 'number', visibility: 'technical' },
  { path: 'rotationApplied', label: 'Rotation Applied', kind: 'number', visibility: 'technical' },
  { path: 'processingTimeMs', label: 'Page Processing Time (ms)', kind: 'number', visibility: 'technical' },
  { path: 'tables', label: 'Tables', kind: 'array', visibility: 'secondary' },
  { path: 'barcodes', label: 'Barcodes', kind: 'array', visibility: 'secondary' },
];

const OCR_OUTPUT_SCHEMA: OutputSchema = {
  version: '1.0',
  envelope: 'data',
  producesDataSet: false,
  notes:
    'Unified OCR result for images and PDFs. extractedText is the main business output; per-page diagnostics stay available for advanced workflows.',
  fields: [
    { path: 'status', label: 'OCR Status', kind: 'string', visibility: 'primary', example: 'SUCCESS' },
    { path: 'extractedText', label: 'Extracted Text', kind: 'string', visibility: 'primary' },
    { path: 'confidence', label: 'Confidence', kind: 'number', visibility: 'primary' },
    { path: 'languageUsed', label: 'Language Used', kind: 'string', visibility: 'primary', example: 'eng' },
    { path: 'detectedLanguages', label: 'Detected Languages', kind: 'array', visibility: 'secondary' },
    { path: 'documentKind', label: 'Document Kind', kind: 'string', visibility: 'primary', example: 'PDF_SCANNED' },
    { path: 'pageCount', label: 'Page Count', kind: 'number', visibility: 'primary' },
    { path: 'fileName', label: 'File Name', kind: 'string', visibility: 'secondary' },
    { path: 'fileSizeBytes', label: 'File Size (bytes)', kind: 'number', visibility: 'technical' },
    { path: 'processingTimeMs', label: 'Processing Time (ms)', kind: 'number', visibility: 'technical' },
    { path: 'pages', label: 'Pages', kind: 'array', visibility: 'secondary', itemFields: OCR_PAGE_FIELDS },
    { path: 'warnings', label: 'Warnings', kind: 'array', visibility: 'technical' },
    { path: 'errors', label: 'Errors', kind: 'array', visibility: 'technical' },
  ],
};

const SUMMARY_OUTPUT_SCHEMA: OutputSchema = {
  version: '1.0',
  envelope: 'data',
  producesDataSet: false,
  fields: [
    { path: 'summary', label: 'Summary', kind: 'string', visibility: 'primary' },
    { path: 'summaryType', label: 'Summary Type', kind: 'string', visibility: 'secondary' },
    { path: 'sourceCharacters', label: 'Source Characters', kind: 'number', visibility: 'secondary' },
    { path: 'processingTimeMs', label: 'Processing Time (ms)', kind: 'number', visibility: 'technical' },
  ],
};

const TRANSCRIPTION_OUTPUT_SCHEMA: OutputSchema = {
  version: '1.0',
  envelope: 'data',
  producesDataSet: false,
  fields: [
    { path: 'fileName', label: 'File Name', kind: 'string', visibility: 'secondary' },
    { path: 'transcriptionText', label: 'Transcription Text', kind: 'string', visibility: 'primary' },
    { path: 'processingTimeMs', label: 'Processing Time (ms)', kind: 'number', visibility: 'technical' },
  ],
};


export const DOCUMENT_AI_CATEGORY: AutomationCategory = {
  id: DOCUMENT_AI_CATEGORY_ID,
  name: 'Document AI',
  icon: 'ScanText',
  color: 'bg-cyan-600',
  description:
    'Extract text from documents, summarise content, and transcribe audio/video as workflow actions.',
  metadata: {
    tags: ['document-ai', 'ocr', 'summarization', 'summarisation', 'transcription', 'ai'],
    featured: true,
    popularityScore: 96,
    order: 42,
    group: 'AI & Document Processing',
  },
  ui: {
    gradient: 'from-cyan-500/20 to-indigo-600/10',
    iconBg: 'bg-cyan-500/10',
    borderGlow: true,
    cardStyle: 'premium',
  },
  control: {
    enabled: true,
    version: '1.0.0',
    availability: { state: 'available' },
  },
  actions: [
    {
      type: 'document-ai-ocr-extract',
      category: DOCUMENT_AI_CATEGORY_ID,
      name: 'OCR Extract',
      logo: 'OCR.png',
      description:
        'Extract text from PDF or image files with per-page confidence, language, table and barcode details.',
      icon: 'ScanText',
      color: 'bg-cyan-500',
      tags: ['ocr', 'pdf', 'image', 'text-extraction', 'tesseract'],
      complexity: 'intermediate',
      estimatedTime: 3000,
      supportsStreaming: false,
      requiresAuth: false,
      retryable: true,
      timeout: 300000,
      availability: { state: 'available' },
      api: {
        url: `${ENGINE_BASE}/api/ocr/extract`,
        method: 'POST',
        bodyType: 'form-data',
        body: {
          file: '{{file}}',
          language: '{{language}}',
          extractTables: '{{extractTables}}',
          decodeBarcodes: '{{decodeBarcodes}}',
          reflowProse: '{{reflowProse}}',
        },
      },
      properties: {
        file: null,
        language: '',
        extractTables: false,
        decodeBarcodes: false,
        reflowProse: false,
      },
      propertyConfig: {
        file: {
          type: 'file',
          label: 'Document File',
          required: true,
          uiType: 'file',
          group: 'Document',
          description: 'PDF, PNG, JPEG, TIFF or BMP file to process.',
        },
        language: {
          type: 'string',
          label: 'OCR Language',
          required: false,
          uiType: 'input',
          group: 'Recognition',
          placeholder: 'eng',
          description: 'Optional Tesseract language code. Leave blank to use the backend default/auto-detection rules.',
        },
        extractTables: {
          type: 'boolean',
          label: 'Extract Tables',
          required: false,
          uiType: 'input',
          group: 'Analysis',
        },
        decodeBarcodes: {
          type: 'boolean',
          label: 'Decode Barcodes / QR',
          required: false,
          uiType: 'input',
          group: 'Analysis',
        },
        reflowProse: {
          type: 'boolean',
          label: 'Reflow Prose',
          required: false,
          uiType: 'input',
          group: 'Text',
          description: 'Normalize line breaks when the content is primarily prose.',
        },
      },
      outputSchema: OCR_OUTPUT_SCHEMA,
    },
    {
      type: 'document-ai-summarize-text',
      category: DOCUMENT_AI_CATEGORY_ID,
      name: 'Summarize Text',
      logo: 'SummerizeText.png',
      description: 'Summarise text as a short, detailed or bullet-point summary.',
      icon: 'AlignLeft',
      color: 'bg-indigo-500',
      tags: ['summary', 'summarization', 'text', 'llm'],
      complexity: 'basic',
      estimatedTime: 2500,
      supportsStreaming: false,
      requiresAuth: false,
      retryable: true,
      timeout: 300000,
      availability: { state: 'unavailable', code: 'BACKEND_DEFERRED', reason: 'Backend implementation deferred for a later phase.' },
      api: {
        url: `${ENGINE_BASE}/api/summarize/text`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyType: 'json',
        body: {
          text: '{{text}}',
          summaryType: '{{summaryType}}',
        },
      },
      properties: {
        text: '{{previous.extractedText}}',
        summaryType: 'SHORT',
      },
      propertyConfig: {
        text: {
          type: 'string',
          label: 'Text',
          required: true,
          uiType: 'textarea',
          group: 'Source',
          placeholder: '{{previous.extractedText}}',
        },
        summaryType: {
          type: 'string',
          label: 'Summary Type',
          required: true,
          uiType: 'select',
          options: ['SHORT', 'DETAILED', 'BULLETS'],
          group: 'Summary',
        },
      },
      outputSchema: SUMMARY_OUTPUT_SCHEMA,
    },
    {
      type: 'document-ai-summarize-pdf',
      category: DOCUMENT_AI_CATEGORY_ID,
      name: 'Summarize PDF',
      logo: 'SummerizePDF.png',
      description: 'Extract document text through OCR when needed, then generate a summary.',
      icon: 'FileText',
      color: 'bg-violet-500',
      tags: ['summary', 'pdf', 'ocr', 'document'],
      complexity: 'intermediate',
      estimatedTime: 5000,
      supportsStreaming: false,
      requiresAuth: false,
      retryable: true,
      timeout: 300000,
      availability: { state: 'unavailable', code: 'BACKEND_DEFERRED', reason: 'Backend implementation deferred for a later phase.' },
      api: {
        url: `${ENGINE_BASE}/api/summarize/pdf`,
        method: 'POST',
        bodyType: 'form-data',
        body: {
          file: '{{file}}',
          summaryType: '{{summaryType}}',
        },
      },
      properties: {
        file: null,
        summaryType: 'SHORT',
      },
      propertyConfig: {
        file: {
          type: 'file',
          label: 'PDF File',
          required: true,
          uiType: 'file',
          group: 'Source',
        },
        summaryType: {
          type: 'string',
          label: 'Summary Type',
          required: true,
          uiType: 'select',
          options: ['SHORT', 'DETAILED', 'BULLETS'],
          group: 'Summary',
        },
      },
      outputSchema: SUMMARY_OUTPUT_SCHEMA,
    },
    {
      type: 'document-ai-transcribe',
      category: DOCUMENT_AI_CATEGORY_ID,
      name: 'Transcribe Audio / Video',
      logo: 'transcription.png',
      description: 'Convert uploaded audio or video speech into workflow text.',
      icon: 'AudioLines',
      color: 'bg-fuchsia-500',
      tags: ['transcription', 'speech-to-text', 'audio', 'video'],
      complexity: 'intermediate',
      estimatedTime: 5000,
      supportsStreaming: false,
      requiresAuth: false,
      retryable: true,
      timeout: 600000,
      availability: { state: 'unavailable', code: 'BACKEND_DEFERRED', reason: 'Backend implementation deferred for a later phase.' },
      api: {
        url: `${ENGINE_BASE}/api/transcription/upload`,
        method: 'POST',
        bodyType: 'form-data',
        body: {
          file: '{{file}}',
        },
      },
      properties: {
        file: null,
      },
      propertyConfig: {
        file: {
          type: 'file',
          label: 'Audio / Video File',
          required: true,
          uiType: 'file',
          group: 'Source',
          description: 'Audio/video upload. Backend availability also depends on its speech runtime and ffmpeg for video.',
        },
      },
      outputSchema: TRANSCRIPTION_OUTPUT_SCHEMA,
    },
  ],
};
